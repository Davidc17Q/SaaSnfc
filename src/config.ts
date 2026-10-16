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

  // Resend por API HTTP (Función 2, Fase B). Si RESEND_API_KEY está presente,
  // se usa esta vía (sortea el bloqueo de puertos SMTP de algunos hosts como
  // Railway). Tiene prioridad sobre SMTP.
  resendApiKey: process.env.RESEND_API_KEY || '',

  // Correo SMTP (Función 2, Fase B: envío programado de informes).
  // Si no hay SMTP_HOST ni RESEND_API_KEY, el envío queda deshabilitado (la UI avisa).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    // secure=true para puerto 465 (TLS implícito); false para 587 (STARTTLS).
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'NFCloud <no-reply@nfcloud>',
  },
};
