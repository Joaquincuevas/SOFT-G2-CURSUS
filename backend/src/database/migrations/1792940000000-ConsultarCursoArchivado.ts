import type { MigrationInterface, QueryRunner } from 'typeorm'

// HIS-04: lectura puntual del registro de un curso archivado. Las políticas
// de notas y asistencia conservan el acceso habitual para cursos vigentes.
export class ConsultarCursoArchivado1792940000000 implements MigrationInterface {
  name = 'ConsultarCursoArchivado1792940000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION public.consultar_curso_archivado(p_curso uuid) RETURNS jsonb
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
        SELECT jsonb_build_object(
          'id', c.id, 'codigo', c.codigo, 'nombre', c.nombre,
          'carreraNombre', ca.nombre, 'archivadoEn', c.archived_at,
          'periodo', jsonb_build_object('id', p.id, 'anio', p.anio, 'semestre', p.semestre),
          'secciones', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', s.id, 'numero', s.numero,
              'evaluaciones', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', e.id, 'nombre', e.nombre, 'fecha', to_char(e.fecha, 'YYYY-MM-DD'),
                  'ponderacion', e.ponderacion,
                  'notas', coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                      'alumnoId', n.alumno_id, 'alumno', u.nombre, 'valor', n.valor
                    ) ORDER BY u.nombre, u.id)
                      FROM public.nota n
                      JOIN public.usuario u ON u.id = n.alumno_id AND u.universidad_id = n.universidad_id
                     WHERE n.evaluacion_id = e.id AND n.universidad_id = e.universidad_id
                       AND n.archived_at IS NULL AND n.estado = 'PUBLICADA'
                  ), '[]'::jsonb)
                ) ORDER BY e.fecha, e.id)
                  FROM public.evaluacion e
                 WHERE e.seccion_id = s.id AND e.universidad_id = s.universidad_id
                   AND e.archived_at IS NULL
              ), '[]'::jsonb),
              'clases', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', cl.id, 'fecha', to_char(cl.fecha, 'YYYY-MM-DD'), 'sala', cl.sala,
                  'inicio', to_char(cl.inicio, 'HH24:MI'), 'termino', to_char(cl.termino, 'HH24:MI'),
                  'marcas', coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                      'alumnoId', a.alumno_id, 'alumno', u.nombre, 'presente', a.presente
                    ) ORDER BY u.nombre, u.id)
                      FROM public.asistencia a
                      JOIN public.usuario u ON u.id = a.alumno_id AND u.universidad_id = a.universidad_id
                     WHERE a.clase_id = cl.id AND a.universidad_id = cl.universidad_id
                       AND a.archived_at IS NULL
                  ), '[]'::jsonb)
                ) ORDER BY cl.fecha, cl.inicio, cl.id)
                  FROM public.clase cl
                 WHERE cl.seccion_id = s.id AND cl.universidad_id = s.universidad_id
                   AND cl.archived_at IS NULL
              ), '[]'::jsonb)
            ) ORDER BY s.numero)
              FROM public.seccion s
             WHERE s.curso_id = c.id AND s.universidad_id = c.universidad_id
               AND s.archived_at IS NULL
          ), '[]'::jsonb)
        )
          FROM public.curso c
          JOIN public.carrera ca ON ca.id = c.carrera_id AND ca.universidad_id = c.universidad_id
          JOIN public.periodo p ON p.id = c.periodo_id AND p.universidad_id = c.universidad_id
         WHERE c.id = p_curso AND c.archived_at IS NOT NULL
           AND c.universidad_id = public.universidad_actual()
           AND public.rol_actual() = 'ADMINISTRATIVO'
           AND ca.facultad_id = public.facultad_actual(public.usuario_actual())
      $$;
      REVOKE ALL ON FUNCTION public.consultar_curso_archivado(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.consultar_curso_archivado(uuid) TO cursus_app;
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION public.consultar_curso_archivado(uuid)')
  }
}
