import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

// En producción nunca se arranca con credenciales conocidas. No se detiene el
// proceso (las tarjetas /r/ deben seguir funcionando): se neutraliza el valor
// inseguro y se deja un aviso claro en el registro.
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const WEAK_PASSWORDS = ['', 'admin123', 'cambia-esta-clave'];
const WEAK_SECRETS = ['', 'dev-insecure-secret-change-me', 'genera-un-secreto-largo-y-aleatorio'];

let sessionSecret = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
if (isProduction && WEAK_SECRETS.includes(process.env.SESSION_SECRET || '')) {
  sessionSecret = randomBytes(48).toString('hex');
  console.error('[config] SESSION_SECRET no está definido en producción: se usa uno temporal (las sesiones y los enlaces de informes se pierden en cada reinicio). Defínelo en Railway.');
}
// Sin contraseña segura, el superadmin por variables de entorno queda desactivado.
const envAdminEnabled = !(isProduction && WEAK_PASSWORDS.includes(process.env.AUTH_PASSWORD || ''));
if (!envAdminEnabled) {
  console.error('[config] AUTH_PASSWORD no está definido (o es el de ejemplo) en producción: el superadmin por variables de entorno queda desactivado. Defínelo en Railway.');
}

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
  envAdminEnabled,
  // Secreto para firmar la cookie de sesión. CÁMBIALO en producción.
  sessionSecret,
  // Duración de la sesión en horas
  sessionHours: parseInt(process.env.SESSION_HOURS || '168', 10), // 7 días

  // Anti-doble-conteo: ventana (segundos) en la que un mismo dispositivo+IP
  // no vuelve a registrar escaneo. 0 = desactivado. Por defecto 30s.
  scanDedupeSeconds: parseInt(process.env.SCAN_DEDUPE_SECONDS || '30', 10),

  // Resend por API HTTP (Función 2, Fase B). Si RESEND_API_KEY está presente,
  // se usa esta vía (sortea el bloqueo de puertos SMTP de algunos hosts como
  // Railway). Tiene prioridad sobre SMTP.
  resendApiKey: process.env.RESEND_API_KEY || '',

  // WhatsApp de contacto comercial (sin "+"), para reactivar planes y soporte.
  contactWhatsapp: process.env.CONTACT_WHATSAPP || '573007240273',
  // Días de prueba gratis por defecto al crear una empresa.
  trialDays: parseInt(process.env.TRIAL_DAYS || '30', 10),

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
