import type { MigrationInterface, QueryRunner } from 'typeorm'

// GES-19: quitar a un alumno de una sección archiva su inscripción y guarda
// quién lo hizo. Con archived_at (la fecha) queda el registro que leerá el
// historial de GES-14; no hay tabla aparte.
export class ArchivarInscripcionConResponsable1792500000000 implements MigrationInterface {
  name = 'ArchivarInscripcionConResponsable1792500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La FK compuesta asegura que el responsable sea de la misma universidad.
    // El CHECK exige las dos columnas juntas: no hay archivo sin responsable.
    await queryRunner.query(`
      ALTER TABLE inscripcion
        ADD COLUMN archivada_por uuid,
        ADD CONSTRAINT fk_inscripcion_archivada_por
          FOREIGN KEY (archivada_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        ADD CONSTRAINT ck_inscripcion_archivada_por
          CHECK ((archived_at IS NULL) = (archivada_por IS NULL))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la columna se borran su FK y su CHECK.
    await queryRunner.query(`ALTER TABLE inscripcion DROP COLUMN archivada_por`)
  }
}
