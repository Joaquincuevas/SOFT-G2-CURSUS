import type { MigrationInterface, QueryRunner } from 'typeorm'

export class RecuperarPassword1792980000000 implements MigrationInterface {
  name = 'RecuperarPassword1792980000000'

  async up(q: QueryRunner): Promise<void> {
    // Solo la conexión de autenticación accede a esta tabla.
    await q.query(`
      CREATE TABLE recuperacion_password (
        usuario_id uuid PRIMARY KEY REFERENCES usuario(id) ON DELETE RESTRICT,
        hash text NOT NULL UNIQUE,
        credencial bytea NOT NULL,
        expira_en timestamptz NOT NULL
      )
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE recuperacion_password')
  }
}
