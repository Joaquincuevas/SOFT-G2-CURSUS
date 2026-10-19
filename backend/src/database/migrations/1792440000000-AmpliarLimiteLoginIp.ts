import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AmpliarLimiteLoginIp1792440000000 implements MigrationInterface {
  name = 'AmpliarLimiteLoginIp1792440000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE limite_login DROP CONSTRAINT ck_limite_login_maximo`,
    )
    await queryRunner.query(
      `ALTER TABLE limite_login ADD CONSTRAINT ck_limite_login_maximo CHECK (cardinality(fallos) <= 20)`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // La versión anterior conserva hasta cinco marcas por contador.
    await queryRunner.query(
      `UPDATE limite_login SET fallos = fallos[1:5] WHERE cardinality(fallos) > 5`,
    )
    await queryRunner.query(
      `ALTER TABLE limite_login DROP CONSTRAINT ck_limite_login_maximo`,
    )
    await queryRunner.query(
      `ALTER TABLE limite_login ADD CONSTRAINT ck_limite_login_maximo CHECK (cardinality(fallos) <= 5)`,
    )
  }
}
