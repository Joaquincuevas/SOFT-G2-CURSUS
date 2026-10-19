import type { MigrationInterface, QueryRunner } from 'typeorm'

// Nada institucional se borra: se archiva marcando archived_at. NULL significa
// vigente. Es nullable, así que no requiere migrar datos existentes.
const TABLAS = ['universidad', 'facultad', 'carrera', 'usuario']

export class AgregarArchivado1792441000000 implements MigrationInterface {
  name = 'AgregarArchivado1792441000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of TABLAS) {
      await queryRunner.query(
        `ALTER TABLE ${tabla} ADD COLUMN archived_at timestamptz`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of TABLAS) {
      await queryRunner.query(`ALTER TABLE ${tabla} DROP COLUMN archived_at`)
    }
  }
}
