import type { MigrationInterface, QueryRunner } from 'typeorm'

// MAT-08 (RN-08): actividades de entrega de una sección, con título,
// instrucciones y fecha y hora límite. Una actividad está cerrada cuando su
// plazo ya pasó: se calcula al leerla, no se guarda. Nada se elimina: una
// actividad se archiva con archived_at.
export class CrearActividad1792610000000 implements MigrationInterface {
  name = 'CrearActividad1792610000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas (con las claves de CrearInscripcion) aseguran que la
    // sección y el profesor que la creó sean de la misma universidad.
    await q.query(`
      CREATE TABLE actividad (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        titulo text NOT NULL,
        instrucciones text NOT NULL,
        plazo timestamptz NOT NULL,
        creada_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_actividad PRIMARY KEY (id),
        CONSTRAINT fk_actividad_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_actividad_creada_por FOREIGN KEY (creada_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_actividad_titulo CHECK (
          titulo = btrim(titulo) AND length(titulo) BETWEEN 1 AND 100
        ),
        CONSTRAINT ck_actividad_instrucciones CHECK (
          length(btrim(instrucciones)) BETWEEN 1 AND 2000
        )
      )
    `)
    // Cubre fk_actividad_seccion y la lista de una sección por plazo.
    await q.query(`
      CREATE INDEX ix_actividad_seccion_plazo ON actividad (seccion_id, plazo)
    `)
    await q.query(`
      CREATE INDEX ix_actividad_creada_por ON actividad (creada_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_actividad_updated_at
        BEFORE UPDATE ON actividad
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearEvaluacion: ENABLE y no FORCE. Cada
    // universidad lee las suyas y el Director todas, en solo lectura (ADR
    // 0001). Solo el profesor escribe; que la sección sea suya lo exige el
    // servicio (no hay función de contexto para el usuario de la sesión).
    // Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`GRANT SELECT, INSERT, UPDATE ON actividad TO cursus_app`)
    await q.query(`ALTER TABLE actividad ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_actividad_lectura ON actividad
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_actividad_insercion ON actividad
        FOR INSERT TO cursus_app
        WITH CHECK (${puedeEscribir})
    `)
    await q.query(`
      CREATE POLICY pol_actividad_modificacion ON actividad
        FOR UPDATE TO cursus_app
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE actividad')
  }
}
