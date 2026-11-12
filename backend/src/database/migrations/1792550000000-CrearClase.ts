import type { MigrationInterface, QueryRunner } from 'typeorm'

// ASI-01 (RN-13): clases de una sección, sobre las que se toma asistencia
// (ASI-02). Cada clase copia el bloque del horario (inicio, término y sala):
// GES-10 archiva y recrea los bloques al guardar el horario, así que no se
// referencia su id. Nada se elimina: una clase se archiva con archived_at.
export class CrearClase1792550000000 implements MigrationInterface {
  name = 'CrearClase1792550000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas (con las claves de CrearInscripcion) aseguran que la
    // sección y el profesor que la registró sean de la misma universidad.
    await q.query(`
      CREATE TABLE clase (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        fecha date NOT NULL,
        inicio time NOT NULL,
        termino time NOT NULL,
        sala varchar(100) NOT NULL,
        creada_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_clase PRIMARY KEY (id),
        CONSTRAINT fk_clase_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_clase_creada_por FOREIGN KEY (creada_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_clase_horas CHECK (inicio < termino),
        CONSTRAINT ck_clase_sala CHECK (sala = btrim(sala) AND length(sala) > 0)
      )
    `)
    // Una sola clase activa por sección, fecha y bloque. Cubre además la FK
    // y la lista de una sección por fecha.
    await q.query(`
      CREATE UNIQUE INDEX ux_clase_seccion_fecha_inicio_activa
        ON clase (seccion_id, fecha, inicio) WHERE archived_at IS NULL
    `)
    await q.query(`
      CREATE INDEX ix_clase_seccion ON clase (seccion_id, universidad_id)
    `)
    await q.query(`
      CREATE INDEX ix_clase_creada_por ON clase (creada_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_clase_updated_at
        BEFORE UPDATE ON clase
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearHorarioSeccion: ENABLE y no FORCE. Cada
    // universidad lee las suyas y el Director todas, en solo lectura (ADR
    // 0001). Solo el profesor escribe; que la sección sea suya lo exige el
    // controlador (no hay función de contexto para el usuario de la sesión).
    // Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`GRANT SELECT, INSERT, UPDATE ON clase TO cursus_app`)
    await q.query(`ALTER TABLE clase ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_clase_lectura ON clase
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_clase_insercion ON clase
        FOR INSERT TO cursus_app
        WITH CHECK (${puedeEscribir})
    `)
    await q.query(`
      CREATE POLICY pol_clase_modificacion ON clase
        FOR UPDATE TO cursus_app
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE clase')
  }
}
