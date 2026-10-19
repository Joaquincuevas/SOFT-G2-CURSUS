import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearIntentosLogin1792436000000 implements MigrationInterface {
  name = 'CrearIntentosLogin1792436000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE limite_login (
        clave char(64) PRIMARY KEY,
        fallos timestamptz[] NOT NULL DEFAULT '{}',
        CONSTRAINT ck_limite_login_maximo CHECK (cardinality(fallos) <= 5)
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE limite_login`)
  }
}
