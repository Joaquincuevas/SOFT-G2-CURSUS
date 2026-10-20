import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearHistorialCurso1792480000000 implements MigrationInterface {
  name = 'CrearHistorialCurso1792480000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE curso_cambio (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      universidad_id uuid NOT NULL,
      curso_id uuid NOT NULL,
      responsable_id uuid NOT NULL,
      fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
      anterior jsonb NOT NULL,
      nuevo jsonb NOT NULL,
      CONSTRAINT fk_curso_cambio_curso FOREIGN KEY (curso_id, universidad_id)
        REFERENCES curso (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT fk_curso_cambio_responsable FOREIGN KEY (responsable_id, universidad_id)
        REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT ck_curso_cambio_objetos CHECK (jsonb_typeof(anterior) = 'object' AND jsonb_typeof(nuevo) = 'object'),
      CONSTRAINT ck_curso_cambio_distinto CHECK (anterior <> nuevo)
    )`)
    await q.query(
      `CREATE INDEX ix_curso_cambio_curso_fecha ON curso_cambio (curso_id, fecha, id)`,
    )
    // Historial de solo adición: la API no puede modificar ni borrar entradas.
    await q.query(`GRANT SELECT, INSERT ON curso_cambio TO cursus_app`)
    await q.query(`ALTER TABLE curso_cambio ENABLE ROW LEVEL SECURITY`)
    await q.query(`CREATE POLICY pol_curso_cambio_lectura ON curso_cambio
      FOR SELECT TO cursus_app USING (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
    await q.query(`CREATE POLICY pol_curso_cambio_insercion ON curso_cambio
      FOR INSERT TO cursus_app WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE curso_cambio')
  }
}
