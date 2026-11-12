import type { MigrationInterface, QueryRunner } from 'typeorm'

// GES-26: conserva el historial de GES-19 y agrega el motivo del retiro.
// Nullable para las inscripciones históricas y los clientes anteriores.
export class MotivoRetiroAlumno1792850000000 implements MigrationInterface {
  name = 'MotivoRetiroAlumno1792850000000'
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE inscripcion ADD COLUMN motivo_retiro text,
      ADD CONSTRAINT ck_inscripcion_motivo_retiro CHECK (motivo_retiro IS NULL OR
        (archived_at IS NOT NULL AND motivo_retiro=btrim(motivo_retiro)
         AND length(motivo_retiro) BETWEEN 1 AND 500))`)
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE inscripcion DROP COLUMN motivo_retiro')
  }
}
