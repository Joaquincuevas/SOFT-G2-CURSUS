import type { MigrationInterface, QueryRunner } from 'typeorm'

const PROFESOR =
  "universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'"
const PROFESOR_DE_SECCION = `${PROFESOR} AND archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM seccion s
     WHERE s.id = evaluacion.seccion_id
       AND s.universidad_id = evaluacion.universidad_id
       AND s.archived_at IS NULL
       AND es_profesor_de_seccion(s.id, usuario_actual())
  )`

// Misma clave que bloquearNotasDe. El SQL directo puede llegar al trigger
// con la fila ya bloqueada; fallar y reintentar evita invertir el orden de
// locks del servicio, que toma primero el lock de notas.
const BLOQUEAR_NOTAS = (id: string) => `
  IF NOT pg_try_advisory_xact_lock(hashtextextended('notas:' || ${id}::text, 0)) THEN
    RAISE EXCEPTION 'Hay una escritura en curso para esta evaluación; reintente'
      USING ERRCODE = '40001';
  END IF;`

// NOT-03: protege la edición también por SQL y registra la versión
// reemplazada con el usuario de sesión en la misma transacción.
export class CrearEvaluacionCambio1792800000000 implements MigrationInterface {
  name = 'CrearEvaluacionCambio1792800000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE evaluacion_cambio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        evaluacion_id uuid NOT NULL,
        responsable_id uuid NOT NULL,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        anterior jsonb NOT NULL,
        nuevo jsonb NOT NULL,
        FOREIGN KEY (evaluacion_id, universidad_id)
          REFERENCES evaluacion (id, universidad_id) ON DELETE RESTRICT,
        FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CHECK (anterior <> nuevo)
      )
    `)
    await q.query(`CREATE INDEX ix_evaluacion_cambio_historial
      ON evaluacion_cambio (evaluacion_id, fecha, id)`)
    await q.query('ALTER TABLE evaluacion_cambio ENABLE ROW LEVEL SECURITY')
    await q.query(`
      ALTER POLICY pol_evaluacion_modificacion ON evaluacion
        USING (${PROFESOR_DE_SECCION})
        WITH CHECK (${PROFESOR_DE_SECCION})
    `)
    await q.query('REVOKE UPDATE ON evaluacion FROM cursus_app')
    await q.query(
      'GRANT UPDATE (nombre, fecha, ponderacion) ON evaluacion TO cursus_app',
    )

    // El trigger es el único escritor de la auditoría. Ni el actor ni los
    // valores vienen del cliente. El search_path no permite sombrear objetos
    // de la migración desde una sesión de cursus_app.
    await q.query(`
      CREATE FUNCTION public.validar_y_auditar_edicion_evaluacion() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE
        responsable uuid := public.usuario_actual();
      BEGIN
        -- Fija la sección, la asignación vigente y la cuenta antes de
        -- comprobar el permiso. Quitar un co-profesor puede no tocar seccion.
        -- En SQL directo la evaluación ya está bloqueada; NOWAIT evita
        -- esperar en orden inverso al servicio, que bloquea primero la sección.
        PERFORM 1 FROM public.seccion s
          JOIN public.seccion_profesor sp
            ON sp.seccion_id = s.id AND sp.universidad_id = s.universidad_id
          JOIN public.usuario u
            ON u.id = sp.usuario_id AND u.universidad_id = sp.universidad_id
         WHERE s.id = OLD.seccion_id AND s.universidad_id = OLD.universidad_id
           AND s.archived_at IS NULL
           AND sp.usuario_id = responsable AND sp.archived_at IS NULL
         FOR SHARE OF s, sp, u NOWAIT;
        IF NOT FOUND OR OLD.archived_at IS NOT NULL
          OR OLD.universidad_id IS DISTINCT FROM public.universidad_actual()
          OR public.rol_actual() IS DISTINCT FROM 'PROFESOR'
          OR NOT public.es_profesor_de_seccion(OLD.seccion_id, responsable) THEN
          RAISE EXCEPTION 'Solo el profesor de la sección edita evaluaciones'
            USING ERRCODE = '42501';
        END IF;

        ${BLOQUEAR_NOTAS('OLD.id')}
        -- La comprobación debe ver las notas confirmadas antes de tomar el
        -- lock. No se admite una instantánea fija anterior a ese punto.
        IF current_setting('transaction_isolation') <> 'read committed' THEN
          RAISE EXCEPTION 'La edición requiere el aislamiento READ COMMITTED'
            USING ERRCODE = '0A000';
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.nota n
           WHERE n.evaluacion_id = OLD.id AND n.universidad_id = OLD.universidad_id
        ) THEN
          RAISE EXCEPTION 'La evaluación ya tiene notas ingresadas'
            USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.evaluacion_cambio
          (universidad_id, evaluacion_id, responsable_id, anterior, nuevo)
        VALUES (
          OLD.universidad_id, OLD.id, responsable,
          jsonb_build_object('nombre', OLD.nombre, 'fecha', OLD.fecha,
                             'ponderacion', OLD.ponderacion),
          jsonb_build_object('nombre', NEW.nombre, 'fecha', NEW.fecha,
                             'ponderacion', NEW.ponderacion)
        );
        RETURN NEW;
      END
      $$
    `)
    await q.query(
      'REVOKE EXECUTE ON FUNCTION public.validar_y_auditar_edicion_evaluacion() FROM PUBLIC',
    )
    await q.query(`
      CREATE TRIGGER tg_evaluacion_validar_edicion
        BEFORE UPDATE OF nombre, fecha, ponderacion ON evaluacion
        FOR EACH ROW
        WHEN ((OLD.nombre, OLD.fecha, OLD.ponderacion)
          IS DISTINCT FROM (NEW.nombre, NEW.fecha, NEW.ponderacion))
        EXECUTE FUNCTION public.validar_y_auditar_edicion_evaluacion()
    `)

    // Una nota nueva tampoco puede pasar por SQL directo mientras la
    // edición comprueba la ausencia de notas y guarda el cambio.
    await q.query(`
      CREATE FUNCTION public.bloquear_nueva_nota_para_edicion() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$
      BEGIN
        ${BLOQUEAR_NOTAS('NEW.evaluacion_id')}
        RETURN NEW;
      END
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_nota_bloquear_evaluacion
        BEFORE INSERT OR UPDATE OF evaluacion_id, universidad_id ON nota
        FOR EACH ROW EXECUTE FUNCTION public.bloquear_nueva_nota_para_edicion()
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER tg_nota_bloquear_evaluacion ON nota')
    await q.query('DROP FUNCTION public.bloquear_nueva_nota_para_edicion()')
    await q.query('DROP TRIGGER tg_evaluacion_validar_edicion ON evaluacion')
    await q.query('DROP FUNCTION public.validar_y_auditar_edicion_evaluacion()')
    await q.query(`
      ALTER POLICY pol_evaluacion_modificacion ON evaluacion
        USING (${PROFESOR}) WITH CHECK (${PROFESOR})
    `)
    await q.query(
      'REVOKE UPDATE (nombre, fecha, ponderacion) ON evaluacion FROM cursus_app',
    )
    await q.query('GRANT UPDATE ON evaluacion TO cursus_app')
    await q.query('DROP TABLE evaluacion_cambio')
  }
}
