import type { MigrationInterface, QueryRunner } from 'typeorm'

// El profesor a cargo de la sección de la evaluación es quien escribe, como
// en AprobarNotas (NOT-11).
const ES_PROFESOR_DE_LA_EVALUACION = `
  EXISTS (SELECT 1 FROM evaluacion e
            JOIN seccion s ON s.id = e.seccion_id
                          AND s.universidad_id = e.universidad_id
           WHERE e.id = revision_notas.evaluacion_id
             AND e.universidad_id = revision_notas.universidad_id
             AND s.profesor_id = usuario_actual())`

const PROFESOR = `universidad_id = universidad_actual()
  AND rol_actual() = 'PROFESOR'`

// NOT-12: el profesor de la sección devuelve al ayudante una evaluación en
// revisión, con un comentario obligatorio. revision_notas pasa a DEVUELTA,
// que las políticas de NOT-05, NOT-07 y NOT-08 ya tratan como editable, y el
// evento DEVOLUCION (con el comentario como motivo) queda en nota_cambio. Las
// notas siguen en PROPUESTA.
export class DevolverNotas1792740000000 implements MigrationInterface {
  name = 'DevolverNotas1792740000000'

  async up(q: QueryRunner): Promise<void> {
    // El último comentario de devolución, para mostrarlo al ayudante (NOT-09).
    // El historial completo es el de nota_cambio. Mismo largo que el motivo
    // de NOT-04.
    await q.query(`
      ALTER TABLE revision_notas
        ADD COLUMN comentario_devolucion text,
        ADD CONSTRAINT ck_revision_notas_comentario CHECK (
          comentario_devolucion IS NULL
          OR length(btrim(comentario_devolucion)) BETWEEN 1 AND 500
        )
    `)
    // Sin DELETE, como el resto de revision_notas.
    await q.query(
      `GRANT UPDATE (comentario_devolucion) ON revision_notas TO cursus_app`,
    )
    // El GRANT es por columna, no por política: el envío y la aprobación
    // podrían cambiar el comentario. Solo se escribe al devolver, también
    // para el dueño de la tabla. Al reenviar se borra: así una nueva
    // devolución exige un comentario nuevo (la política pide uno) y solo una
    // evaluación DEVUELTA lo tiene. El historial queda en nota_cambio.
    await q.query(`
      CREATE FUNCTION revision_notas_comentario_al_devolver() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.comentario_devolucion IS DISTINCT FROM OLD.comentario_devolucion
           AND NOT (OLD.estado = 'EN_REVISION' AND NEW.estado = 'DEVUELTA') THEN
          RAISE EXCEPTION 'El comentario solo se escribe al devolver las notas'
            USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.estado = 'DEVUELTA' AND NEW.estado = 'EN_REVISION' THEN
          NEW.comentario_devolucion := NULL;
        END IF;
        RETURN NEW;
      END
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_revision_notas_comentario_al_devolver
        BEFORE UPDATE ON revision_notas
        FOR EACH ROW EXECUTE FUNCTION revision_notas_comentario_al_devolver()
    `)
    await q.query(`
      CREATE POLICY pol_revision_notas_devolucion ON revision_notas
        FOR UPDATE TO cursus_app
        USING (${PROFESOR} AND estado = 'EN_REVISION'
               AND ${ES_PROFESOR_DE_LA_EVALUACION})
        WITH CHECK (${PROFESOR} AND estado = 'DEVUELTA'
                    AND actualizado_por = usuario_actual()
                    AND comentario_devolucion IS NOT NULL
                    AND ${ES_PROFESOR_DE_LA_EVALUACION})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP POLICY pol_revision_notas_devolucion ON revision_notas')
    await q.query(
      'DROP TRIGGER tg_revision_notas_comentario_al_devolver ON revision_notas',
    )
    await q.query('DROP FUNCTION revision_notas_comentario_al_devolver()')
    await q.query(
      `REVOKE UPDATE (comentario_devolucion) ON revision_notas FROM cursus_app`,
    )
    // El comentario se pierde de revision_notas, pero sigue en el evento
    // DEVOLUCION de nota_cambio. Las evaluaciones DEVUELTA siguen así.
    await q.query(`
      ALTER TABLE revision_notas
        DROP CONSTRAINT ck_revision_notas_comentario,
        DROP COLUMN comentario_devolucion
    `)
  }
}
