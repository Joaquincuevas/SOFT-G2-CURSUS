import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-07: estado de las notas de una evaluación frente al profesor, una fila
// por evaluación. El ayudante la crea en BORRADOR al guardar por primera vez;
// una evaluación sin fila también es un borrador. Los demás estados son de
// NOT-08 (enviar a revisión), NOT-09 (aprobar) y NOT-12 (devolver): cada uno
// agregará la política de UPDATE de su transición y su evento (ENVIO,
// APROBACION, DEVOLUCION) en nota_cambio, que ya guarda el motivo de una
// devolución. Crear el borrador no es una transición: no deja evento.
export class CrearRevisionNotas1792700000000 implements MigrationInterface {
  name = 'CrearRevisionNotas1792700000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE revision_notas (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        evaluacion_id uuid NOT NULL,
        estado text NOT NULL DEFAULT 'BORRADOR',
        -- Quien dejó el estado actual: en BORRADOR, el primer ayudante que
        -- guardó (los guardados siguientes no lo cambian); cada transición
        -- de NOT-08, 09 y 12 lo actualizará.
        actualizado_por uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_revision_notas PRIMARY KEY (id),
        -- Una fila por evaluación; también cubre la FK.
        CONSTRAINT uq_revision_notas_evaluacion UNIQUE (evaluacion_id),
        CONSTRAINT fk_revision_notas_evaluacion FOREIGN KEY (evaluacion_id, universidad_id)
          REFERENCES evaluacion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_revision_notas_actualizado_por FOREIGN KEY (actualizado_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        -- Los estados de NOT-09. Quién escribe cada uno lo decide la RLS.
        CONSTRAINT ck_revision_notas_estado CHECK (
          estado IN ('BORRADOR', 'EN_REVISION', 'APROBADA', 'DEVUELTA')
        )
      )
    `)
    await q.query(`
      CREATE INDEX ix_revision_notas_actualizado_por
        ON revision_notas (actualizado_por, universidad_id)
    `)
    await q.query(`
      CREATE TRIGGER tg_revision_notas_updated_at
        BEFORE UPDATE ON revision_notas
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS como nota: ENABLE y no FORCE, con la misma lectura (profesor y
    // ayudante de la universidad, el Director en todas; el alumno y el
    // Administrativo no ven filas). Solo el ayudante inserta, y solo un
    // borrador. Sin UPDATE ni DELETE: aún no hay transiciones.
    await q.query(`GRANT SELECT, INSERT ON revision_notas TO cursus_app`)
    await q.query(`ALTER TABLE revision_notas ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_revision_notas_lectura ON revision_notas
        FOR SELECT TO cursus_app
        USING ((universidad_id = universidad_actual()
                AND rol_actual() IN ('PROFESOR', 'AYUDANTE'))
               OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_revision_notas_insercion ON revision_notas
        FOR INSERT TO cursus_app
        WITH CHECK (universidad_id = universidad_actual()
                    AND rol_actual() = 'AYUDANTE' AND estado = 'BORRADOR')
    `)

    // MT-04, como en nota.
    await q.query(`
      CREATE TRIGGER tg_revision_notas_auditar_superadmin
        AFTER INSERT OR UPDATE ON revision_notas
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin()
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TRIGGER tg_revision_notas_auditar_superadmin ON revision_notas',
    )
    // Al borrar la tabla se borran sus índices, el otro trigger y las
    // políticas.
    await q.query('DROP TABLE revision_notas')
  }
}
