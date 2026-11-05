import type { MigrationInterface, QueryRunner } from 'typeorm'

// ASI-06/RN-13: mismo denominador que ASI-05 sin abrir la RLS de las marcas.
// El dueño solo devuelve un entero; no expone alumnos, marcas ni ids de clase.
// Para ALUMNO exige identidad activa e inscripción vigente en su universidad.
export class ContarClasesAsistencia1792720000000 implements MigrationInterface {
  name = 'ContarClasesAsistencia1792720000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION public.total_clases_asistencia(seccion uuid) RETURNS integer
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT count(*)::int
          FROM public.clase c
          JOIN public.seccion s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
          JOIN public.curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
         WHERE s.id = seccion AND s.universidad_id = public.universidad_actual()
           AND c.archived_at IS NULL AND s.archived_at IS NULL AND cu.archived_at IS NULL
           AND (
             public.rol_actual() = 'PROFESOR'
             OR (public.rol_actual() = 'ALUMNO' AND EXISTS (
               SELECT 1 FROM public.inscripcion i
               JOIN public.usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
                WHERE i.seccion_id = s.id AND i.universidad_id = s.universidad_id
                  AND u.id::text = current_setting('app.asistencia_alumno_id', true)
                  AND u.rol = 'ALUMNO' AND u.archived_at IS NULL AND i.archived_at IS NULL
             ))
           )
           AND EXISTS (
             SELECT 1 FROM public.asistencia a
              WHERE a.clase_id = c.id AND a.universidad_id = c.universidad_id
                AND a.archived_at IS NULL
           )
      $$
    `)
    await q.query(
      'REVOKE ALL ON FUNCTION public.total_clases_asistencia(uuid) FROM PUBLIC',
    )
    await q.query(
      'GRANT EXECUTE ON FUNCTION public.total_clases_asistencia(uuid) TO cursus_app',
    )
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION public.total_clases_asistencia(uuid)')
  }
}
