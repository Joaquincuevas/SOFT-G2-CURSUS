import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-01 (RN-10): evaluaciones de una sección, con nombre, fecha y ponderación
// entera en porcentaje. Nada se elimina: una evaluación se archiva con
// archived_at.
export class CrearEvaluacion1792540000000 implements MigrationInterface {
  name = 'CrearEvaluacion1792540000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas (con las claves de CrearInscripcion) aseguran que la
    // sección y el profesor que la creó sean de la misma universidad.
    await q.query(`
      CREATE TABLE evaluacion (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        nombre text NOT NULL,
        fecha date NOT NULL,
        ponderacion smallint NOT NULL,
        creada_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_evaluacion PRIMARY KEY (id),
        CONSTRAINT fk_evaluacion_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_evaluacion_creada_por FOREIGN KEY (creada_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_evaluacion_nombre CHECK (
          nombre = btrim(nombre) AND length(nombre) BETWEEN 1 AND 100
        ),
        CONSTRAINT ck_evaluacion_ponderacion CHECK (ponderacion BETWEEN 1 AND 100)
      )
    `)
    // Cubre fk_evaluacion_seccion y la lista de una sección por fecha.
    await q.query(`
      CREATE INDEX ix_evaluacion_seccion_fecha ON evaluacion (seccion_id, fecha)
    `)
    await q.query(`
      CREATE INDEX ix_evaluacion_creada_por ON evaluacion (creada_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_evaluacion_updated_at
        BEFORE UPDATE ON evaluacion
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearHorarioSeccion: ENABLE y no FORCE. Cada
    // universidad lee las suyas y el Director todas, en solo lectura (ADR
    // 0001). Solo el profesor escribe; que la sección sea suya lo exige el
    // controlador (no hay función de contexto para el usuario de la sesión).
    // Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`GRANT SELECT, INSERT, UPDATE ON evaluacion TO cursus_app`)
    await q.query(`ALTER TABLE evaluacion ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_evaluacion_lectura ON evaluacion
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_evaluacion_insercion ON evaluacion
        FOR INSERT TO cursus_app
        WITH CHECK (${puedeEscribir})
    `)
    await q.query(`
      CREATE POLICY pol_evaluacion_modificacion ON evaluacion
        FOR UPDATE TO cursus_app
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE evaluacion')
  }
}
