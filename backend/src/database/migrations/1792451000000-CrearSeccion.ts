import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

export class CrearSeccion1792451000000 implements MigrationInterface {
  name = 'CrearSeccion1792451000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Permite que seccion referencie (curso, universidad), igual que curso con
    // carrera y periodo.
    await queryRunner.query(`
      ALTER TABLE curso
        ADD CONSTRAINT uq_curso_id_universidad UNIQUE (id, universidad_id)
    `)

    // La FK compuesta asegura que la sección sea de la misma universidad que su
    // curso. Nada se elimina: las secciones se archivan con archived_at, y una
    // archivada sigue ocupando su número en el curso.
    await queryRunner.query(`
      CREATE TABLE seccion (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        curso_id uuid NOT NULL,
        numero integer NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_seccion PRIMARY KEY (id),
        CONSTRAINT fk_seccion_curso FOREIGN KEY (curso_id, universidad_id)
          REFERENCES curso (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT uq_seccion_curso_numero UNIQUE (curso_id, numero),
        CONSTRAINT ck_seccion_numero CHECK (numero > 0)
      )
    `)

    // Sin índice aparte para la FK: uq_seccion_curso_numero empieza por
    // curso_id y cubre las búsquedas de secciones por curso.
    await queryRunner.query(`
      CREATE TRIGGER tg_seccion_updated_at
        BEFORE UPDATE ON seccion
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de PermitirLecturaDirector y CrearCurso: ENABLE y no
    // FORCE (el dueño de las tablas sigue sin RLS; la API pasa por las
    // políticas con cursus_app). Cada universidad lee y escribe solo sus
    // secciones; el Director lee todas y no escribe ninguna. Sin DELETE.
    const deSuUniversidad = 'universidad_id = universidad_actual()'
    const puedeEscribir = `${deSuUniversidad} AND rol_actual() <> 'DIRECTOR'`
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON seccion TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE seccion ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_seccion_lectura ON seccion
        FOR SELECT TO ${ROL_APP}
        USING (${deSuUniversidad} OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_seccion_insercion ON seccion
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_seccion_modificacion ON seccion
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus políticas, trigger y permisos.
    await queryRunner.query(`DROP TABLE seccion`)
    await queryRunner.query(
      `ALTER TABLE curso DROP CONSTRAINT uq_curso_id_universidad`,
    )
  }
}
