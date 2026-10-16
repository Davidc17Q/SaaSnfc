-- Esquema de la plataforma SaaS NFC B2B
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Empresas (tenants). Cada empresa agrupa sus propias sedes y usuarios.
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE NOT NULL,       -- identificador legible (ej: hogar-y-moda)
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuarios del panel. company_id NULL = superadmin (ve todo).
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,            -- scrypt: salt:hash (hex)
  role          TEXT        NOT NULL DEFAULT 'company_admin', -- superadmin | company_admin
  company_id    UUID        REFERENCES companies(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sedes / tiendas del cliente corporativo
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  brand       TEXT        NOT NULL,              -- Marca / cadena a la que pertenece
  city        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active', -- active | inactive
  company_id  UUID        REFERENCES companies(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración segura: añadir company_id a bases existentes
ALTER TABLE locations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Puntos / dispositivos NFC físicos
CREATE TABLE IF NOT EXISTS devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        UNIQUE,                -- código corto para la URL (ej: k9X2pQ8m)
  location_id UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,              -- Ej: "Entrada principal"
  target_url  TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración segura: añadir code a bases existentes
ALTER TABLE devices ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

-- Pantalla de transición (carga animada) antes de redirigir. Solo superadmin
-- la controla. Por defecto desactivada (redirección 302 instantánea).
ALTER TABLE devices ADD COLUMN IF NOT EXISTS transition BOOLEAN NOT NULL DEFAULT false;

-- Eventos de escaneo NFC (analítica)
CREATE TABLE IF NOT EXISTS scan_events (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  location_id UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  os          TEXT        NOT NULL,              -- iOS | Android | Other
  channel     TEXT        NOT NULL DEFAULT 'Otro', -- WhatsApp | Instagram | Google Reviews | ...
  user_agent  TEXT,
  ip          TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración segura para bases existentes
ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'Otro';

-- Historial de campañas / cambios masivos de destino (para poder revertir)
CREATE TABLE IF NOT EXISTS bulk_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT        NOT NULL,              -- all | brand | location
  scope_label TEXT        NOT NULL,              -- descripción legible del alcance
  new_url     TEXT        NOT NULL,
  affected    INT         NOT NULL DEFAULT 0,
  -- snapshot previo: [{ device_id, target_url }] para revertir
  snapshot    JSONB       NOT NULL DEFAULT '[]',
  reverted    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_created ON bulk_updates(created_at DESC);

-- Histórico de reputación de Google por sede (medición periódica).
-- Guarda la nota (rating) y el número de reseñas en una fecha, para dibujar la
-- evolución en el tiempo. Al inicio se carga manualmente (solo superadmin);
-- más adelante puede alimentarse automáticamente desde Google Places API.
CREATE TABLE IF NOT EXISTS reputation_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  rating        NUMERIC(2,1) NOT NULL,            -- 0.0 a 5.0
  review_count  INT         NOT NULL DEFAULT 0,   -- total de reseñas en Google
  measured_on   DATE        NOT NULL DEFAULT CURRENT_DATE, -- fecha de la medición
  source        TEXT        NOT NULL DEFAULT 'manual',     -- manual | google
  note          TEXT,                                      -- comentario opcional
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una sola medición por sede y día (reejecutar actualiza, no duplica).
  UNIQUE (location_id, measured_on)
);
CREATE INDEX IF NOT EXISTS idx_reputation_location ON reputation_snapshots(location_id, measured_on);

CREATE INDEX IF NOT EXISTS idx_devices_location   ON devices(location_id);
CREATE INDEX IF NOT EXISTS idx_devices_code        ON devices(code);
CREATE INDEX IF NOT EXISTS idx_scan_device        ON scan_events(device_id);
CREATE INDEX IF NOT EXISTS idx_scan_location      ON scan_events(location_id);
CREATE INDEX IF NOT EXISTS idx_scan_scanned_at    ON scan_events(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_os            ON scan_events(os);
CREATE INDEX IF NOT EXISTS idx_scan_channel       ON scan_events(channel);
CREATE INDEX IF NOT EXISTS idx_locations_company  ON locations(company_id);
CREATE INDEX IF NOT EXISTS idx_users_company      ON users(company_id);

-- ============================================================================
-- BACKFILL MULTI-EMPRESA (idempotente y a prueba de colisiones de slug)
-- Crea una empresa por cada marca distinta y asigna las sedes sin empresa.
--
-- Por qué esta versión: el backfill anterior fallaba por el UNIQUE de
-- companies.slug cuando dos marcas distintas normalizaban al MISMO slug
-- (p. ej. "Hogar y Moda" vs "Hogar  y  Moda", o marcas sin caracteres
-- alfanuméricos que colapsaban a slug vacío). Aquí:
--   1) normalizamos el slug con trim de guiones sobrantes y fallback no vacío;
--   2) deduplicamos por slug ANTES de insertar (una fila por slug);
--   3) resolvemos colisiones añadiendo un sufijo corto y estable derivado del
--      nombre, de modo que marcas diferentes nunca choquen;
--   4) ON CONFLICT DO NOTHING hace el INSERT idempotente ante reejecuciones.
-- ============================================================================

