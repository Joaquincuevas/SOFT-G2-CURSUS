import type { MigrationInterface, QueryRunner } from 'typeorm'

// ASI-02 (RN-13): asistencia de una clase, una fila por alumno con su marca
// de presente o ausente, quién la registró y cuándo. Nada se elimina:
// corregir una marca (ASI-04) archiva la fila con archived_at y deja
// registro del cambio.
export class CrearAsistencia1792580000000 implements MigrationInterface {
  name = 'CrearAsistencia1792580000000'

  async up(q: QueryRunner): Promise<void> {
    // Permite que asistencia referencie (clase, universidad), igual que
    // clase con seccion.
    await q.query(`
      ALTER TABLE clase
        ADD CONSTRAINT uq_clase_id_universidad UNIQUE (id, universidad_id)
    `)
    // Las FKs compuestas aseguran que la clase, el alumno y el profesor que
    // la registró sean de la misma universidad.
    await q.query(`
      CREATE TABLE asistencia (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        clase_id uuid NOT NULL,
        alumno_id uuid NOT NULL,
        presente boolean NOT NULL,
        registrada_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_asistencia PRIMARY KEY (id),
        CONSTRAINT fk_asistencia_clase FOREIGN KEY (clase_id, universidad_id)
          REFERENCES clase (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asistencia_alumno FOREIGN KEY (alumno_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_asistencia_registrada_por FOREIGN KEY (registrada_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      )
    `)
    // Una sola marca activa por alumno en cada clase. Empieza por clase_id y
    // cubre la FK y la lista de una clase.
    await q.query(`
      CREATE UNIQUE INDEX ux_asistencia_clase_alumno_activa
        ON asistencia (clase_id, alumno_id) WHERE archived_at IS NULL
    `)
    await q.query(`
      CREATE INDEX ix_asistencia_clase ON asistencia (clase_id, universidad_id)
    `)
    // Para la asistencia de un alumno (ASI-05 y ASI-06).
    await q.query(`
      CREATE INDEX ix_asistencia_alumno ON asistencia (alumno_id, universidad_id)
    `)
    await q.query(`
      CREATE INDEX ix_asistencia_registrada_por
        ON asistencia (registrada_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_asistencia_updated_at
        BEFORE UPDATE ON asistencia
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearClase: ENABLE y no FORCE. Cada universidad
    // lee la suya y el Director toda, en solo lectura (ADR 0001). Solo el
    // profesor escribe; que la sección sea suya lo exige el servicio (no hay
    // función de contexto para el usuario de la sesión). UPDATE es para
    // archivar al corregir (ASI-04). Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`GRANT SELECT, INSERT, UPDATE ON asistencia TO cursus_app`)
    await q.query(`ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_asistencia_lectura ON asistencia
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_asistencia_insercion ON asistencia
        FOR INSERT TO cursus_app
        WITH CHECK (${puedeEscribir})
    `)
    await q.query(`
      CREATE POLICY pol_asistencia_modificacion ON asistencia
        FOR UPDATE TO cursus_app
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE asistencia')
    await q.query('ALTER TABLE clase DROP CONSTRAINT uq_clase_id_universidad')
  }
}
