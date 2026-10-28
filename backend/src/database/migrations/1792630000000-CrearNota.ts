import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-05 (RN-10): nota de un alumno en una evaluación. El ayudante la ingresa
// como propuesta; publicarla (NOT-11) la deja en PUBLICADA. Cada cambio queda
// en nota_cambio (NOT-04), así que modificar una propuesta es un UPDATE del
// valor sin perder historia. Nada se elimina: se archiva con archived_at.
export class CrearNota1792630000000 implements MigrationInterface {
  name = 'CrearNota1792630000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas (con uq_evaluacion_id_universidad de CrearNotaCambio)
    // aseguran que la evaluación, el alumno y el ayudante sean de la misma
    // universidad que la nota.
    await q.query(`
      CREATE TABLE nota (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        evaluacion_id uuid NOT NULL,
        alumno_id uuid NOT NULL,
        valor numeric(2,1) NOT NULL,
        estado text NOT NULL DEFAULT 'PROPUESTA',
        propuesta_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_nota PRIMARY KEY (id),
        CONSTRAINT fk_nota_evaluacion FOREIGN KEY (evaluacion_id, universidad_id)
          REFERENCES evaluacion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_nota_alumno FOREIGN KEY (alumno_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_nota_propuesta_por FOREIGN KEY (propuesta_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        -- Escala chilena, igual que nota_cambio. Los mensajes por campo son
        -- NOT-06.
        CONSTRAINT ck_nota_valor CHECK (valor BETWEEN 1.0 AND 7.0),
        CONSTRAINT ck_nota_estado CHECK (estado IN ('PROPUESTA', 'PUBLICADA'))
      )
    `)
    // Una sola nota activa por alumno en cada evaluación. Empieza por
    // evaluacion_id y cubre la FK y la lista de una evaluación.
    await q.query(`
      CREATE UNIQUE INDEX ux_nota_evaluacion_alumno_activa
        ON nota (evaluacion_id, alumno_id) WHERE archived_at IS NULL
    `)
    await q.query(`
      CREATE INDEX ix_nota_evaluacion ON nota (evaluacion_id, universidad_id)
    `)
    // Para las notas de un alumno (NOT-13).
    await q.query(`
      CREATE INDEX ix_nota_alumno ON nota (alumno_id, universidad_id)
    `)
    await q.query(`
      CREATE INDEX ix_nota_propuesta_por ON nota (propuesta_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_nota_updated_at
        BEFORE UPDATE ON nota
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearEvaluacion: ENABLE y no FORCE. La lectura es
    // la de nota_cambio: leen el profesor y el ayudante de la universidad, y
    // el Director todas en solo lectura (ADR 0001). El alumno y el
    // Administrativo no ven ninguna fila, ni siquiera publicada: cómo lee el
    // alumno las suyas lo decide NOT-13 (no hay función de contexto para el
    // usuario de la sesión). Escribe solo el ayudante, y solo propuestas: no
    // puede crear una nota publicada, publicar una propuesta ni tocar una
    // publicada (publicar es NOT-11 y recorregir NOT-15, del profesor). Que
    // sea ayudante de esa sección lo exige el servicio. UPDATE es para cambiar
    // una propuesta; sin DELETE.
    const puedeEscribir = `universidad_id = universidad_actual()
      AND rol_actual() = 'AYUDANTE' AND estado = 'PROPUESTA'`
    await q.query(`GRANT SELECT, INSERT, UPDATE ON nota TO cursus_app`)
    await q.query(`ALTER TABLE nota ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_nota_lectura ON nota
        FOR SELECT TO cursus_app
        USING ((universidad_id = universidad_actual()
                AND rol_actual() IN ('PROFESOR', 'AYUDANTE'))
               OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_nota_insercion ON nota
        FOR INSERT TO cursus_app
        WITH CHECK (${puedeEscribir})
    `)
    await q.query(`
      CREATE POLICY pol_nota_modificacion ON nota
        FOR UPDATE TO cursus_app
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE nota')
  }
}
