import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { config } from './config';
import { redirectRoutes } from './routes/redirect';
import { apiRoutes } from './routes/api';
import { authRoutes, registerAuthGuard } from './lib/auth';

async function main() {
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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
