import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CrearHorarioSeccion1792510000000 implements MigrationInterface {
  name = 'CrearHorarioSeccion1792510000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE seccion
      ADD COLUMN horario_version integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT ck_seccion_horario_version CHECK (horario_version >= 0)`)
    await q.query(`CREATE TABLE horario_seccion (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      universidad_id uuid NOT NULL,
      seccion_id uuid NOT NULL,
      dia smallint NOT NULL,
      inicio time NOT NULL,
      termino time NOT NULL,
      sala varchar(100) NOT NULL,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_horario_seccion PRIMARY KEY (id),
      CONSTRAINT fk_horario_seccion_seccion FOREIGN KEY (seccion_id, universidad_id)
        REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT ck_horario_seccion_dia CHECK (dia BETWEEN 1 AND 7),
      CONSTRAINT ck_horario_seccion_horas CHECK (
        inicio < termino AND termino < time '24:00'
        AND EXTRACT(SECOND FROM inicio) = 0 AND EXTRACT(SECOND FROM termino) = 0),
      CONSTRAINT ck_horario_seccion_sala CHECK (sala = btrim(sala) AND length(sala) > 0)
    )`)
    await q.query(`CREATE UNIQUE INDEX ux_horario_seccion_inicio_activo
      ON horario_seccion (seccion_id, dia, inicio) WHERE archived_at IS NULL`)
    await q.query(`CREATE TRIGGER tg_horario_seccion_updated_at
      BEFORE UPDATE ON horario_seccion
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()`)
    await q.query(
      `GRANT SELECT, INSERT, UPDATE ON horario_seccion TO cursus_app`,
    )
    await q.query(`ALTER TABLE horario_seccion ENABLE ROW LEVEL SECURITY`)
    await q.query(`CREATE POLICY pol_horario_seccion_lectura ON horario_seccion
      FOR SELECT TO cursus_app
      USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')`)
    await q.query(`CREATE POLICY pol_horario_seccion_insercion ON horario_seccion
      FOR INSERT TO cursus_app
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
    await q.query(`CREATE POLICY pol_horario_seccion_modificacion ON horario_seccion
      FOR UPDATE TO cursus_app
      USING (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE horario_seccion')
    await q.query('ALTER TABLE seccion DROP COLUMN horario_version')
  }
}
