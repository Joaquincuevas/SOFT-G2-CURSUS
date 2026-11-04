import type { MigrationInterface, QueryRunner } from 'typeorm'

// Escritura del ayudante en nota, como la dejó CrearNota (NOT-05).
const ESCRIBE_AYUDANTE = `universidad_id = universidad_actual()
  AND rol_actual() = 'AYUDANTE' AND estado = 'PROPUESTA'`

// NOT-08: además, solo mientras la evaluación sea editable. Sin fila en
// revision_notas es un borrador (NOT-07). La subconsulta corre con la RLS de
// quien escribe, que lee revision_notas de su universidad.
const ESCRIBE_AYUDANTE_EDITABLE = `${ESCRIBE_AYUDANTE}
  AND COALESCE((SELECT r.estado FROM revision_notas r
                 WHERE r.evaluacion_id = nota.evaluacion_id
                   AND r.universidad_id = nota.universidad_id), 'BORRADOR')
      IN ('BORRADOR', 'DEVUELTA')`

async function politicasNotaAyudante(q: QueryRunner, condicion: string) {
  await q.query('DROP POLICY pol_nota_insercion ON nota')
  await q.query('DROP POLICY pol_nota_modificacion ON nota')
  await q.query(`
    CREATE POLICY pol_nota_insercion ON nota
      FOR INSERT TO cursus_app
      WITH CHECK (${condicion})
  `)
  await q.query(`
    CREATE POLICY pol_nota_modificacion ON nota
      FOR UPDATE TO cursus_app
      USING (${condicion})
      WITH CHECK (${condicion})
  `)
}

// NOT-08: el ayudante envía las notas de una evaluación a revisión. Pasa
// revision_notas de BORRADOR o DEVUELTA a EN_REVISION (el evento ENVIO queda
// en nota_cambio) y, desde ahí, no escribe más notas de esa evaluación hasta
// que el profesor responda (NOT-09 y NOT-12). El bloqueo va solo en las
// políticas del ayudante: publicar (NOT-11) agregará la suya, del profesor.
export class EnviarNotasRevision1792710000000 implements MigrationInterface {
  name = 'EnviarNotasRevision1792710000000'

  async up(q: QueryRunner): Promise<void> {
    // Solo estas columnas: un UPDATE no mueve la fila a otra evaluación ni
    // universidad (updated_at lo pone el trigger).
    await q.query(
      `GRANT UPDATE (estado, actualizado_por) ON revision_notas TO cursus_app`,
    )
    await q.query(`
      CREATE POLICY pol_revision_notas_envio ON revision_notas
        FOR UPDATE TO cursus_app
        USING (universidad_id = universidad_actual()
               AND rol_actual() = 'AYUDANTE'
               AND estado IN ('BORRADOR', 'DEVUELTA'))
        WITH CHECK (universidad_id = universidad_actual()
                    AND rol_actual() = 'AYUDANTE' AND estado = 'EN_REVISION')
    `)
    await politicasNotaAyudante(q, ESCRIBE_AYUDANTE_EDITABLE)
  }

  async down(q: QueryRunner): Promise<void> {
    await politicasNotaAyudante(q, ESCRIBE_AYUDANTE)
    await q.query('DROP POLICY pol_revision_notas_envio ON revision_notas')
    await q.query(
      `REVOKE UPDATE (estado, actualizado_por) ON revision_notas FROM cursus_app`,
    )
  }
}
