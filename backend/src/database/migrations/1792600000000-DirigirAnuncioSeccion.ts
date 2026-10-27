import type { MigrationInterface, QueryRunner } from 'typeorm'

// NULL conserva los anuncios de ANU-01 para todo el curso. La FK compuesta
// impide dirigir un anuncio a una sección de otro curso o universidad.
export class DirigirAnuncioSeccion1792600000000 implements MigrationInterface {
  name = 'DirigirAnuncioSeccion1792600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE seccion ADD CONSTRAINT
      uq_seccion_id_curso_universidad UNIQUE (id, curso_id, universidad_id)`)
    await queryRunner.query(`ALTER TABLE anuncio
      ADD COLUMN seccion_id uuid,
      ADD CONSTRAINT fk_anuncio_seccion
        FOREIGN KEY (seccion_id, curso_id, universidad_id)
        REFERENCES seccion (id, curso_id, universidad_id) ON DELETE RESTRICT`)
    await queryRunner.query(`CREATE INDEX ix_anuncio_seccion_fecha
      ON anuncio (seccion_id, created_at DESC, id) WHERE seccion_id IS NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No convertir anuncios privados en generales al revertir: conservar
    // el contenido archivado antes de quitar el destinatario.
    await queryRunner.query(`UPDATE anuncio SET archived_at = COALESCE(archived_at, now())
      WHERE seccion_id IS NOT NULL`)
    await queryRunner.query(`DROP INDEX ix_anuncio_seccion_fecha`)
    await queryRunner.query(`ALTER TABLE anuncio DROP COLUMN seccion_id`)
    await queryRunner.query(
      `ALTER TABLE seccion DROP CONSTRAINT uq_seccion_id_curso_universidad`,
    )
  }
}
