import type { MigrationInterface, QueryRunner } from 'typeorm'

// ASI-04 (RN-13, RE-05): corrección atómica con el valor realmente reemplazado.
// Se conserva el registro original (fecha y profesor) y el historial es inmutable.
// RLS del historial aísla universidad/rol; el servicio exige profesor de la sección.
export class CrearAsistenciaCambio1792690000000 implements MigrationInterface {
  name = 'CrearAsistenciaCambio1792690000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE asistencia
        ADD CONSTRAINT uq_asistencia_id_universidad UNIQUE (id, universidad_id)
    `)
    await q.query(`
      CREATE TABLE asistencia_cambio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        asistencia_id uuid NOT NULL,
        anterior boolean NOT NULL,
        nuevo boolean NOT NULL,
        motivo text NOT NULL,
        responsable_id uuid NOT NULL,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT fk_asistencia_cambio_asistencia FOREIGN KEY (asistencia_id, universidad_id)
          REFERENCES asistencia (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asistencia_cambio_responsable FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_asistencia_cambio_valores CHECK (anterior <> nuevo),
        CONSTRAINT ck_asistencia_cambio_motivo CHECK (
          length(motivo) BETWEEN 1 AND 500 AND motivo = btrim(motivo)
          AND motivo ~ '[^[:space:]]'
        )
      )
    `)
    await q.query(
      `CREATE INDEX ix_asistencia_cambio_fecha ON asistencia_cambio (asistencia_id, fecha, id)`,
    )
    await q.query(
      `CREATE INDEX ix_asistencia_cambio_responsable ON asistencia_cambio (responsable_id, universidad_id)`,
    )
    await q.query('GRANT SELECT, INSERT ON asistencia_cambio TO cursus_app')
    await q.query('ALTER TABLE asistencia_cambio ENABLE ROW LEVEL SECURITY')
    const permitido = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`
      CREATE POLICY pol_asistencia_cambio_lectura ON asistencia_cambio
        FOR SELECT TO cursus_app USING (${permitido})
    `)
    await q.query(`
      CREATE POLICY pol_asistencia_cambio_insercion ON asistencia_cambio
        FOR INSERT TO cursus_app WITH CHECK (${permitido})
    `)
    await q.query(`
      CREATE FUNCTION asistencia_cambio_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'El historial de asistencia es de solo adición'
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_asistencia_cambio_inmutable
        BEFORE UPDATE OR DELETE ON asistencia_cambio
        FOR EACH ROW EXECUTE FUNCTION asistencia_cambio_inmutable()
    `)
    await q.query(`
      CREATE FUNCTION auditar_correccion_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        profesor uuid := NULLIF(current_setting('app.asistencia_profesor_id', true), '')::uuid;
        razon text := btrim(current_setting('app.asistencia_motivo', true));
      BEGIN
        IF NEW.presente IS DISTINCT FROM OLD.presente THEN
          IF OLD.archived_at IS NOT NULL OR profesor IS NULL OR NOT EXISTS (
            SELECT 1 FROM clase c
              JOIN seccion s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
              JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
              JOIN usuario u ON u.id = s.profesor_id AND u.universidad_id = s.universidad_id
             WHERE c.id = OLD.clase_id AND c.universidad_id = OLD.universidad_id
               AND s.profesor_id = profesor AND u.rol = 'PROFESOR'
               AND c.archived_at IS NULL AND s.archived_at IS NULL
               AND cu.archived_at IS NULL AND u.archived_at IS NULL
          ) THEN
            RAISE EXCEPTION 'Solo el profesor vigente de la sección puede corregir la asistencia'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          INSERT INTO asistencia_cambio
            (universidad_id, asistencia_id, anterior, nuevo, motivo, responsable_id)
          VALUES (OLD.universidad_id, OLD.id, OLD.presente, NEW.presente, razon, profesor);
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_asistencia_correccion BEFORE UPDATE ON asistencia
        FOR EACH ROW EXECUTE FUNCTION auditar_correccion_asistencia()
    `)
    // El endpoint del alumno fija el id desde la sesión, nunca desde el body.
    await q.query(`
      ALTER POLICY pol_asistencia_lectura ON asistencia USING (
        (universidad_id = universidad_actual() AND (rol_actual() <> 'ALUMNO'
          OR alumno_id::text = current_setting('app.asistencia_alumno_id', true)))
        OR rol_actual() = 'DIRECTOR')
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER POLICY pol_asistencia_lectura ON asistencia
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query('DROP TRIGGER tg_asistencia_correccion ON asistencia')
    await q.query('DROP FUNCTION auditar_correccion_asistencia()')
    await q.query('DROP TABLE asistencia_cambio')
    await q.query('DROP FUNCTION asistencia_cambio_inmutable()')
    await q.query(
      'ALTER TABLE asistencia DROP CONSTRAINT uq_asistencia_id_universidad',
    )
  }
}
