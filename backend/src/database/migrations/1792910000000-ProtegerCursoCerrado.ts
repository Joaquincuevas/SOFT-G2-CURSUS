import type { MigrationInterface, QueryRunner } from 'typeorm'

const TABLAS = [
  ['evaluacion', 'seccion_id'],
  ['nota', 'evaluacion_id'],
  ['revision_notas', 'evaluacion_id'],
  ['clase', 'seccion_id'],
  ['asistencia', 'clase_id'],
] as const

// HIS-02: las escrituras de la API toman el bloqueo del curso antes de tocar
// filas académicas. Los triggers también protegen las escrituras directas.
export class ProtegerCursoCerrado1792910000000 implements MigrationInterface {
  name = 'ProtegerCursoCerrado1792910000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION public.registro_academico_abierto(
        seccion uuid, universidad uuid, esperar boolean
      ) RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE curso uuid;
      BEGIN
        -- Tras esperar el lock hay que poder ver el cierre que se confirmó.
        IF current_setting('transaction_isolation') <> 'read committed' THEN
          RAISE EXCEPTION 'El registro académico requiere READ COMMITTED' USING ERRCODE = '0A000';
        END IF;
        IF esperar THEN
          SELECT c.id INTO curso FROM public.seccion s
            JOIN public.curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
           WHERE s.id = seccion AND s.universidad_id = universidad
             FOR SHARE OF c;
        ELSE
          -- Un UPDATE directo ya tiene bloqueada la fila que dispara el
          -- trigger. NOWAIT evita invertir el orden con el cierre de HIS-01.
          SELECT c.id INTO curso FROM public.seccion s
            JOIN public.curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
           WHERE s.id = seccion AND s.universidad_id = universidad
             FOR SHARE OF c NOWAIT;
        END IF;
        RETURN NOT EXISTS (
          SELECT 1 FROM public.cierre_curso cc WHERE cc.id = curso AND cc.universidad_id = universidad
        );
      END
      $$;
      REVOKE ALL ON FUNCTION public.registro_academico_abierto(uuid, uuid, boolean) FROM PUBLIC;

      CREATE FUNCTION public.registro_academico_abierto(seccion uuid) RETURNS boolean
      LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT public.registro_academico_abierto(seccion, public.universidad_actual(), true)
      $$;
      REVOKE ALL ON FUNCTION public.registro_academico_abierto(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.registro_academico_abierto(uuid) TO cursus_app;

      CREATE FUNCTION public.proteger_registro_academico() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE
        filas jsonb[] := ARRAY[]::jsonb[];
        fila jsonb;
        universidad uuid;
        padre uuid;
        seccion uuid;
      BEGIN
        IF TG_OP <> 'INSERT' THEN filas := array_append(filas, to_jsonb(OLD)); END IF;
        IF TG_OP <> 'DELETE' THEN filas := array_append(filas, to_jsonb(NEW)); END IF;
        FOREACH fila IN ARRAY filas LOOP
          universidad := (fila->>'universidad_id')::uuid;
          padre := (fila->>TG_ARGV[0])::uuid;
          CASE TG_ARGV[0]
            WHEN 'seccion_id' THEN seccion := padre;
            WHEN 'evaluacion_id' THEN
              SELECT e.seccion_id INTO seccion FROM public.evaluacion e
               WHERE e.id = padre AND e.universidad_id = universidad;
            WHEN 'clase_id' THEN
              SELECT c.seccion_id INTO seccion FROM public.clase c
               WHERE c.id = padre AND c.universidad_id = universidad;
          END CASE;
          IF NOT public.registro_academico_abierto(seccion, universidad, false) THEN
            RAISE EXCEPTION 'Curso cerrado' USING ERRCODE = '42501';
          END IF;
        END LOOP;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END
      $$;
      REVOKE ALL ON FUNCTION public.proteger_registro_academico() FROM PUBLIC;
    `)
    for (const [tabla, padre] of TABLAS) {
      await q.query(`
        CREATE TRIGGER a_his02_curso_abierto
        BEFORE INSERT OR UPDATE OR DELETE ON ${tabla}
        FOR EACH ROW EXECUTE FUNCTION public.proteger_registro_academico('${padre}')
      `)
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const [tabla] of TABLAS) {
      await q.query(`DROP TRIGGER a_his02_curso_abierto ON ${tabla}`)
    }
    await q.query('DROP FUNCTION public.proteger_registro_academico()')
    await q.query('DROP FUNCTION public.registro_academico_abierto(uuid)')
    await q.query(
      'DROP FUNCTION public.registro_academico_abierto(uuid, uuid, boolean)',
    )
  }
}
