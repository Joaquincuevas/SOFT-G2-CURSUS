import type { MigrationInterface, QueryRunner } from 'typeorm'

// HIS-03: protege también las escrituras directas del rol de la aplicación.
// El dueño conserva el acceso de mantenimiento a los registros históricos.
export class ProtegerArchivoCurso1792920000000 implements MigrationInterface {
  name = 'ProtegerArchivoCurso1792920000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION public.validar_archivo_curso() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
      BEGIN
        IF public.rol_actual() IS DISTINCT FROM 'ADMINISTRATIVO' OR NOT EXISTS (
          SELECT 1 FROM public.carrera ca
           WHERE ca.id = NEW.carrera_id AND ca.universidad_id = NEW.universidad_id
             AND ca.facultad_id = public.facultad_actual(public.usuario_actual())
        ) THEN
          RAISE EXCEPTION 'Solo el administrativo de la facultad puede archivar el curso'
            USING ERRCODE = '42501';
        END IF;
        IF NOT public.curso_cerrado(NEW.id) THEN
          RAISE EXCEPTION 'Solo se pueden archivar cursos cerrados'
            USING ERRCODE = '23514', CONSTRAINT = 'ck_curso_archivado_cerrado';
        END IF;
        RETURN NEW;
      END
      $$;

      CREATE TRIGGER tg_validar_archivo_curso
        BEFORE INSERT OR UPDATE OF archived_at ON curso
        FOR EACH ROW
        WHEN (current_user = 'cursus_app' AND NEW.archived_at IS NOT NULL)
        EXECUTE FUNCTION public.validar_archivo_curso();
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER tg_validar_archivo_curso ON curso')
    await q.query('DROP FUNCTION public.validar_archivo_curso()')
  }
}
