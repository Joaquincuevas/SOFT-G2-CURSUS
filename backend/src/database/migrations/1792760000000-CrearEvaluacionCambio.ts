import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-03: historial de solo adición de los cambios de una evaluación.
export class CrearEvaluacionCambio1792760000000 implements MigrationInterface {
  name = 'CrearEvaluacionCambio1792760000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE evaluacion_cambio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        evaluacion_id uuid NOT NULL,
        responsable_id uuid NOT NULL,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        anterior jsonb NOT NULL,
        nuevo jsonb NOT NULL,
        FOREIGN KEY (evaluacion_id, universidad_id)
          REFERENCES evaluacion (id, universidad_id) ON DELETE RESTRICT,
        FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CHECK (anterior <> nuevo)
      )
    `)
    await q.query(`CREATE INDEX ix_evaluacion_cambio_historial
      ON evaluacion_cambio (evaluacion_id, fecha, id)`)
    await q.query('ALTER TABLE evaluacion_cambio ENABLE ROW LEVEL SECURITY')
    await q.query('GRANT INSERT ON evaluacion_cambio TO cursus_app')
    await q.query(`
      CREATE POLICY pol_evaluacion_cambio_insercion ON evaluacion_cambio
        FOR INSERT TO cursus_app WITH CHECK (
          universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'
          AND responsable_id = usuario_actual()
          AND EXISTS (
            SELECT 1 FROM evaluacion e JOIN seccion s
              ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
             WHERE e.id = evaluacion_cambio.evaluacion_id
               AND e.universidad_id = evaluacion_cambio.universidad_id
               AND s.profesor_id = usuario_actual()
               AND s.archived_at IS NULL AND e.archived_at IS NULL
          )
        )
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE evaluacion_cambio')
  }
}
