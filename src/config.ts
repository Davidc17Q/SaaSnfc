import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://nfc_admin:nfc_secret@localhost:5432/nfc_saas',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Autenticación del panel
  authUser: process.env.AUTH_USER || 'admin',
  authPassword: process.env.AUTH_PASSWORD || 'admin123',
  // Secreto para firmar la cookie de sesión. CÁMBIALO en producción.
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  // Duración de la sesión en horas
  sessionHours: parseInt(process.env.SESSION_HOURS || '168', 10), // 7 días

  // Anti-doble-conteo: ventana (segundos) en la que un mismo dispositivo+IP
  // no vuelve a registrar escaneo. 0 = desactivado. Por defecto 30s.
  scanDedupeSeconds: parseInt(process.env.SCAN_DEDUPE_SECONDS || '30', 10),
};
