import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearRefreshToken1792428000000 implements MigrationInterface {
  name = 'CrearRefreshToken1792428000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Refresh tokens opacos (AUTH-04). Solo se guarda el sha256 del token, en
    // hex: con la base filtrada no se puede renovar ninguna sesión. Un token
    // rotado, cerrado o reusado queda con revocado_en; no se borra.
    await queryRunner.query(`
      CREATE TABLE refresh_token (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        usuario_id uuid NOT NULL,
        hash text NOT NULL,
        expira_en timestamptz NOT NULL,
        revocado_en timestamptz,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_refresh_token PRIMARY KEY (id),
        CONSTRAINT fk_refresh_token_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuario (id) ON DELETE RESTRICT,
        CONSTRAINT uq_refresh_token_hash UNIQUE (hash),
        CONSTRAINT ck_refresh_token_hash CHECK (hash ~ '^[0-9a-f]{64}$')
      )
    `)

    // Cubre la FK y la revocación de todos los tokens activos de un usuario.
    await queryRunner.query(`
      CREATE INDEX ix_refresh_token_usuario ON refresh_token (usuario_id)
        WHERE revocado_en IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE refresh_token`)
  }
}
