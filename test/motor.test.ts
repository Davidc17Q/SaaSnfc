/**
 * Motor público /r/:código — lo que nunca se puede romper: la tarjeta redirige
 * (302), la interacción se registra una sola vez y un plan vencido no la apaga.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setup, teardown, makeTenant, makeDevice, makeTemplate, scan, scanCount, waitFor, sleep, call,
  type Ctx, type Tenant,
} from './helpers';

let ctx: Ctx;
let t: Tenant;

before(async () => {
  ctx = await setup();
  t = await makeTenant('Motor');
});
after(teardown);

test('redirige con 302 al destino y registra la interacción con su origen', async () => {
  const d = await makeDevice(t.locationId, { target: 'https://wa.me/573001112233' });
  const res = await scan(d.code, { query: '?s=q' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://wa.me/573001112233');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1), 'no se registró el escaneo');
  const row = (await ctx.pool.query('SELECT * FROM scan_events WHERE device_id = $1', [d.deviceId])).rows[0];
  assert.equal(row.source, 'qr');
  assert.equal(row.channel, 'WhatsApp');
  assert.equal(row.os, 'iOS');
  assert.equal(row.location_id, t.locationId);
  assert.equal(row.ip, '190.0.0.1');
});

test('el chip (?s=n) se registra como NFC y sin marca como desconocido', async () => {
  const d = await makeDevice(t.locationId);
  await scan(d.code, { query: '?s=n', ip: '190.0.1.1', ua: 'UA-nfc' });
  await scan(d.code, { ip: '190.0.1.2', ua: 'UA-sin-marca' });
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 2));
  const rows = (await ctx.pool.query('SELECT source FROM scan_events WHERE device_id = $1 ORDER BY id', [d.deviceId])).rows;
  assert.deepEqual(rows.map((r) => r.source).sort(), ['nfc', 'unknown']);
});

test('también resuelve por el identificador largo (tarjetas antiguas)', async () => {
  const d = await makeDevice(t.locationId);
  const res = await scan(d.deviceId, { ip: '190.0.2.1' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, d.target);
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1));
});

test('código inexistente o mal formado: 404 sin registrar nada y sin reflejar HTML', async () => {
  const before = (await ctx.pool.query('SELECT COUNT(*)::int AS n FROM scan_events')).rows[0].n;
  const missing = await scan('NoExiste9');
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /no configurado/);
  const bad = await scan(encodeURIComponent('<img src=x onerror=alert(1)>'));
  assert.equal(bad.statusCode, 404);
  assert.ok(!bad.body.includes('<img src=x'), 'el código inválido se refleja sin escapar');
  await sleep(150);
  const after = (await ctx.pool.query('SELECT COUNT(*)::int AS n FROM scan_events')).rows[0].n;
  assert.equal(after, before);
});

test('punto inactivo: 404 y no registra', async () => {
  const d = await makeDevice(t.locationId, { status: 'inactive' });
  const res = await scan(d.code);
  assert.equal(res.statusCode, 404);
  await sleep(150);
  assert.equal(await scanCount(d.deviceId), 0);
});

test('anti-doble-conteo por IP: dos lecturas seguidas cuentan una', async () => {
  const d = await makeDevice(t.locationId);
  const a = await scan(d.code, { ip: '181.1.1.1', ua: 'UA-uno' });
  const b = await scan(d.code, { ip: '181.1.1.1', ua: 'UA-otro-navegador' });
  assert.equal(a.statusCode, 302);
  assert.equal(b.statusCode, 302, 'la segunda lectura también debe redirigir');
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) >= 1));
  await sleep(250);
  assert.equal(await scanCount(d.deviceId), 1);
});

test('anti-doble-conteo por navegador: mismo celular con otra IP cuenta una', async () => {
  const d = await makeDevice(t.locationId);
  const ua = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/126';
  await scan(d.code, { ip: '181.2.2.2', ua });
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1));
  await scan(d.code, { ip: '2800:e2:1::1', ua }); // la misma lectura llega por IPv6
  await sleep(300);
  assert.equal(await scanCount(d.deviceId), 1);
});

test('dos clientes distintos sí cuentan dos', async () => {
  const d = await makeDevice(t.locationId);
  await scan(d.code, { ip: '181.3.3.1', ua: 'UA-cliente-1' });
  await scan(d.code, { ip: '181.3.3.2', ua: 'UA-cliente-2' });
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 2));
});

test('sin Redis en la primera barrera, Postgres sigue evitando el doble conteo', async () => {
  const d = await makeDevice(t.locationId);
  await scan(d.code, { ip: '181.4.4.4', ua: 'UA-x' });
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1));
  await ctx.redis.flushdb(); // como si Redis hubiera perdido las claves
  await scan(d.code, { ip: '181.4.4.4', ua: 'UA-x' });
  await sleep(300);
  assert.equal(await scanCount(d.deviceId), 1);
});

test('empresa en plan Básico: la tarjeta sigue redirigiendo y registrando; el panel responde 402', async () => {
  const basic = await makeTenant('Basico', { plan: 'basic' });
  const res = await scan(basic.code, { ip: '181.5.5.5' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, basic.target);
  assert.ok(await waitFor(async () => (await scanCount(basic.deviceId)) === 1));
  const api = await call('GET', '/api/kpis', basic.cookie);
  assert.equal(api.status, 402);
  assert.equal(api.json.error, 'plan_basico');
  assert.equal((await call('GET', '/api/plan-status', basic.cookie)).status, 200);
});

test('prueba gratis vencida se trata como Básico sin apagar la tarjeta', async () => {
  const trial = await makeTenant('Vencida');
  await ctx.pool.query(`UPDATE companies SET plan = 'trial', trial_ends_at = now() - INTERVAL '1 day' WHERE id = $1`, [trial.companyId]);
  const { invalidatePlan } = await import('../src/lib/plans');
  invalidatePlan(trial.companyId);
  assert.equal((await scan(trial.code, { ip: '181.6.6.6' })).statusCode, 302);
  assert.equal((await call('GET', '/api/kpis', trial.cookie)).status, 402);
});

test('empresa suspendida: la tarjeta sigue redirigiendo', async () => {
  const s = await makeTenant('Suspendida');
  await ctx.pool.query(`UPDATE companies SET status = 'inactive' WHERE id = $1`, [s.companyId]);
  assert.equal((await scan(s.code, { ip: '181.7.7.7' })).statusCode, 302);
});

test('cambiar el destino desde el panel se aplica al instante (caché borrada)', async () => {
  const d = await makeDevice(t.locationId, { target: 'https://ejemplo.com/viejo' });
  assert.equal((await scan(d.code, { ip: '181.8.8.1' })).headers.location, 'https://ejemplo.com/viejo'); // llena la caché
  const upd = await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { target_url: 'https://ejemplo.com/nuevo' });
  assert.equal(upd.status, 200);
  assert.equal((await scan(d.code, { ip: '181.8.8.2', ua: 'UA-2' })).headers.location, 'https://ejemplo.com/nuevo');
});

test('destinos peligrosos se rechazan al guardar', async () => {
  const d = await makeDevice(t.locationId);
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'no-es-url']) {
    const r = await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { target_url: url });
    assert.equal(r.status, 400, url);
  }
  assert.equal((await scan(d.code, { ip: '181.9.9.9' })).headers.location, d.target);
});

test('modo encuesta: muestra la encuesta, no redirige ni cuenta como escaneo', async () => {
  const d = await makeDevice(t.locationId);
  const tpl = await makeTemplate(t.companyId);
  const set = await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { mode: 'survey', survey_template_id: tpl.templateId });
  assert.equal(set.status, 200);

  const page = await scan(d.code, { ip: '186.1.1.1' });
  assert.equal(page.statusCode, 200);
  assert.match(String(page.headers['content-type']), /text\/html/);
  assert.match(page.body, /Atención/);
  assert.match(page.body, /Limpieza/);
  await sleep(150);
  assert.equal(await scanCount(d.deviceId), 0);

  const send = (payload: unknown, ip: string) =>
    ctx.app.inject({ method: 'POST', url: `/r/${d.code}/survey?s=q`, headers: { 'cf-connecting-ip': ip }, payload: payload as object });
  const full = { ratings: { [tpl.aspects[0]]: 5, [tpl.aspects[1]]: 2 }, comment: 'Baños sucios' };

  // Incompleta o fuera de rango: 400, y no gasta el turno de ese cliente.
  assert.equal((await send({ ratings: { [tpl.aspects[0]]: 5 } }, '186.1.1.2')).statusCode, 400);
  assert.equal((await send({ ratings: { [tpl.aspects[0]]: 9, [tpl.aspects[1]]: 1 } }, '186.1.1.2')).statusCode, 400);
  assert.equal((await send(full, '186.1.1.2')).statusCode, 200);
  const count = async () => (await ctx.pool.query('SELECT COUNT(*)::int AS n FROM survey_responses WHERE device_id = $1', [d.deviceId])).rows[0].n;
  assert.equal(await count(), 1);
  const row = (await ctx.pool.query('SELECT comment, source FROM survey_responses WHERE device_id = $1', [d.deviceId])).rows[0];
  assert.equal(row.comment, 'Baños sucios');
  assert.equal(row.source, 'qr');

  // El mismo cliente la envía otra vez: responde bien pero no duplica.
  assert.equal((await send(full, '186.1.1.2')).statusCode, 200);
  assert.equal(await count(), 1);
  // Otro cliente sí cuenta.
  assert.equal((await send(full, '186.1.1.3')).statusCode, 200);
  assert.equal(await count(), 2);
});

test('modo encuesta sin plantilla activa: página de "no disponible", nunca un error', async () => {
  const d = await makeDevice(t.locationId);
  const tpl = await makeTemplate(t.companyId, 'Temporal');
  await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { mode: 'survey', survey_template_id: tpl.templateId });
  await call('PATCH', `/api/survey-templates/${tpl.templateId}`, t.cookie, { status: 'inactive' });
  const page = await scan(d.code, { ip: '186.2.2.2' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Encuesta no disponible/);
  const post = await ctx.app.inject({ method: 'POST', url: `/r/${d.code}/survey`, payload: { ratings: {} } });
  assert.ok([400, 404].includes(post.statusCode));
});

test('volver a modo redirección restablece el 302', async () => {
  const d = await makeDevice(t.locationId);
  const tpl = await makeTemplate(t.companyId, 'Ida y vuelta');
  await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { mode: 'survey', survey_template_id: tpl.templateId });
  assert.equal((await scan(d.code, { ip: '186.3.3.1' })).statusCode, 200);
  await call('PATCH', `/api/devices/${d.deviceId}`, t.cookie, { mode: 'redirect' });
  const res = await scan(d.code, { ip: '186.3.3.2' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, d.target);
});

test('la IP inventada en X-Forwarded-For no salta el anti-doble-conteo', async () => {
  const d = await makeDevice(t.locationId);
  const hit = (xff: string) =>
    ctx.app.inject({
      method: 'GET', url: `/r/${d.code}`,
      headers: { 'cf-connecting-ip': '200.1.1.1', 'x-forwarded-for': xff, 'user-agent': `UA-${xff}` },
    });
  await hit('1.1.1.1');
  await hit('2.2.2.2');
  await hit('3.3.3.3');
  await sleep(350);
  assert.equal(await scanCount(d.deviceId), 1);
});

test('/healthz responde sin sesión', async () => {
  const r = await call('GET', '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.db, true);
  assert.equal(r.json.cache, true);
});
