import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

export class CrearCurso1792443000000 implements MigrationInterface {
  name = 'CrearCurso1792443000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Permiten que curso referencie (carrera, universidad) y (periodo,
    // universidad), igual que carrera con facultad.
    await queryRunner.query(`
      ALTER TABLE carrera
        ADD CONSTRAINT uq_carrera_id_universidad UNIQUE (id, universidad_id)
    `)
    await queryRunner.query(`
      ALTER TABLE periodo
        ADD CONSTRAINT uq_periodo_id_universidad UNIQUE (id, universidad_id)
    `)

    // Las FK compuestas aseguran que la carrera y el período sean de la misma
    // universidad que el curso. Nada se elimina: los cursos se archivan con
    // archived_at, y un curso archivado sigue ocupando su código en el período.
    await queryRunner.query(`
      CREATE TABLE curso (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        carrera_id uuid NOT NULL,
        periodo_id uuid NOT NULL,
        codigo text NOT NULL,
        nombre text NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_curso PRIMARY KEY (id),
        CONSTRAINT fk_curso_carrera FOREIGN KEY (carrera_id, universidad_id)
          REFERENCES carrera (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_curso_periodo FOREIGN KEY (periodo_id, universidad_id)
          REFERENCES periodo (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT uq_curso_codigo_periodo UNIQUE (codigo, periodo_id),
        CONSTRAINT ck_curso_codigo CHECK (btrim(codigo) <> ''),
        CONSTRAINT ck_curso_nombre CHECK (btrim(nombre) <> '')
      )
    `)

    // Cubre fk_curso_carrera y las consultas por facultad (a través de carrera).
    await queryRunner.query(`
      CREATE INDEX ix_curso_carrera ON curso (carrera_id, universidad_id)
    `)

    await queryRunner.query(`
      CREATE TRIGGER tg_curso_updated_at
        BEFORE UPDATE ON curso
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de PermitirLecturaDirector: cada universidad lee y
    // escribe solo sus cursos; el Director lee todos y no escribe ninguno. Sin
    // DELETE para cursus_app: nada se elimina.
    const deSuUniversidad = 'universidad_id = universidad_actual()'
    const puedeEscribir = `${deSuUniversidad} AND rol_actual() <> 'DIRECTOR'`
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON curso TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE curso ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_curso_lectura ON curso
        FOR SELECT TO ${ROL_APP}
        USING (${deSuUniversidad} OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_curso_insercion ON curso
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_curso_modificacion ON curso
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus políticas, índices, trigger y permisos.
    await queryRunner.query(`DROP TABLE curso`)
    await queryRunner.query(
      `ALTER TABLE periodo DROP CONSTRAINT uq_periodo_id_universidad`,
    )
    await queryRunner.query(
      `ALTER TABLE carrera DROP CONSTRAINT uq_carrera_id_universidad`,
    )
  }
}
