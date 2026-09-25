-- Esquema de la plataforma SaaS NFC B2B
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sedes / tiendas del cliente corporativo
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  brand       TEXT        NOT NULL,              -- Marca / cadena a la que pertenece
  city        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active', -- active | inactive
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Puntos / dispositivos NFC físicos
CREATE TABLE IF NOT EXISTS devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,              -- Ej: "Entrada principal"
  target_url  TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_devices_location   ON devices(location_id);
CREATE INDEX IF NOT EXISTS idx_scan_device        ON scan_events(device_id);
CREATE INDEX IF NOT EXISTS idx_scan_location      ON scan_events(location_id);
CREATE INDEX IF NOT EXISTS idx_scan_scanned_at    ON scan_events(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_os            ON scan_events(os);
CREATE INDEX IF NOT EXISTS idx_scan_channel       ON scan_events(channel);
