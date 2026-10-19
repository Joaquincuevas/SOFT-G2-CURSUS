import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearSesionAuth1792430000000 implements MigrationInterface {
  name = 'CrearSesionAuth1792430000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sesion_auth (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id uuid NOT NULL REFERENCES usuario(id),
        revocado_en timestamptz
      )
    `)
    // Nullable para que la versión anterior pueda seguir insertando tokens
    // durante un despliegue o rollback. La versión nueva exige sesión.
    await queryRunner.query(`
      ALTER TABLE refresh_token ADD COLUMN sesion_id uuid REFERENCES sesion_auth(id)
    `)
    await queryRunner.query(`
      INSERT INTO sesion_auth (id, usuario_id, revocado_en)
      SELECT id, usuario_id, revocado_en FROM refresh_token
    `)
    await queryRunner.query(`UPDATE refresh_token SET sesion_id = id`)
    await queryRunner.query(
      `CREATE INDEX ix_sesion_auth_usuario ON sesion_auth(usuario_id) WHERE revocado_en IS NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX ix_refresh_token_sesion ON refresh_token(sesion_id)`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE refresh_token DROP COLUMN sesion_id`)
    await queryRunner.query(`DROP TABLE sesion_auth`)
  }
}
