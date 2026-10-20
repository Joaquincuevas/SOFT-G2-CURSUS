import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AsignarProfesorSeccion1792480000000 implements MigrationInterface {
  name = 'AsignarProfesorSeccion1792480000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // GES-12 (RN-05): una sola columna, así que una sección tiene a lo más un
    // profesor a cargo y reasignar reemplaza al anterior. La FK compuesta usa
    // uq_usuario_id_universidad (de CrearInscripcion) y asegura que el
    // profesor sea de la misma universidad que la sección; que tenga el rol
    // PROFESOR lo verifica GestionService.asignarProfesor. NULL = sin profesor
    // (la FK no se revisa).
    await queryRunner.query(`
      ALTER TABLE seccion
        ADD COLUMN profesor_id uuid,
        ADD CONSTRAINT fk_seccion_profesor FOREIGN KEY (profesor_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
    `)

    // Cubre fk_seccion_profesor y las búsquedas de las secciones de un profesor.
    await queryRunner.query(`
      CREATE INDEX ix_seccion_profesor ON seccion (profesor_id, universidad_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la columna se borran su FK y su índice.
    await queryRunner.query(`ALTER TABLE seccion DROP COLUMN profesor_id`)
  }
}
