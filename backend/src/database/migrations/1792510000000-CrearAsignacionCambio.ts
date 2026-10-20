import type { MigrationInterface, QueryRunner } from 'typeorm'

// Historial de asignaciones de profesores y ayudantes a secciones (GES-14).
// Cada fila es un cambio: quién estaba (anterior_id), quién quedó (nuevo_id),
// quién lo hizo, cuándo y por qué. Al quitar una asignación, nuevo_id es NULL.
// Es de solo adición, como curso_cambio: la API no modifica ni borra entradas.
export class CrearAsignacionCambio1792510000000 implements MigrationInterface {
  name = 'CrearAsignacionCambio1792510000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas aseguran que la sección y las personas sean de la
    // misma universidad que la entrada. Con anterior_id o nuevo_id en NULL,
    // su FK no se revisa.
    await q.query(`
      CREATE TABLE asignacion_cambio (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        tipo text NOT NULL,
        anterior_id uuid,
        nuevo_id uuid,
        responsable_id uuid NOT NULL,
        motivo text NOT NULL,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT pk_asignacion_cambio PRIMARY KEY (id),
        CONSTRAINT fk_asignacion_cambio_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asignacion_cambio_anterior FOREIGN KEY (anterior_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asignacion_cambio_nuevo FOREIGN KEY (nuevo_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asignacion_cambio_responsable FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_asignacion_cambio_tipo CHECK (tipo IN ('PROFESOR', 'AYUDANTE')),
        -- Un cambio tiene al menos una persona y no la repite.
        CONSTRAINT ck_asignacion_cambio_distinto CHECK (anterior_id IS DISTINCT FROM nuevo_id),
        CONSTRAINT ck_asignacion_cambio_motivo CHECK (length(btrim(motivo)) BETWEEN 1 AND 500)
      )
    `)
    await q.query(`
      CREATE INDEX ix_asignacion_cambio_seccion_fecha
        ON asignacion_cambio (seccion_id, fecha, id)
    `)

    // Solo adición: sin UPDATE ni DELETE para la API.
    await q.query(`GRANT SELECT, INSERT ON asignacion_cambio TO cursus_app`)
    await q.query(`ALTER TABLE asignacion_cambio ENABLE ROW LEVEL SECURITY`)
    // El Administrativo lee el historial de su universidad y el Director el
    // de todas, en solo lectura (ADR 0001). Los demás roles no lo leen.
    await q.query(`
      CREATE POLICY pol_asignacion_cambio_lectura ON asignacion_cambio
        FOR SELECT TO cursus_app
        USING ((universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')
               OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_asignacion_cambio_insercion ON asignacion_cambio
        FOR INSERT TO cursus_app
        WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran su índice y sus políticas.
    await q.query('DROP TABLE asignacion_cambio')
  }
}
