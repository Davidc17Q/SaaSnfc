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
-- BACKFILL MULTI-EMPRESA (idempotente y seguro para datos existentes)
-- Crea una empresa por cada marca distinta y asigna las sedes sin empresa.
-- ============================================================================
INSERT INTO companies (name, slug)
SELECT DISTINCT l.brand,
       lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'))
  FROM locations l
 WHERE l.brand IS NOT NULL AND l.brand <> ''
   AND NOT EXISTS (
     SELECT 1 FROM companies c
      WHERE c.slug = lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'))
   );

-- Asignar cada sede a la empresa que corresponde a su marca
UPDATE locations l
   SET company_id = c.id
  FROM companies c
 WHERE l.company_id IS NULL
   AND c.slug = lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'));
