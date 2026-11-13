import { pool } from './pool';

/**
 * Busca UNA empresa por nombre exacto (sin distinguir mayúsculas) para los
 * scripts de mantenimiento. Si hay varias con ese nombre no adivina: antes se
 * elegía "la que tiene más sedes", y eso habría apuntado a la empresa real de
 * un cliente en cuanto superara a su demo. Con varias, exige --empresa-id.
 */
export async function findCompanyByName(
  name: string,
  id?: string
): Promise<{ id: string; name: string } | null> {
  if (id) {
    const r = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new Error(`No existe una empresa con id ${id}.`);
    return r.rows[0];
  }
  const r = await pool.query<{ id: string; name: string; slug: string; sedes: string }>(
    `SELECT c.id, c.name, c.slug,
            (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.id) AS sedes
       FROM companies c
      WHERE lower(c.name) = lower($1)
      ORDER BY c.created_at`,
    [name]
  );
  if (r.rows.length > 1) {
    const list = r.rows.map((c) => `   ${c.id}  ${c.name} (${c.slug}, ${c.sedes} sedes)`).join('\n');
    throw new Error(`Hay ${r.rows.length} empresas llamadas "${name}". Indica cuál con --empresa-id <id>:\n${list}`);
  }
  return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name } : null;
}
