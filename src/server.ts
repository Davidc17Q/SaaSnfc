import { config } from './config';
import { buildApp } from './app';
import { startReportScheduler } from './lib/scheduler';
import { startPlanScheduler } from './lib/plans';
import { applySchema } from './db/migrate';
import { pool } from './db/pool';
import { redis } from './db/redis';

async function main() {
  // Esquema al arrancar (aditivo e idempotente): evita depender de correr
  // "npm run migrate" a mano en Railway en cada versión con cambios de base.
  await applySchema().catch((e) => console.error('[migrate] no se pudo aplicar el esquema:', e.message));

  const app = await buildApp();

  // Apagado ordenado: en cada despliegue Railway envía SIGTERM; se terminan las
  // peticiones en curso (y sus registros de interacción) antes de salir.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal}: cerrando...`);
    const force = setTimeout(() => process.exit(0), 10_000);
    force.unref();
    try {
      await app.close();
      await new Promise((r) => setTimeout(r, 500)); // registros de escaneo en vuelo
      await pool.end();
      redis.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

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
