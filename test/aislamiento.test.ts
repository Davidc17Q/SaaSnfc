/**
 * Aislamiento entre empresas: un company_admin no puede leer ni modificar nada
 * de otra empresa, y sin sesión la API no responde.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setup, teardown, makeTenant, makeTemplate, login, call, scan, scanCount, waitFor, ADMIN,
  type Ctx, type Tenant,
} from './helpers';

let ctx: Ctx;
let A: Tenant;
let B: Tenant;
let admin: string;
let tplB: { templateId: string; aspects: string[] };
let campaignB: string;
let scheduleB: string;
let alertB: string;

before(async () => {
  ctx = await setup();
  A = await makeTenant('Alfa');
  B = await makeTenant('Beta');
  admin = await login(ADMIN.user, ADMIN.password);
  tplB = await makeTemplate(B.companyId, 'Encuesta Beta');
  // Actividad en ambas empresas.
  await scan(A.code, { ip: '170.1.1.1', ua: 'UA-a' });
  await scan(B.code, { ip: '170.1.1.2', ua: 'UA-b1' });
  await scan(B.code, { ip: '170.1.1.3', ua: 'UA-b2' });
  await waitFor(async () => (await scanCount(A.deviceId)) === 1 && (await scanCount(B.deviceId)) === 2);
  campaignB = (await call('POST', '/api/campaigns', B.cookie, { name: 'Campaña Beta', startsOn: '2026-11-01', endsOn: '2026-11-10' })).json.id;
  scheduleB = (await call('POST', '/api/report-schedules', B.cookie, { email: 'gerente@beta.test' })).json.schedule.id;
  alertB = (await call('POST', '/api/inactivity-alerts', B.cookie, { email: 'gerente@beta.test', threshold_hours: 48 })).json.alert.id;
  assert.ok(campaignB && scheduleB && alertB, 'no se pudieron crear los datos de Beta');
});
after(teardown);

test('sin sesión: toda la API responde 401, también con trucos en la URL', async () => {
  const urls = [
    '/api/kpis', '/api/locations', '/api/devices', '/api/companies', '/api/users', '/api/export',
    '/api/report', '/api/health', '/api/business-settings', '/api/competition', '/api/survey-templates',
    // ";" + extensión de imagen: así se saltaba el login antes del arreglo.
    '/api/kpis;x.png', '/api/companies;a.svg', '/api/export;x.jpg', '/api/devices;.ico', '/api/kpis.png',
    '/api/kpis%3Bx.png', `/api/locations/${B.locationId}/summary;x.png`, '/api/kpis?x=.png',
  ];
  for (const url of urls) {
    const r = await call('GET', url);
    assert.equal(r.status, 401, `${url} respondió ${r.status}`);
  }
  const writes: [any, string, unknown][] = [
    ['POST', '/api/locations', { name: 'X', city: 'Y' }],
    ['DELETE', `/api/locations/${B.locationId}`, undefined],
    ['PATCH', `/api/devices/${B.deviceId}`, { target_url: 'https://malo.example' }],
    ['PATCH', `/api/devices/${B.deviceId};x.png`, { target_url: 'https://malo.example' }],
    ['POST', '/api/devices/bulk-update', { scope: 'all', target_url: 'https://malo.example' }],
    ['POST', '/api/devices/bulk-update;x.png', { scope: 'all', target_url: 'https://malo.example' }],
    ['POST', '/api/companies', { name: 'Intrusa' }],
    ['POST', '/api/users', { username: 'intruso', password: 'clave-larga-123', role: 'superadmin' }],
    ['DELETE', `/api/survey-templates/${tplB.templateId};x.png`, undefined],
  ];
  for (const [method, url, payload] of writes) {
    const r = await call(method, url, undefined, payload);
    assert.equal(r.status, 401, `${method} ${url} respondió ${r.status}`);
  }
  const dev = (await ctx.pool.query('SELECT target_url FROM devices WHERE id = $1', [B.deviceId])).rows[0];
  assert.equal(dev.target_url, B.target);
});

test('una cookie firmada con otro secreto no sirve', async () => {
  const { createHmac } = await import('node:crypto');
  const data = Buffer.from(JSON.stringify({ userId: null, user: 'x', role: 'superadmin', companyId: null, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = createHmac('sha256', 'dev-insecure-secret-change-me').update(data).digest('base64url');
  const r = await call('GET', '/api/companies', `nfc_session=${encodeURIComponent(`${data}.${sig}`)}`);
  assert.equal(r.status, 401);
});

test('las listas solo traen lo de la propia empresa', async () => {
  const locs = (await call('GET', '/api/locations', A.cookie)).json;
  assert.deepEqual(locs.map((l: any) => l.id), [A.locationId]);
  const devs = (await call('GET', '/api/devices', A.cookie)).json;
  assert.deepEqual(devs.map((d: any) => d.id), [A.deviceId]);
  const cos = (await call('GET', '/api/companies', A.cookie)).json;
  assert.deepEqual(cos.map((c: any) => c.id), [A.companyId]);
  assert.deepEqual((await call('GET', '/api/users', A.cookie)).json, []);
  for (const url of ['/api/survey-templates', '/api/campaigns', '/api/report-schedules', '/api/inactivity-alerts', '/api/bulk-updates']) {
    assert.deepEqual((await call('GET', url, A.cookie)).json, [], url);
  }
});

test('las cifras solo cuentan las interacciones propias; ?companyId ajeno se ignora', async () => {
  for (const q of ['', `?companyId=${B.companyId}`, `?locationId=${B.locationId}&companyId=${B.companyId}`]) {
    const k = (await call('GET', `/api/kpis${q}`, A.cookie)).json;
    assert.equal(k.totalScans, q.includes('locationId') ? 0 : 1, `kpis${q}`);
    assert.equal(k.locationsTotal, 1);
  }
  const top = (await call('GET', `/api/top-locations?companyId=${B.companyId}`, A.cookie)).json;
  assert.deepEqual(top.map((x: any) => x.id), [A.locationId]);
  const exp = (await call('GET', `/api/export?companyId=${B.companyId}`, A.cookie)).json;
  assert.equal(exp.counts.scan_events, 1);
  assert.deepEqual(exp.locations.map((l: any) => l.id), [A.locationId]);
  const csv = (await call('GET', '/api/export/locations.csv', A.cookie)).body;
  assert.ok(csv.includes('Sede Alfa') && !csv.includes('Sede Beta'));
  assert.equal((await call('GET', '/api/since-start', A.cookie)).json.total, 1);
});

test('sedes ajenas: ni se leen ni se cambian ni se borran', async () => {
  const id = B.locationId;
  for (const url of [`/api/locations/${id}/summary`, `/api/locations/${id}/devices`, `/api/locations/${id}/reputation`, `/api/locations/${id}/competition`]) {
    assert.equal((await call('GET', url, A.cookie)).status, 404, url);
  }
  assert.equal((await call('PATCH', `/api/locations/${id}`, A.cookie, { name: 'Robada' })).status, 404);
  assert.equal((await call('PUT', `/api/locations/${id}/goal`, A.cookie, { monthlyGoal: 5 })).status, 404);
  assert.equal((await call('PUT', `/api/locations/${id}/google-place`, A.cookie, { placeId: 'x', name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/api/locations/${id}`, A.cookie)).status, 404);
  const row = (await ctx.pool.query('SELECT name, monthly_goal, google_place_id FROM locations WHERE id = $1', [id])).rows[0];
  assert.deepEqual(row, { name: 'Sede Beta', monthly_goal: null, google_place_id: null });
});

test('puntos ajenos: no se cambia el destino ni se crean puntos en sedes de otros', async () => {
  const r = await call('PATCH', `/api/devices/${B.deviceId}`, A.cookie, { target_url: 'https://malo.example' });
  assert.equal(r.status, 404);
  assert.equal((await call('PATCH', `/api/devices/${B.deviceId}`, A.cookie, { status: 'inactive' })).status, 404);
  assert.equal((await call('PATCH', `/api/devices/${B.deviceId}/transition`, A.cookie, { transition: true })).status, 403);
  const created = await call('POST', '/api/devices', A.cookie, { location_id: B.locationId, label: 'Intruso', target_url: 'https://malo.example' });
  assert.equal(created.status, 403);
  assert.equal((await call('GET', `/api/debug/device/${B.deviceId}`, A.cookie)).status, 403);
  const dev = (await ctx.pool.query('SELECT target_url, status FROM devices WHERE id = $1', [B.deviceId])).rows[0];
  assert.deepEqual(dev, { target_url: B.target, status: 'active' });
  assert.equal((await scan(B.code, { ip: '170.9.9.9', ua: 'UA-verifica' })).headers.location, B.target);
});

test('cambio masivo: solo toca los puntos propios y no se revierte el de otros', async () => {
  const mine = await call('POST', '/api/devices/bulk-update', A.cookie, { scope: 'all', target_url: 'https://alfa.example/promo' });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.affected, 1);
  const b = (await ctx.pool.query('SELECT target_url FROM devices WHERE id = $1', [B.deviceId])).rows[0];
  assert.equal(b.target_url, B.target);
  // Alcance "sede" con una sede ajena: nada que cambiar.
  const other = await call('POST', '/api/devices/bulk-update', A.cookie, { scope: 'location', value: B.locationId, target_url: 'https://malo.example' });
  assert.equal(other.status, 404);
  assert.equal((await call('GET', `/api/devices/bulk-preview?scope=location&value=${B.locationId}`, A.cookie)).json.affected, 0);
  // Beta no ve ni revierte el cambio de Alfa.
  assert.deepEqual((await call('GET', '/api/bulk-updates', B.cookie)).json, []);
  assert.equal((await call('POST', `/api/bulk-updates/${mine.json.historyId}/revert`, B.cookie)).status, 404);
  assert.equal((await call('POST', `/api/bulk-updates/${mine.json.historyId}/revert`, A.cookie)).status, 200);
});

test('encuestas, campañas, informes y avisos ajenos: sin acceso', async () => {
  assert.equal((await call('PATCH', `/api/survey-templates/${tplB.templateId}`, A.cookie, { name: 'Robada' })).status, 404);
  assert.equal((await call('DELETE', `/api/survey-templates/${tplB.templateId}`, A.cookie)).status, 404);
  // No se puede poner un punto propio a usar la plantilla de otra empresa.
  const cross = await call('PATCH', `/api/devices/${A.deviceId}`, A.cookie, { mode: 'survey', survey_template_id: tplB.templateId });
  assert.equal(cross.status, 400);
  assert.equal((await call('PATCH', `/api/campaigns/${campaignB}`, A.cookie, { name: 'X', startsOn: '2026-11-01', endsOn: '2026-11-02' })).status, 404);
  assert.equal((await call('DELETE', `/api/campaigns/${campaignB}`, A.cookie)).status, 404);
  assert.equal((await call('PATCH', `/api/report-schedules/${scheduleB}`, A.cookie, { active: false })).status, 403);
  assert.equal((await call('DELETE', `/api/report-schedules/${scheduleB}`, A.cookie)).status, 403);
  assert.equal((await call('PATCH', `/api/inactivity-alerts/${alertB}`, A.cookie, { active: false })).status, 403);
  assert.equal((await call('DELETE', `/api/inactivity-alerts/${alertB}`, A.cookie)).status, 403);
  // Programar un informe o un aviso sobre una sede ajena.
  assert.equal((await call('POST', '/api/report-schedules', A.cookie, { email: 'a@alfa.test', location_id: B.locationId })).status, 400);
  assert.equal((await call('POST', '/api/inactivity-alerts', A.cookie, { email: 'a@alfa.test', threshold_hours: 48, location_id: B.locationId })).status, 400);
  // Todo lo de Beta sigue intacto.
  const n = async (table: string) => (await ctx.pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
  assert.equal(await n('survey_templates'), 1);
  assert.equal(await n('campaigns'), 1);
  assert.equal(await n('report_schedules'), 1);
  assert.equal(await n('inactivity_alerts'), 1);
  // El company_id del cuerpo se ignora: lo creado queda en la empresa propia.
  const made = await call('POST', '/api/survey-templates', A.cookie, { name: 'De Alfa', aspects: ['Servicio'], company_id: B.companyId });
  assert.equal(made.status, 201);
  const owner = (await ctx.pool.query('SELECT company_id FROM survey_templates WHERE id = $1', [made.json.id])).rows[0];
  assert.equal(owner.company_id, A.companyId);
  const loc = await call('POST', '/api/locations', A.cookie, { name: 'Nueva', city: 'Bello', company_id: B.companyId });
  assert.equal(loc.status, 201);
  assert.equal(loc.json.location.company_id, A.companyId);
});

test('comparar e informe no revelan el nombre de una sede ajena', async () => {
  const cmp = (await call('GET', `/api/compare?a=${A.locationId}&b=${B.locationId}`, A.cookie)).json;
  assert.equal(cmp.a.location.id, A.locationId);
  assert.equal(cmp.b.location, null);
  assert.equal(cmp.b.totals, 0);
  for (const url of [`/api/report?locationId=${B.locationId}`, `/api/report-mail-preview?locationId=${B.locationId}`, `/api/report?companyId=${B.companyId}`]) {
    const html = (await call('GET', url, A.cookie)).body;
    assert.ok(!/Beta/.test(html), `${url} menciona a la otra empresa`);
  }
});

test('valor y metas: cada empresa solo configura lo suyo', async () => {
  const put = await call('PUT', `/api/business-settings?companyId=${B.companyId}`, A.cookie, { channelValues: { WhatsApp: 9999 }, goalMonthly: 77 });
  assert.equal(put.status, 200);
  const rows = (await ctx.pool.query('SELECT id, goal_monthly FROM companies WHERE id = ANY($1)', [[A.companyId, B.companyId]])).rows;
  assert.equal(rows.find((r) => r.id === A.companyId).goal_monthly, 77);
  assert.equal(rows.find((r) => r.id === B.companyId).goal_monthly, null);
});

test('acciones de superadmin: prohibidas para un cliente', async () => {
  assert.equal((await call('POST', '/api/companies', A.cookie, { name: 'Otra' })).status, 403);
  assert.equal((await call('PATCH', `/api/companies/${A.companyId}`, A.cookie, { status: 'active' })).status, 403);
  assert.equal((await call('PATCH', `/api/companies/${A.companyId}/plan`, A.cookie, { plan: 'pro' })).status, 403);
  assert.equal((await call('PATCH', `/api/companies/${A.companyId}/segment`, A.cookie, { segment: 'chain' })).status, 403);
  assert.equal((await call('POST', '/api/users', A.cookie, { username: 'nuevo', password: 'clave-larga-123', role: 'superadmin' })).status, 403);
  const u = (await ctx.pool.query('SELECT id FROM users WHERE username = $1', [B.user])).rows[0];
  assert.equal((await call('POST', `/api/users/${u.id}/reset-password`, A.cookie)).status, 403);
  assert.equal((await call('POST', `/api/locations/${A.locationId}/reputation`, A.cookie, { rating: 5, reviewCount: 10 })).status, 403);
  assert.equal((await call('GET', `/api/plan-status?companyId=${B.companyId}`, A.cookie)).json.companyName, 'Alfa');
});

test('el superadmin sí ve todo y puede acotar por empresa', async () => {
  assert.equal((await call('GET', '/api/kpis', admin)).json.totalScans >= 3, true);
  assert.equal((await call('GET', `/api/kpis?companyId=${B.companyId}`, admin)).json.totalScans, await scanCount(B.deviceId));
  const locs = (await call('GET', `/api/locations?companyId=${B.companyId}`, admin)).json;
  assert.deepEqual(locs.map((l: any) => l.id), [B.locationId]);
  assert.equal((await call('GET', `/api/locations/${B.locationId}/summary`, admin)).status, 200);
});

test('ids y fechas mal formados responden 400, no 500', async () => {
  assert.equal((await call('GET', '/api/locations/no-es-un-id/summary', A.cookie)).status, 400);
  assert.equal((await call('GET', '/api/kpis?from=ayer&to=hoy', A.cookie)).status, 400);
  assert.equal((await call('PATCH', '/api/devices/123', A.cookie, { status: 'active' })).status, 400);
  assert.equal((await call('PATCH', `/api/devices/${A.deviceId}`, A.cookie, { status: 'borrado' })).status, 400);
});

test('informe por enlace firmado: solo el alcance del enlace', async () => {
  const { signReportLink } = await import('../src/lib/report-link');
  const ok = await call('GET', `/informe/${signReportLink({ companyId: A.companyId, month: '2026-11' })}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.includes('Alfa') && !ok.body.includes('Beta'));
  const token = signReportLink({ companyId: A.companyId, month: '2026-11' });
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  assert.equal((await call('GET', `/informe/${tampered}`)).status, 404);
  // Un enlace de informe no sirve como sesión.
  assert.equal((await call('GET', '/api/kpis', `nfc_session=${encodeURIComponent(token)}`)).status, 401);
});
