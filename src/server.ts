import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { readFileSync } from 'fs';
import { config } from './config';
import { redirectRoutes } from './routes/redirect';
import { apiRoutes } from './routes/api';
import { businessRoutes } from './routes/business';
import { authRoutes, registerAuthGuard } from './lib/auth';
import { startReportScheduler } from './lib/scheduler';
import { startPlanScheduler } from './lib/plans';
import { applySchema } from './db/migrate';

const PUBLIC_DIR = join(__dirname, '..', 'public');

// Versión de los archivos del panel: cambia en cada despliegue (commit de
// Railway o, en local, la hora de arranque). Se añade como ?v= a los JS/CSS
// para que el navegador no use una copia vieja después de publicar cambios.
const ASSET_VERSION = (process.env.RAILWAY_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12);

/** Lee una página HTML y versiona sus JS/CSS locales (/archivo.js -> /archivo.js?v=...). */
function versionedPage(file: string): string {
  return readFileSync(join(PUBLIC_DIR, file), 'utf8').replace(
    /(src|href)="\/([\w.-]+\.(?:js|css))"/g,
    `$1="/$2?v=${ASSET_VERSION}"`
  );
}

async function main() {
  // Esquema al arrancar (aditivo e idempotente): evita depender de correr
  // "npm run migrate" a mano en Railway en cada versión con cambios de base.
  await applySchema().catch((e) => console.error('[migrate] no se pudo aplicar el esquema:', e.message));

  const app = Fastify({
    logger: {
      level: 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true } },
    },
    disableRequestLogging: false,
    trustProxy: true,
    // Los enlaces firmados del informe (/informe/:token) superan el límite
    // por defecto de 100 caracteres por parámetro.
    maxParamLength: 512,
  });

  await app.register(cors, { origin: true, credentials: true });

  // Autenticación: rutas de login/logout/me + guard global
  await app.register(authRoutes);
  registerAuthGuard(app);

  // Frontend estático (dashboard). Se registra antes para poder usar sendFile.
  // HTML, JS y CSS se revalidan siempre (no-cache + ETag): tras un despliegue
  // el navegador recibe lo nuevo; si nada cambió, la respuesta es un 304 ligero.
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: '/',
    index: false,
    setHeaders: (res, path) => {
      if (/\.(html|js|css)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
    },
  });

  // Páginas con sus archivos versionados. En producción se arman una vez por
  // arranque; en desarrollo se releen en cada petición para ver los cambios.
  const cached = { index: versionedPage('index.html'), login: versionedPage('login.html') };
  const page = (name: 'index' | 'login') =>
    process.env.NODE_ENV === 'production' ? cached[name] : versionedPage(`${name}.html`);
  app.get('/', async (_req, reply) =>
    reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(page('index'))
  );

  // Página de login (pública)
  app.get('/login', async (_req, reply) => {
    return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(page('login'));
  });

  // API + motor de redirección
  await app.register(apiRoutes);
  await app.register(businessRoutes);
  await app.register(redirectRoutes);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Dashboard:  ${config.publicBaseUrl}/`);
    app.log.info(`Redirect:   ${config.publicBaseUrl}/r/:deviceId`);
    // Worker de informes programados por correo (Función 2, Fase B).
    startReportScheduler();
    // Planes: vence pruebas y envía avisos antes de que terminen.
    startPlanScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
