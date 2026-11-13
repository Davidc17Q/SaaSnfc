import { pool } from './pool';

/**
 * Busca UNA empresa por nombre exacto (sin distinguir mayúsculas) para los
 * scripts de mantenimiento. Si hay varias con ese nombre no adivina: antes se
 * elegía "la que tiene más sedes", y eso habría apuntado a la empresa real de
 * un cliente en cuanto superara a su demo. Con varias, exige --empresa-id.
 */
export interface FoundCompany {
  id: string;
  name: string;
  isDemo: boolean;
}

export async function findCompanyByName(name: string, id?: string): Promise<FoundCompany | null> {
  if (id) {
    const r = await pool.query<{ id: string; name: string; is_demo: boolean }>(
      `SELECT id, name, is_demo FROM companies WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) throw new Error(`No existe una empresa con id ${id}.`);
    return { id: r.rows[0].id, name: r.rows[0].name, isDemo: r.rows[0].is_demo };
  }
  // "Hogar y Moda" encuentra también "Hogar y Moda (demo)".
  const r = await pool.query<{ id: string; name: string; slug: string; is_demo: boolean; sedes: string }>(
    `SELECT c.id, c.name, c.slug, c.is_demo,
            (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.id) AS sedes
       FROM companies c
      WHERE lower(regexp_replace(c.name, '\\s*\\(demo\\)\\s*$', '', 'i')) = lower(regexp_replace($1, '\\s*\\(demo\\)\\s*$', '', 'i'))
      ORDER BY c.created_at`,
    [name]
  );
  // Si alguna está marcada como demo, los scripts de demo se quedan con esa.
  const demos = r.rows.filter((c) => c.is_demo);
  const pick = demos.length === 1 ? demos : r.rows;
  if (pick.length > 1) {
    const list = pick.map((c) => `   ${c.id}  ${c.name} (${c.slug}, ${c.sedes} sedes${c.is_demo ? ', demo' : ''})`).join('\n');
    throw new Error(`Hay ${pick.length} empresas llamadas "${name}". Indica cuál con --empresa-id <id>:\n${list}`);
  }
  return pick[0] ? { id: pick[0].id, name: pick[0].name, isDemo: pick[0].is_demo } : null;
}