-- Función estable de slug: minúsculas, no alfanumérico -> '-', sin guiones
-- en los extremos, y 'empresa' como fallback si queda vacío.
CREATE OR REPLACE FUNCTION nfc_slugify(txt TEXT) RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(trim(BOTH '-' FROM lower(regexp_replace(COALESCE(txt, ''), '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'empresa'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Inserta UNA empresa por cada marca distinta (name = brand). El slug es
-- determinista por nombre y globalmente único sin depender del orden:
--   * si la marca ya es empresa, se omite (NOT EXISTS) -> idempotente;
--   * el slug base es nfc_slugify(brand); si ese slug base lo comparten varias
--     marcas distintas (o ya está tomado en BD), TODAS esas marcas usan un
--     sufijo md5 corto del nombre, que es único por nombre. La marca cuyo slug
--     base queda libre y sin ambigüedad lo usa limpio.
-- Como el sufijo depende solo del nombre (no del orden ni de filas vecinas), el
-- resultado es estable corrida tras corrida. ON CONFLICT cubre cualquier resto.
INSERT INTO companies (name, slug)
SELECT brand,
       CASE
         WHEN base_dupes > 1 OR base_taken THEN base_slug || '-' || substr(md5(brand), 1, 6)
         ELSE base_slug
       END AS slug
  FROM (
    SELECT nb.brand,
           nfc_slugify(nb.brand) AS base_slug,
           COUNT(*) OVER (PARTITION BY nfc_slugify(nb.brand)) AS base_dupes,
           EXISTS (SELECT 1 FROM companies c WHERE c.slug = nfc_slugify(nb.brand)) AS base_taken
      FROM (
        SELECT DISTINCT brand FROM locations
         WHERE brand IS NOT NULL AND brand <> ''
           AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = locations.brand)
      ) nb
  ) ranked
ON CONFLICT (slug) DO NOTHING;

-- Asignar cada sede sin empresa a la que corresponde a su marca.
-- El join por nombre de marca es exacto (una empresa por marca distinta).
UPDATE locations l
   SET company_id = c.id
  FROM companies c
 WHERE l.company_id IS NULL
   AND c.name = l.brand;

-- ============================================================================
-- FUNCIÓN 1: Calificación interna por aspectos (encuestas propias por punto)
--
-- Un punto NFC/QR puede operar en modo 'redirect' (comportamiento actual) o
-- 'survey' (muestra una encuesta corta y anónima en vez de redirigir). Ambos
-- modos son EXCLUYENTES por punto. Todo es aditivo e idempotente para no romper
-- bases existentes. El orden importa: survey_templates se crea ANTES de la FK
-- de devices que la referencia.
-- ============================================================================

-- Plantilla de encuesta por empresa (define los aspectos a calificar y la escala).
CREATE TABLE IF NOT EXISTS survey_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,              -- Ej: "Satisfacción spa"
  scale_max   INT         NOT NULL DEFAULT 5,    -- escala 1..scale_max (por defecto 1-5)
  status      TEXT        NOT NULL DEFAULT 'active', -- active | inactive
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aspectos a calificar dentro de una plantilla (ej: atención, limpieza, espera).
CREATE TABLE IF NOT EXISTS survey_aspects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  position    INT         NOT NULL DEFAULT 0,    -- orden de presentación
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Respuesta anónima a una encuesta (una por envío). Se registra por sede/punto,
-- igual que los escaneos, para poder medir y comparar después.
CREATE TABLE IF NOT EXISTS survey_responses (
  id           BIGSERIAL PRIMARY KEY,
  device_id    UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  location_id  UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  template_id  UUID        NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  comment      TEXT,                              -- comentario libre y opcional
  ip           TEXT,                              -- solo para anti-doble-conteo
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nota (rating) por aspecto dentro de una respuesta.
CREATE TABLE IF NOT EXISTS survey_answers (
  id          BIGSERIAL PRIMARY KEY,
  response_id BIGINT      NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  aspect_id   UUID        NOT NULL REFERENCES survey_aspects(id) ON DELETE CASCADE,
  rating      SMALLINT    NOT NULL               -- 1..scale_max de la plantilla
);

-- Modo del punto: 'redirect' (actual) o 'survey'. Excluyentes.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'redirect';
-- Plantilla de encuesta asociada cuando el modo es 'survey'.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS survey_template_id UUID;

-- FK idempotente de devices.survey_template_id (survey_templates ya existe arriba).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_survey_template_fk') THEN
    ALTER TABLE devices
      ADD CONSTRAINT devices_survey_template_fk
      FOREIGN KEY (survey_template_id) REFERENCES survey_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índices de la Función 1
CREATE INDEX IF NOT EXISTS idx_survey_aspects_template   ON survey_aspects(template_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_location ON survey_responses(location_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_template ON survey_responses(template_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_date     ON survey_responses(submitted_at);
CREATE INDEX IF NOT EXISTS idx_survey_responses_device   ON survey_responses(device_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response   ON survey_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_aspect     ON survey_answers(aspect_id);
CREATE INDEX IF NOT EXISTS idx_devices_survey_template   ON devices(survey_template_id);

-- ============================================================================
-- INFORMES PROGRAMADOS POR CORREO (Función 2, Fase B)
-- Cada fila es un envío automático recurrente de un informe a un destinatario.
-- Un worker revisa periódicamente las filas con next_run_at vencido, envía el
-- informe del periodo correspondiente y reprograma next_run_at. Persistir la
-- programación (en vez de un setInterval en memoria) la hace sobrevivir a los
-- reinicios del proceso (Railway reinicia contenedores).
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id  UUID        REFERENCES locations(id) ON DELETE CASCADE, -- NULL = todas las sedes
  email        TEXT        NOT NULL,                 -- destinatario (gerente/directivo)
  frequency    TEXT        NOT NULL DEFAULT 'monthly', -- 'monthly' | 'weekly'
  active       BOOLEAN     NOT NULL DEFAULT true,
  next_run_at  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- próximo envío programado
  last_run_at  TIMESTAMPTZ,                          -- último envío realizado
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_schedules_company ON report_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_due     ON report_schedules(active, next_run_at);
