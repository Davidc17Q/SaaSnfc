/**
 * Alta masiva de una cadena: vista previa que no guarda, carga en una
 * transacción, recarga sin duplicar ni cambiar códigos, y descargas de montaje.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, makeTenant, login, call, scan, ADMIN, type Ctx, type Tenant } from './helpers';

let ctx: Ctx;
let admin: string;
let other: Tenant;
let companyId: string;

const TEMPLATE = [
  { role: 'resenas', label: 'Reseñas', type: 'column_url', column: 'ficha_google' },
  { role: 'credito', label: 'Crédito', type: 'column_whatsapp', column: 'whatsapp_credito', message: 'Hola, quiero crédito.' },
  { role: 'canal', label: 'Canal de WhatsApp', type: 'fixed', url: 'https://whatsapp.com/channel/ABC123' },
];
const HEAD = 'Sede;Ciudad;Dirección;Lote;Ficha Google;WhatsApp crédito';
const sheet = (...rows: string[]) => '﻿' + [HEAD, ...rows].join('\r\n');
const GOOD = sheet(
  'Junín Principal;Medellín;Cra. 49 #48-43;1;https://g.page/r/junin/review;300 123 4567',
  'Bello Uno;Bello;"Cl. 49 #49-80; local 2";3;https://g.page/r/bello/review;3007654321',
  'Rionegro;Rionegro;Cra. 50 #48-10;4;https://g.page/r/rionegro/review;+57 301 555 0000'
);

const body = (csv: string, template: unknown = TEMPLATE) => ({ companyId, csv, template });
const counts = async () => {
  const r = await ctx.pool.query(
    `SELECT (SELECT COUNT(*)::int FROM locations WHERE company_id = $1) AS locs,
            (SELECT COUNT(*)::int FROM devices d JOIN locations l ON l.id = d.location_id WHERE l.company_id = $1) AS devs`,
    [companyId]
  );
  return r.rows[0] as { locs: number; devs: number };
};
const codes = async () =>
  (
    await ctx.pool.query(
      `SELECT l.name, d.role, d.code, d.target_url FROM devices d JOIN locations l ON l.id = d.location_id
        WHERE l.company_id = $1 ORDER BY l.name, d.role`,
      [companyId]
    )
  ).rows as { name: string; role: string; code: string; target_url: string }[];

before(async () => {
  ctx = await setup();
  admin = await login(ADMIN.user, ADMIN.password);
  other = await makeTenant('Ajena');
  const co = await call('POST', '/api/companies', admin, { name: 'Cadena Prueba' });
  companyId = co.json.company.id;
});
after(teardown);

test('solo el superadmin puede usarla', async () => {
  for (const [method, url] of [
    ['POST', '/api/admin/import/preview'], ['POST', '/api/admin/import/commit'],
    ['GET', `/api/admin/import/${companyId}/setup`], ['GET', `/api/admin/import/${companyId}/chips.csv`],
    ['GET', `/api/admin/import/${companyId}/habladores`], ['POST', `/api/admin/import/${companyId}/demo`],
    ['PUT', `/api/admin/import/${companyId}/logo`],
  ] as const) {
    assert.equal((await call(method, url, other.cookie, body(GOOD))).status, 403, `${method} ${url} (cliente)`);
    assert.equal((await call(method, url, undefined, body(GOOD))).status, 401, `${method} ${url} (sin sesión)`);
  }
  assert.deepEqual(await counts(), { locs: 0, devs: 0 });
});

test('la vista previa valida y no guarda nada', async () => {
  const p = (await call('POST', '/api/admin/import/preview', admin, body(GOOD))).json;
  assert.equal(p.ok, true);
  assert.deepEqual([p.summary.rows, p.summary.create, p.summary.withErrors, p.summary.pointsCreate], [3, 3, 0, 9]);
  const junin = p.rows.find((r: any) => r.name === 'Junín Principal');
  assert.equal(junin.points.find((x: any) => x.role === 'credito').url, 'https://wa.me/573001234567?text=Hola%2C%20quiero%20cr%C3%A9dito.');
  assert.equal(junin.points.find((x: any) => x.role === 'canal').url, 'https://whatsapp.com/channel/ABC123');
  assert.equal(p.rows.find((r: any) => r.name === 'Bello Uno').address, 'Cl. 49 #49-80; local 2');
  assert.equal(p.rows.find((r: any) => r.name === 'Rionegro').points[1].url.startsWith('https://wa.me/573015550000'), true);
  assert.deepEqual(await counts(), { locs: 0, devs: 0 });
});

test('detecta duplicados, vacíos y enlaces inválidos o inseguros; con errores no se guarda', async () => {
  const bad = sheet(
    'Uno;Medellín;;1;https://g.page/r/uno/review;3001112233',
    'UNO ;Medellín;;1;https://g.page/r/uno2/review;3001112233', // duplicado (mayúsculas y espacio)
    ';Bello;;1;https://g.page/r/x/review;3001112233', // sin nombre
    'Dos;;;1;https://g.page/r/dos/review;3001112233', // sin ciudad
    'Tres;Envigado;;2;javascript:alert(1);3001112233', // enlace inseguro
    'Cuatro;Envigado;;2;g.page/sin-protocolo;3001112233', // enlace inválido
    'Cinco;Itagüí;;2;https://g.page/r/cinco/review;12345', // celular inválido
    'Seis;Itagüí;;2;;3001112233', // ficha vacía sin destino provisional
    'Siete;Itagüí;;2;https://g.page/r/siete/review;3001112233' // correcta
  );
  const p = (await call('POST', '/api/admin/import/preview', admin, body(bad))).json;
  assert.equal(p.ok, false);
  assert.equal(p.summary.withErrors, 8);
  const err = (name: string) => (p.rows.find((r: any) => r.name === name)?.errors || []).join(' | ');
  assert.match(err('Uno'), /repetida/);
  assert.match(err('UNO'), /repetida/);
  assert.match(p.rows[2].errors.join(' '), /nombre/);
  assert.match(err('Dos'), /ciudad/);
  assert.match(err('Tres'), /no es un enlace válido/);
  assert.match(err('Cuatro'), /no es un enlace válido/);
  assert.match(err('Cinco'), /celular/);
  assert.match(err('Seis'), /vacía/);
  assert.equal(err('Siete'), '');

  const commit = await call('POST', '/api/admin/import/commit', admin, body(bad));
  assert.equal(commit.status, 400);
  assert.deepEqual(await counts(), { locs: 0, devs: 0 }, 'una hoja con errores no debe guardar nada');
});

test('problemas de la hoja o de la plantilla completa', async () => {
  const fatal = async (csv: string, tpl: unknown = TEMPLATE) => (await call('POST', '/api/admin/import/preview', admin, body(csv, tpl))).json.fatal;
  assert.match(await fatal('Sede;Ciudad\r\nUno;Bello'), /Faltan columnas/);
  assert.match(await fatal(HEAD), /vacía/);
  assert.match(await fatal(GOOD, []), /al menos un punto/);
  assert.match(await fatal(GOOD, [{ ...TEMPLATE[2], url: 'javascript:alert(1)' }]), /no es válido/);
  assert.match(await fatal(GOOD, [{ ...TEMPLATE[2], url: '' }]), /Falta el enlace/);
  assert.equal((await call('POST', '/api/admin/import/preview', admin, { companyId: 'x', csv: GOOD, template: TEMPLATE })).status, 400);
});

test('carga todo y los puntos quedan funcionando en el motor /r/', async () => {
  const r = await call('POST', '/api/admin/import/commit', admin, body(GOOD));
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.locationsCreated, r.json.pointsCreated], [3, 9]);
  assert.deepEqual(await counts(), { locs: 3, devs: 9 });
  const all = await codes();
  assert.equal(new Set(all.map((d) => d.code)).size, 9, 'códigos únicos');
  const junin = all.find((d) => d.name === 'Junín Principal' && d.role === 'resenas')!;
  const res = await scan(junin.code, { query: '?s=q' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://g.page/r/junin/review');
  const loc = (await ctx.pool.query(`SELECT brand, batch, address, import_key FROM locations WHERE name = 'Bello Uno'`)).rows[0];
  assert.deepEqual(loc, { brand: 'Cadena Prueba', batch: '3', address: 'Cl. 49 #49-80; local 2', import_key: 'bello uno' });
  // La empresa ajena no cambió.
  assert.equal((await ctx.pool.query('SELECT COUNT(*)::int AS n FROM locations WHERE company_id = $1', [other.companyId])).rows[0].n, 1);
});

test('volver a cargar la misma hoja no duplica ni cambia nada', async () => {
  const before = await codes();
  const p = (await call('POST', '/api/admin/import/preview', admin, body(GOOD))).json;
  assert.deepEqual([p.summary.create, p.summary.update, p.summary.same], [0, 0, 3]);
  const r = await call('POST', '/api/admin/import/commit', admin, body(GOOD));
  assert.deepEqual([r.json.locationsCreated, r.json.locationsUpdated, r.json.pointsCreated, r.json.pointsUpdated], [0, 0, 0, 0]);
  assert.deepEqual(await codes(), before);
});

test('recarga con cambios: actualiza, conserva los códigos y borra la caché del punto', async () => {
  const before = await codes();
  const bello = before.find((d) => d.name === 'Bello Uno' && d.role === 'resenas')!;
  assert.equal((await scan(bello.code, { ip: '191.1.1.1' })).headers.location, 'https://g.page/r/bello/review'); // llena la caché

  const changed = sheet(
    'JUNÍN PRINCIPAL;Medellín;Cra. 49 #48-43;1;https://g.page/r/junin/review;300 123 4567', // mismo nombre, otras mayúsculas
    'Bello Uno;Bello;Cl. 49 #49-80;3;https://g.page/r/bello-NUEVA/review;3007654321', // cambia ficha y dirección
    'Rionegro;Rionegro;Cra. 50 #48-10;4;https://g.page/r/rionegro/review;3015550000',
    'Caldas;Caldas;Cl. 130 Sur #48-20;3;https://g.page/r/caldas/review;3109998877' // nueva
  );
  const p = (await call('POST', '/api/admin/import/preview', admin, body(changed))).json;
  assert.deepEqual([p.summary.create, p.summary.update, p.summary.same], [1, 2, 1]);
  const r = await call('POST', '/api/admin/import/commit', admin, body(changed));
  assert.deepEqual([r.json.locationsCreated, r.json.pointsCreated, r.json.pointsUpdated], [1, 3, 1]);
  assert.deepEqual(await counts(), { locs: 4, devs: 12 });

  const after = await codes();
  for (const d of before) {
    const same = after.find((x) => x.role === d.role && x.name.toLowerCase() === d.name.toLowerCase())!;
    assert.equal(same.code, d.code, `el código de ${d.name}/${d.role} cambió`);
  }
  // El chip ya grabado lleva de inmediato al destino nuevo.
  assert.equal((await scan(bello.code, { ip: '191.1.1.2', ua: 'UA-2' })).headers.location, 'https://g.page/r/bello-NUEVA/review');
  assert.equal((await ctx.pool.query(`SELECT name FROM locations WHERE import_key = 'junin principal'`)).rows[0].name, 'JUNÍN PRINCIPAL');
});

test('una sede creada a mano se reconoce por nombre y sus puntos por etiqueta', async () => {
  const loc = await call('POST', '/api/locations', admin, { name: 'Sabaneta', city: 'Sabaneta', company_id: companyId });
  const dev = await call('POST', '/api/devices', admin, { location_id: loc.json.location.id, label: 'reseñas', target_url: 'https://viejo.example/x' });
  const code = dev.json.device.code;
  const csv = sheet('Sabaneta;Sabaneta;Cl. 70 Sur;2;https://g.page/r/sabaneta/review;3201112233');
  const r = await call('POST', '/api/admin/import/commit', admin, body(csv));
  assert.deepEqual([r.json.locationsCreated, r.json.pointsCreated, r.json.pointsUpdated], [0, 2, 1]);
  const row = (await ctx.pool.query(`SELECT role, target_url FROM devices WHERE code = $1`, [code])).rows[0];
  assert.deepEqual(row, { role: 'resenas', target_url: 'https://g.page/r/sabaneta/review' });
  // Las sedes que no vienen en la hoja se avisan y no se tocan.
  const p = (await call('POST', '/api/admin/import/preview', admin, body(csv))).json;
  assert.equal(p.missing.length, 4);
  assert.deepEqual(await counts(), { locs: 5, devs: 15 });
});

test('destino provisional: la sede sin ficha se carga con aviso', async () => {
  const tpl = [{ ...TEMPLATE[0], fallback: 'https://www.google.com/search?q=Hogar+y+Moda' }, TEMPLATE[1], TEMPLATE[2]];
  const csv = sheet('Junín Motos;Medellín;;1;;3005550101');
  const p = (await call('POST', '/api/admin/import/preview', admin, body(csv, tpl))).json;
  assert.equal(p.ok, true);
  assert.equal(p.rows[0].warnings.length, 1);
  assert.equal(p.rows[0].points[0].provisional, true);
  assert.equal((await call('POST', '/api/admin/import/commit', admin, body(csv, tpl))).status, 200);
  const d = (await codes()).find((x) => x.name === 'Junín Motos' && x.role === 'resenas')!;
  assert.equal(d.target_url, 'https://www.google.com/search?q=Hogar+y+Moda');
});

test('si algo falla a mitad de la carga, no queda nada a medias', async () => {
  const before = await counts();
  // Un punto con un código que chocará con el índice único del papel por sede.
  await ctx.pool.query(`CREATE OR REPLACE FUNCTION test_boom() RETURNS trigger AS $$ BEGIN
    IF NEW.name = 'Explota' THEN RAISE EXCEPTION 'fallo simulado'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await ctx.pool.query(`CREATE TRIGGER test_boom BEFORE INSERT ON locations FOR EACH ROW EXECUTE FUNCTION test_boom()`);
  try {
    const csv = sheet(
      'Primera Nueva;Bello;;9;https://g.page/r/p/review;3001110000',
      'Explota;Bello;;9;https://g.page/r/e/review;3001110001'
    );
    const r = await call('POST', '/api/admin/import/commit', admin, body(csv));
    assert.equal(r.status, 500);
  } finally {
    await ctx.pool.query(`DROP TRIGGER test_boom ON locations`);
    await ctx.pool.query(`DROP FUNCTION test_boom()`);
  }
  assert.deepEqual(await counts(), before);
});

test('descargas de montaje: CSV de chips y habladores con los QR reales', async () => {
  const csv = (await call('GET', `/api/admin/import/${companyId}/chips.csv`, admin)).body;
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.match(lines[0], /^Lote;Sede;Ciudad;Dirección;Punto;Enlace para el chip NFC;Enlace del QR/);
  assert.equal(lines.length - 1, (await counts()).devs);
  const d = (await codes()).find((x) => x.name === 'Bello Uno' && x.role === 'credito')!;
  const line = lines.find((l) => l.includes(`/r/${d.code}?s=n`))!;
  assert.ok(line.startsWith('3;Bello Uno;Bello;'), line);
  assert.ok(line.includes(`http://localhost:3000/r/${d.code}?s=q`));

  const html = (await call('GET', `/api/admin/import/${companyId}/habladores?lote=3`, admin)).body;
  assert.match(html, /<title>Habladores · Cadena Prueba · lote 3<\/title>/);
  assert.ok(html.includes(`/r/${d.code}?s=q`), 'el hablador debe llevar el QR real');
  assert.ok(html.includes('"name":"Caldas"') && !html.includes('"name":"Rionegro"'), 'solo las sedes del lote');
  const all = (await call('GET', `/api/admin/import/${companyId}/habladores`, admin)).body;
  assert.ok(all.includes('"name":"Rionegro"'));

  const setupInfo = (await call('GET', `/api/admin/import/${companyId}/setup`, admin)).json;
  assert.equal(setupInfo.locations, (await counts()).locs);
  assert.equal(setupInfo.template.length, 3, 'recuerda la última plantilla usada');
});

test('logo de los habladores: solo imágenes y con tope de tamaño', async () => {
  const url = `/api/admin/import/${companyId}/logo`;
  assert.equal((await call('PUT', url, admin, { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' })).status, 400);
  assert.equal((await call('PUT', url, admin, { dataUrl: 'https://malo.example/x.png' })).status, 400);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal((await call('PUT', url, admin, { dataUrl: png })).status, 200);
  assert.ok((await call('GET', `/api/admin/import/${companyId}/habladores`, admin)).body.includes(png));
  assert.equal((await call('PUT', url, admin, { dataUrl: null })).status, 200);
});

test('marcar como demo: cambia nombre y marca, no los puntos; los scripts la distinguen de la real', async () => {
  const demo = (await call('POST', '/api/companies', admin, { name: 'Marca Unica' })).json.company.id;
  const real = (await call('POST', '/api/companies', admin, { name: 'Marca Unica S.A.S.' })).json.company.id;
  await ctx.pool.query(`UPDATE companies SET name = 'Marca Unica' WHERE id = $1`, [real]); // mismo nombre que la demo
  await call('POST', '/api/locations', admin, { name: 'Sede Demo', brand: 'Marca Unica', city: 'Medellín', company_id: demo });
  const before = (await ctx.pool.query(`SELECT brand FROM locations WHERE company_id = $1`, [demo])).rows[0].brand;

  const { findCompanyByName } = await import('../src/db/find-company');
  await assert.rejects(() => findCompanyByName('Marca Unica'), /Hay 2 empresas/);

  const r = await call('POST', `/api/admin/import/${demo}/demo`, admin, {});
  assert.equal(r.json.name, 'Marca Unica (demo)');
  const loc = (await ctx.pool.query(`SELECT brand FROM locations WHERE company_id = $1`, [demo])).rows[0];
  assert.equal(before, 'Marca Unica');
  assert.equal(loc.brand, 'Marca Unica (demo)');
  // Ahora el script de la demo encuentra la demo, nunca la real.
  const found = await findCompanyByName('Marca Unica');
  assert.equal(found?.id, demo);
  assert.equal(found?.isDemo, true);
  const list = (await call('GET', '/api/companies', admin)).json;
  assert.equal(list.find((c: any) => c.id === demo).isDemo, true);
  assert.equal(list.find((c: any) => c.id === real).isDemo, false);
});
