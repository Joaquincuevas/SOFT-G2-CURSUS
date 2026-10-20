import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

export class CrearInscripcion1792470000000 implements MigrationInterface {
  name = 'CrearInscripcion1792470000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Permiten que inscripcion referencie (seccion, universidad) y (usuario,
    // universidad), igual que seccion con curso.
    await queryRunner.query(`
      ALTER TABLE seccion
        ADD CONSTRAINT uq_seccion_id_universidad UNIQUE (id, universidad_id)
    `)
    await queryRunner.query(`
      ALTER TABLE usuario
        ADD CONSTRAINT uq_usuario_id_universidad UNIQUE (id, universidad_id)
    `)

    // Alumno inscrito en una sección (GES-15). Las FKs compuestas aseguran que
    // la sección y el alumno sean de la misma universidad que la inscripción.
    // Nada se elimina: una inscripción se archiva con archived_at (GES-19).
    await queryRunner.query(`
      CREATE TABLE inscripcion (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_inscripcion PRIMARY KEY (id),
        CONSTRAINT fk_inscripcion_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inscripcion_usuario FOREIGN KEY (usuario_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      )
    `)

    // Un alumno no queda dos veces en la misma sección; una inscripción
    // archivada no cuenta, así que se puede volver a inscribir. El índice
    // empieza por seccion_id y cubre el conteo de alumnos por sección.
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_inscripcion_seccion_usuario
        ON inscripcion (seccion_id, usuario_id) WHERE archived_at IS NULL
    `)
    // Para las FKs y las búsquedas de las secciones de un alumno.
    await queryRunner.query(`
      CREATE INDEX ix_inscripcion_usuario ON inscripcion (usuario_id)
    `)

    await queryRunner.query(`
      CREATE TRIGGER tg_inscripcion_updated_at
        BEFORE UPDATE ON inscripcion
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS igual que CrearSeccion: ENABLE y no FORCE. Cada universidad lee y
    // escribe solo sus inscripciones; el Director lee todas y no escribe
    // ninguna. Sin DELETE.
    const deSuUniversidad = 'universidad_id = universidad_actual()'
    const puedeEscribir = `${deSuUniversidad} AND rol_actual() <> 'DIRECTOR'`
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON inscripcion TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE inscripcion ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_inscripcion_lectura ON inscripcion
        FOR SELECT TO ${ROL_APP}
        USING (${deSuUniversidad} OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_inscripcion_insercion ON inscripcion
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_inscripcion_modificacion ON inscripcion
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, políticas, trigger y permisos.
    await queryRunner.query(`DROP TABLE inscripcion`)
    await queryRunner.query(
      `ALTER TABLE usuario DROP CONSTRAINT uq_usuario_id_universidad`,
    )
    await queryRunner.query(
      `ALTER TABLE seccion DROP CONSTRAINT uq_seccion_id_universidad`,
    )
  }
}
