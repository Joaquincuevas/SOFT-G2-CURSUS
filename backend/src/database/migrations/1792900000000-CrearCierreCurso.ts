import type { MigrationInterface, QueryRunner } from 'typeorm'

// HIS-01: un registro de cierre por curso. La función comprueba las notas
// sin conceder al administrativo permisos para leer las calificaciones.
export class CrearCierreCurso1792900000000 implements MigrationInterface {
  name = 'CrearCierreCurso1792900000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE cierre_curso (
        id uuid PRIMARY KEY,
        universidad_id uuid NOT NULL,
        responsable_id uuid NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT fk_cierre_curso FOREIGN KEY (id, universidad_id)
          REFERENCES curso (id, universidad_id) ON DELETE RESTRICT
      );

      ALTER TABLE cierre_curso ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON cierre_curso TO cursus_app;
      CREATE POLICY pol_cierre_curso_lectura ON cierre_curso
        FOR SELECT TO cursus_app USING (
          rol_actual() = 'DIRECTOR' OR (
            rol_actual() = 'ADMINISTRATIVO' AND universidad_id = universidad_actual()
          )
        );

      CREATE TRIGGER tg_cierre_curso_auditar_superadmin
        AFTER INSERT ON cierre_curso FOR EACH ROW
        WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin();
    `)
    await q.query(`
      CREATE FUNCTION public.cerrar_curso(curso uuid) RETURNS jsonb
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
      DECLARE
        universidad uuid := public.universidad_actual();
        responsable uuid := public.usuario_actual();
        cerrado timestamptz;
        cierre jsonb;
        pendientes jsonb;
      BEGIN
        IF public.rol_actual() IS DISTINCT FROM 'ADMINISTRATIVO' OR responsable IS NULL THEN
          RETURN NULL;
        END IF;

        -- Serializa los cierres del mismo curso y las nuevas secciones.
        PERFORM 1 FROM public.curso c
          JOIN public.carrera ca ON ca.id = c.carrera_id AND ca.universidad_id = c.universidad_id
         WHERE c.id = curso AND c.universidad_id = universidad AND c.archived_at IS NULL
           AND ca.facultad_id = public.facultad_actual(responsable)
           FOR UPDATE OF c;
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;

        SELECT jsonb_build_object('fecha', cc.fecha, 'responsableId', cc.responsable_id)
          INTO cierre
          FROM public.cierre_curso cc WHERE cc.id = curso;
        IF FOUND THEN
          RETURN cierre;
        END IF;

        -- Las FK de inscripciones y evaluaciones toman KEY SHARE en la
        -- sección. Bloquear las secciones fija el conjunto antes de validar.
        PERFORM 1 FROM public.seccion s
         WHERE s.curso_id = curso AND s.universidad_id = universidad
         ORDER BY s.id FOR UPDATE;

        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'evaluacionId', e.id, 'nombre', e.nombre, 'seccion', s.numero,
                 'notasPendientes', faltan.total
               ) ORDER BY s.numero, e.fecha, e.id), '[]'::jsonb) INTO pendientes
          FROM public.seccion s
          JOIN public.evaluacion e ON e.seccion_id = s.id AND e.universidad_id = s.universidad_id
          CROSS JOIN LATERAL (
            SELECT count(*)::int AS total
              FROM public.inscripcion i
              JOIN public.usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
             WHERE i.seccion_id = s.id AND i.universidad_id = s.universidad_id
               AND i.archived_at IS NULL AND u.archived_at IS NULL AND u.rol = 'ALUMNO'
               AND NOT EXISTS (
                 SELECT 1 FROM public.nota n
                  WHERE n.evaluacion_id = e.id AND n.universidad_id = e.universidad_id
                    AND n.alumno_id = i.usuario_id AND n.archived_at IS NULL AND n.estado = 'PUBLICADA'
               )
          ) faltan
         WHERE s.curso_id = curso AND s.universidad_id = universidad
           AND s.archived_at IS NULL AND e.archived_at IS NULL
           AND (faltan.total > 0 OR NOT EXISTS (
             SELECT 1 FROM public.nota n
              WHERE n.evaluacion_id = e.id AND n.universidad_id = e.universidad_id
                AND n.archived_at IS NULL AND n.estado = 'PUBLICADA'
           ));

        IF jsonb_array_length(pendientes) > 0 THEN
          RETURN jsonb_build_object('pendientes', pendientes);
        END IF;

        INSERT INTO public.cierre_curso (id, universidad_id, responsable_id)
          VALUES (curso, universidad, responsable) RETURNING fecha INTO cerrado;
        RETURN jsonb_build_object('fecha', cerrado, 'responsableId', responsable);
      END
      $$;

      REVOKE ALL ON FUNCTION public.cerrar_curso(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.cerrar_curso(uuid) TO cursus_app;
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION public.cerrar_curso(uuid)')
    await q.query('DROP TABLE cierre_curso')
  }
}
