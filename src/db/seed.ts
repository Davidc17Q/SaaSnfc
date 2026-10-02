import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pool } from './pool';
import { redis, deviceCacheKey } from './redis';
import { config } from '../config';
import { detectChannel } from '../lib/channel';
import { generateShortCode } from '../lib/shortcode';

// ----------------------------------------------------------------------------
// Configuración de la simulación
// ----------------------------------------------------------------------------
const TOTAL_SCAN_EVENTS = 15000;
const SIM_LOCATIONS = 84;
const DAYS_BACK = 30;

const CITIES = [
  'Medellín',
  'Bogotá',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Santa Marta',
  'Cúcuta',
  'Ibagué',
  'Villavicencio',
];

const MALLS = [
  'Centro Comercial',
  'Mall Plaza',
  'Unicentro',
  'Viva',
  'El Tesoro',
  'Santafé',
  'Premium Plaza',
  'Jardín Plaza',
];

// Pesos de distribución de SO (realista para Colombia: Android domina)
const OS_WEIGHTS: { os: string; w: number }[] = [
  { os: 'Android', w: 0.68 },
  { os: 'iOS', w: 0.28 },
  { os: 'Other', w: 0.04 },
];

const UA_SAMPLES: Record<string, string> = {
  Android:
    'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  iOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Other:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedOs(): string {
  const r = Math.random();
  let acc = 0;
  for (const o of OS_WEIGHTS) {
    acc += o.w;
    if (r <= acc) return o.os;
  }
  return 'Other';
}

/**
 * Genera una fecha aleatoria dentro de los últimos DAYS_BACK días,
 * con sesgo hacia horas comerciales (10:00-20:00) y días recientes.
 */
function randomScanDate(): Date {
  // Sesgo hacia días recientes: raíz cuadrada favorece valores altos
  const dayFraction = Math.pow(Math.random(), 0.7);
  const daysAgo = Math.floor(dayFraction * DAYS_BACK);

  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - daysAgo);

  // Hora con pico comercial. Distribución concentrada 10-20h.
  const hourPool = [
    9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 21,
  ];
  d.setHours(pick(hourPool), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return d;
}

function randomIp(): string {
  return `${190 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 256)}.${Math.floor(
    Math.random() * 256
  )}.${1 + Math.floor(Math.random() * 254)}`;
}

