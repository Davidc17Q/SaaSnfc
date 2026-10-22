import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { config } from './config';
import { redirectRoutes } from './routes/redirect';
import { apiRoutes } from './routes/api';
import { authRoutes, registerAuthGuard } from './lib/auth';
import { startReportScheduler } from './lib/scheduler';
import { startPlanScheduler } from './lib/plans';
import { applySchema } from './db/migrate';

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
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // Página de login (pública)
  app.get('/login', async (_req, reply) => {
    return reply.type('text/html').sendFile('login.html');
  });

  // API + motor de redirección
  await app.register(apiRoutes);
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
