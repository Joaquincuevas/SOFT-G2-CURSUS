import type { MigrationInterface, QueryRunner } from 'typeorm'

// MT-04 (ADR 0002): auditoría de todo lo que el superadmin crea o modifica.
// Un trigger por tabla institucional guarda la fila anterior y la nueva, sin
// depender de que cada servicio se acuerde de registrar el cambio. Es de solo
// adición, como nota_cambio.
const ROL_APP = 'cursus_app'

// Tablas con datos de una universidad que el superadmin puede escribir. Las
// auditorías (curso_cambio, asignacion_cambio y nota_cambio) no van: son el
// registro de otros cambios. Una tabla nueva con universidad_id debe sumarse
// en su propia migración (lo exige el contrato de test/multitenant/rls).
const TABLAS_AUDITADAS = [
  'universidad',
  'facultad',
  'carrera',
  'periodo',
  'usuario',
  'curso',
  'seccion',
  'inscripcion',
  'ayudante_seccion',
  'horario_seccion',
  'evaluacion',
  'clase',
  'anuncio',
  'asistencia',
]

export class CrearSuperadminCambio1792653000000 implements MigrationInterface {
  name = 'CrearSuperadminCambio1792653000000'

  async up(q: QueryRunner): Promise<void> {
    // anterior es NULL al crear. motivo, cuando la acción lo pide (por
    // ejemplo, archivar en GES-23 y GES-24): lo fija la API con
    // set_config('app.motivo').
    await q.query(`
      CREATE TABLE superadmin_cambio (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        superadmin_id uuid NOT NULL,
        tabla text NOT NULL,
        registro_id uuid NOT NULL,
        operacion text NOT NULL,
        anterior jsonb,
        nuevo jsonb NOT NULL,
        motivo text,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT pk_superadmin_cambio PRIMARY KEY (id),
        CONSTRAINT fk_superadmin_cambio_universidad FOREIGN KEY (universidad_id)
          REFERENCES universidad (id) ON DELETE RESTRICT,
        CONSTRAINT fk_superadmin_cambio_superadmin FOREIGN KEY (superadmin_id)
          REFERENCES usuario (id) ON DELETE RESTRICT,
        CONSTRAINT ck_superadmin_cambio_operacion CHECK (
          (operacion = 'INSERT' AND anterior IS NULL)
          OR (operacion = 'UPDATE' AND anterior IS NOT NULL)
        ),
        CONSTRAINT ck_superadmin_cambio_motivo CHECK (
          motivo IS NULL OR length(btrim(motivo)) BETWEEN 1 AND 500
        )
      )
    `)
    await q.query(`
      CREATE INDEX ix_superadmin_cambio_registro
        ON superadmin_cambio (tabla, registro_id, fecha, id)
    `)
    await q.query(`
      CREATE INDEX ix_superadmin_cambio_universidad_fecha
        ON superadmin_cambio (universidad_id, fecha, id)
    `)

    // SECURITY DEFINER: escribe como dueño de las tablas, así que la API no
    // necesita (ni tiene) INSERT sobre la auditoría. password_hash nunca se
    // guarda. Un UPDATE que no cambia nada no deja registro.
    await q.query(`
      CREATE FUNCTION auditar_superadmin() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE
        anterior jsonb;
        nuevo jsonb := to_jsonb(NEW) - 'password_hash';
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          anterior := to_jsonb(OLD) - 'password_hash';
          IF anterior = nuevo THEN
            RETURN NULL;
          END IF;
        END IF;
        INSERT INTO superadmin_cambio
          (universidad_id, superadmin_id, tabla, registro_id, operacion,
           anterior, nuevo, motivo)
        VALUES (
          (CASE WHEN TG_TABLE_NAME = 'universidad' THEN nuevo->>'id'
                ELSE nuevo->>'universidad_id' END)::uuid,
          superadmin_actual(),
          TG_TABLE_NAME,
          (nuevo->>'id')::uuid,
          TG_OP,
          anterior,
          nuevo,
          NULLIF(btrim(current_setting('app.motivo', true)), '')
        );
        RETURN NULL;
      END;
      $$
    `)
    // Solo corre cuando la consulta es de un superadmin (app.superadmin_id).
    for (const tabla of TABLAS_AUDITADAS) {
      await q.query(`
        CREATE TRIGGER tg_${tabla}_auditar_superadmin
          AFTER INSERT OR UPDATE ON ${tabla}
          FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
          EXECUTE FUNCTION auditar_superadmin()
      `)
    }

    // Defensa adicional, como en nota_cambio: ni el dueño de la tabla
    // modifica ni borra un registro.
    await q.query(`
      CREATE FUNCTION superadmin_cambio_inmutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'superadmin_cambio es de solo adición: no se puede %', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_superadmin_cambio_inmutable
        BEFORE UPDATE OR DELETE ON superadmin_cambio
        FOR EACH ROW EXECUTE FUNCTION superadmin_cambio_inmutable()
    `)

    // La API solo la lee, y solo un superadmin (para una vista futura). No
    // tiene INSERT: escribe el trigger.
    await q.query(`GRANT SELECT ON superadmin_cambio TO ${ROL_APP}`)
    await q.query(`ALTER TABLE superadmin_cambio ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_superadmin_cambio_lectura ON superadmin_cambio
        FOR SELECT TO ${ROL_APP}
        USING (rol_actual() = 'SUPERADMIN')
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    for (const tabla of TABLAS_AUDITADAS) {
      await q.query(`DROP TRIGGER tg_${tabla}_auditar_superadmin ON ${tabla}`)
    }
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE superadmin_cambio')
    await q.query('DROP FUNCTION superadmin_cambio_inmutable()')
    await q.query('DROP FUNCTION auditar_superadmin()')
  }
}