// ----------------------------------------------------------------------------
// Seed principal
// ----------------------------------------------------------------------------
async function seed() {
  console.log('[seed] Aplicando esquema...');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);

  console.log('[seed] Limpiando datos anteriores...');
  await pool.query('TRUNCATE scan_events, devices, locations RESTART IDENTITY CASCADE');
  // Limpiar empresas de demo (no borra usuarios superadmin por env).
  await pool.query('DELETE FROM companies');

  const base = config.publicBaseUrl;

  // --- a) Sedes reales -------------------------------------------------------
  const realLocations = [
    { name: 'Lalico - Licorería', brand: 'Lalico', city: 'Medellín' },
    { name: 'Celumóvil', brand: 'Celumóvil', city: 'Bogotá' },
  ];

  // Estructura para acumular device ids por location
  const deviceCatalog: { deviceId: string; code: string; locationId: string; targetUrl: string }[] = [];

  // Destinos predefinidos por marca. El Punto NFC 1 de Lalico apunta al
  // Instagram real para el ejemplo de demostración con tarjeta física.
  const realTargets: Record<string, string[]> = {
    Lalico: [
      'https://www.instagram.com/lalico.virtual/',
      'https://wa.me/573001112233?text=Quiero%20el%20catalogo%20Lalico',
    ],
    'Celumóvil': [
      'https://celumovil.example.com/promociones',
      'https://celumovil.example.com/soporte',
    ],
  };

  console.log('[seed] Insertando 2 sedes reales...');
  for (const loc of realLocations) {
    const locationId = randomUUID();
    await pool.query(
      `INSERT INTO locations (id, name, brand, city, status) VALUES ($1,$2,$3,$4,'active')`,
      [locationId, loc.name, loc.brand, loc.city]
    );

    // 2 puntos NFC por sede real, con destinos predefinidos
    const targets = realTargets[loc.brand] || ['https://example.com'];
    for (let p = 0; p < targets.length; p++) {
      const deviceId = randomUUID();
      const code = generateShortCode();
      const targetUrl = targets[p];
      await pool.query(
        `INSERT INTO devices (id, code, location_id, label, target_url, status)
         VALUES ($1,$2,$3,$4,$5,'active')`,
        [deviceId, code, locationId, `Punto NFC ${p + 1}`, targetUrl]
      );
      deviceCatalog.push({ deviceId, code, locationId, targetUrl });
    }

    console.log(`   ✓ ${loc.name}  (sede real)  ->  ${base}/r/{deviceId}`);
  }

  // --- b) 84 sedes simuladas "Hogar y Moda" ---------------------------------
  console.log(`[seed] Generando ${SIM_LOCATIONS} sedes simuladas "Hogar y Moda"...`);
  for (let i = 0; i < SIM_LOCATIONS; i++) {
    const city = pick(CITIES);
    const mall = pick(MALLS);
    const locationId = randomUUID();
    const name = `Hogar y Moda #${String(i + 1).padStart(2, '0')} - ${mall} ${city}`;
    // ~5% inactivas para realismo
    const status = Math.random() < 0.05 ? 'inactive' : 'active';

    await pool.query(
      `INSERT INTO locations (id, name, brand, city, status) VALUES ($1,$2,$3,$4,$5)`,
      [locationId, name, 'Hogar y Moda', city, status]
    );

    // 1-4 puntos NFC por sede
    const points = 1 + Math.floor(Math.random() * 4);
    for (let p = 0; p < points; p++) {
      const deviceId = randomUUID();
      const code = generateShortCode();
      const targetUrl = `https://hogarymoda.example.com/tienda/${i + 1}/ofertas`;
      await pool.query(
        `INSERT INTO devices (id, code, location_id, label, target_url, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [deviceId, code, locationId, `Punto NFC ${p + 1}`, targetUrl, status]
      );
      if (status === 'active') {
        deviceCatalog.push({ deviceId, code, locationId, targetUrl });
      }
    }
  }

  console.log(`[seed] Dispositivos activos disponibles: ${deviceCatalog.length}`);

  // --- Backfill de empresas: una por marca y asignación de sedes -------------
  console.log('[seed] Creando empresas por marca y asignando sedes...');
  await pool.query(
    `INSERT INTO companies (name, slug)
     SELECT DISTINCT l.brand, lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'))
       FROM locations l
      WHERE l.brand IS NOT NULL AND l.brand <> ''
        AND NOT EXISTS (
          SELECT 1 FROM companies c
           WHERE c.slug = lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'))
        )`
  );
  await pool.query(
    `UPDATE locations l SET company_id = c.id
       FROM companies c
      WHERE l.company_id IS NULL
        AND c.slug = lower(regexp_replace(l.brand, '[^a-zA-Z0-9]+', '-', 'g'))`
  );

  // --- c) 15.000 eventos de escaneo -----------------------------------------
  console.log(`[seed] Generando ${TOTAL_SCAN_EVENTS} eventos de escaneo...`);

  // Pesos por dispositivo para que unas sedes destaquen (Top 10 realista)
  const weights = deviceCatalog.map(() => 0.3 + Math.random() * Math.random() * 3);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  function pickWeightedDevice(): number {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  const BATCH = 1000;
  let inserted = 0;

  while (inserted < TOTAL_SCAN_EVENTS) {
    const batchSize = Math.min(BATCH, TOTAL_SCAN_EVENTS - inserted);
    const values: string[] = [];
    const params: any[] = [];

    for (let b = 0; b < batchSize; b++) {
      const dev = deviceCatalog[pickWeightedDevice()];
      const os = weightedOs();
      const channel = detectChannel(dev.targetUrl);
      const date = randomScanDate();
      const idx = params.length;
      values.push(
        `($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`
      );
      params.push(
        dev.deviceId,
        dev.locationId,
        os,
        channel,
        UA_SAMPLES[os],
        randomIp(),
        date.toISOString()
      );
    }

    await pool.query(
      `INSERT INTO scan_events (device_id, location_id, os, channel, user_agent, ip, scanned_at)
       VALUES ${values.join(', ')}`,
      params
    );

    inserted += batchSize;
    process.stdout.write(`\r   ... ${inserted}/${TOTAL_SCAN_EVENTS} eventos`);
  }
  process.stdout.write('\n');

  // --- Calentar la caché Redis ----------------------------------------------
  console.log('[seed] Calentando caché Redis...');
  try {
    const devs = await pool.query(
      `SELECT id AS device_id, code, location_id, target_url, status FROM devices`
    );
    const pipe = redis.pipeline();
    for (const d of devs.rows) {
      const payload = JSON.stringify(d);
      if (d.code) pipe.set(deviceCacheKey(d.code), payload, 'EX', 3600);
      pipe.set(deviceCacheKey(d.device_id), payload, 'EX', 3600);
    }
    await pipe.exec();
    console.log(`   ✓ ${devs.rowCount} dispositivos cacheados`);
  } catch (err: any) {
    console.warn('   ! Redis no disponible, se omite el calentamiento de caché:', err.message);
  }

  // --- Resumen y URLs de demo -----------------------------------------------
  const sample = await pool.query(
    `SELECT d.id, d.code, d.label, l.name, l.brand
       FROM devices d JOIN locations l ON l.id = d.location_id
       WHERE l.brand IN ('Lalico','Celumóvil')
       ORDER BY l.name`
  );

  console.log('\n========================================================');
  console.log(' SEED COMPLETADO');
  console.log('========================================================');
  console.log(` Sedes:        ${SIM_LOCATIONS + 2} (2 reales + ${SIM_LOCATIONS} Hogar y Moda)`);
  console.log(` Dispositivos: ${deviceCatalog.length} activos`);
  console.log(` Escaneos:     ${TOTAL_SCAN_EVENTS}`);
  console.log('\n URLs de demostración (redirección real):');
  for (const s of sample.rows) {
    console.log(`   ${s.name} / ${s.label}:`);
    console.log(`     ${base}/r/${s.code}`);
  }

  // Resaltar el punto de Instagram de Lalico (ejemplo con tarjeta física)
  const igPoint = await pool.query(
    `SELECT d.code FROM devices d JOIN locations l ON l.id = d.location_id
       WHERE l.brand = 'Lalico' AND d.label = 'Punto NFC 1' LIMIT 1`
  );
  if (igPoint.rowCount) {
    console.log('\n  >>> EJEMPLO TARJETA REAL (Instagram de Lalico) <<<');
    console.log('  Destino configurado: https://www.instagram.com/lalico.virtual/');
    console.log('  URL que va en la tarjeta NFC (local):');
    console.log(`     ${base}/r/${igPoint.rows[0].code}`);
  }
  console.log('========================================================\n');

  await pool.end();
  await redis.quit().catch(() => {});
}

seed().catch((err) => {
  console.error('\n[seed] Error:', err);
  process.exit(1);
});
