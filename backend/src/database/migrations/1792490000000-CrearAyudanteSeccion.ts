import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearAyudanteSeccion1792490000000 implements MigrationInterface {
  name = 'CrearAyudanteSeccion1792490000000'

  async up(q: QueryRunner): Promise<void> {
    // Las claves compuestas ya existen desde CrearInscripcion y evitan
    // asociar una sección y un usuario de universidades distintas.
    await q.query(`
      CREATE TABLE ayudante_seccion (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_ayudante_seccion_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_ayudante_seccion_usuario FOREIGN KEY (usuario_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      )
    `)
    // GES-14 podrá archivar una asignación sin borrar su historial.
    await q.query(`CREATE UNIQUE INDEX ux_ayudante_seccion_activo
      ON ayudante_seccion (seccion_id, usuario_id) WHERE archived_at IS NULL`)
    await q.query(
      `CREATE INDEX ix_ayudante_seccion_usuario ON ayudante_seccion (usuario_id)`,
    )
    await q.query(`CREATE TRIGGER tg_ayudante_seccion_updated_at
      BEFORE UPDATE ON ayudante_seccion
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()`)
    await q.query(
      `GRANT SELECT, INSERT, UPDATE ON ayudante_seccion TO cursus_app`,
    )
    await q.query(`ALTER TABLE ayudante_seccion ENABLE ROW LEVEL SECURITY`)
    await q.query(`CREATE POLICY pol_ayudante_seccion_lectura ON ayudante_seccion
      FOR SELECT TO cursus_app
      USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')`)
    await q.query(`CREATE POLICY pol_ayudante_seccion_insercion ON ayudante_seccion
      FOR INSERT TO cursus_app
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
    await q.query(`CREATE POLICY pol_ayudante_seccion_modificacion ON ayudante_seccion
      FOR UPDATE TO cursus_app
      USING (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE ayudante_seccion')
  }
}
