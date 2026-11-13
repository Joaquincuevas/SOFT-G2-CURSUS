import type { MigrationInterface, QueryRunner } from 'typeorm'

// HIS-06: el egreso conserva la identidad académica y el acceso de lectura.
export class RegistrarEgreso1792950000000 implements MigrationInterface {
  name = 'RegistrarEgreso1792950000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE usuario ADD COLUMN egresado_en timestamptz,
        ADD CONSTRAINT ck_usuario_egresado
        CHECK (egresado_en IS NULL OR (rol = 'ALUMNO' AND archived_at IS NULL))
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE usuario DROP COLUMN egresado_en')
  }
}
