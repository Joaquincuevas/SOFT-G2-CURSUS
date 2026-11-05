import type { MigrationInterface, QueryRunner } from 'typeorm'

// El profesor a cargo de la sección de la evaluación es quien escribe
// (usuario_actual(), que la API fija solo en la transacción de la
// aprobación). Corre con la RLS de quien escribe, que lee la evaluación y la
// sección de su universidad.
const ES_PROFESOR_DE_LA_EVALUACION = (tabla: string) => `
  EXISTS (SELECT 1 FROM evaluacion e
            JOIN seccion s ON s.id = e.seccion_id
                          AND s.universidad_id = e.universidad_id
           WHERE e.id = ${tabla}.evaluacion_id
             AND e.universidad_id = ${tabla}.universidad_id
             AND s.profesor_id = usuario_actual())`

const PROFESOR = `universidad_id = universidad_actual()
  AND rol_actual() = 'PROFESOR'`

// Tipos y alcance de nota_cambio como los dejó CrearNotaCambio (NOT-04).
const TIPOS = `'PROPUESTA', 'ENVIO', 'APROBACION', 'DEVOLUCION', 'RECORRECCION'`
const ALCANCE = (publicacion: string) => `
  CASE tipo
    WHEN 'PROPUESTA' THEN alumno_id IS NOT NULL AND nota_nueva IS NOT NULL
      AND nota_anterior IS DISTINCT FROM nota_nueva
    WHEN 'RECORRECCION' THEN alumno_id IS NOT NULL
      AND nota_anterior IS NOT NULL AND nota_nueva IS NOT NULL
    ${publicacion}
    ELSE alumno_id IS NULL AND nota_anterior IS NULL AND nota_nueva IS NULL
  END`

// NOT-11: el profesor de la sección aprueba las notas de una evaluación en
// revisión y las publica. En una transacción con el lock de la evaluación,
// cada nota PROPUESTA pasa a PUBLICADA con un evento PUBLICACION (la nota
// publicada de ese alumno) y la revisión pasa a APROBADA con un evento
// APROBACION. La RLS lo exige también sin pasar por el servicio.
export class AprobarNotas1792730000000 implements MigrationInterface {
  name = 'AprobarNotas1792730000000'

  async up(q: QueryRunner): Promise<void> {
    // Quien hace la acción, como universidad_actual() y rol_actual(). Nulo si
    // la transacción no lo fija: entonces ninguna política del profesor
    // alcanza filas.
    await q.query(`
      CREATE FUNCTION usuario_actual() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid
      $$
    `)

    // PUBLICACION: un evento por nota, con el alumno y la nota publicada.
    await q.query(`
      ALTER TABLE nota_cambio
        DROP CONSTRAINT ck_nota_cambio_tipo,
        DROP CONSTRAINT ck_nota_cambio_alcance,
        ADD CONSTRAINT ck_nota_cambio_tipo CHECK (tipo IN (${TIPOS}, 'PUBLICACION')),
        ADD CONSTRAINT ck_nota_cambio_alcance CHECK (${ALCANCE(`
    WHEN 'PUBLICACION' THEN alumno_id IS NOT NULL
      AND nota_anterior IS NULL AND nota_nueva IS NOT NULL`)})
    `)

    // nota ya tiene GRANT UPDATE (NOT-05). El profesor solo alcanza las
    // propuestas activas de una evaluación en revisión de su sección, y solo
    // las deja publicadas y en la escala. Las políticas del ayudante exigen
    // PROPUESTA, así que una publicada no la toca nadie (NOT-15 agregará la
    // recorrección).
    await q.query(`
      CREATE POLICY pol_nota_publicacion ON nota
        FOR UPDATE TO cursus_app
        USING (${PROFESOR} AND estado = 'PROPUESTA' AND archived_at IS NULL
               AND ${ES_PROFESOR_DE_LA_EVALUACION('nota')}
               AND (SELECT r.estado FROM revision_notas r
                     WHERE r.evaluacion_id = nota.evaluacion_id
                       AND r.universidad_id = nota.universidad_id) = 'EN_REVISION')
        WITH CHECK (${PROFESOR} AND estado = 'PUBLICADA' AND archived_at IS NULL
                    AND valor BETWEEN 1.0 AND 7.0
                    AND ${ES_PROFESOR_DE_LA_EVALUACION('nota')})
    `)
    // La política no ve la fila anterior: publicar solo cambia el estado (ni
    // el valor, ni el alumno, ni quién la propuso). Lo exige un trigger,
    // también para el dueño.
    await q.query(`
      CREATE FUNCTION nota_publicar_sin_cambios() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.valor IS DISTINCT FROM OLD.valor
           OR NEW.alumno_id IS DISTINCT FROM OLD.alumno_id
           OR NEW.evaluacion_id IS DISTINCT FROM OLD.evaluacion_id
           OR NEW.universidad_id IS DISTINCT FROM OLD.universidad_id
           OR NEW.propuesta_por IS DISTINCT FROM OLD.propuesta_por
           OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
          RAISE EXCEPTION 'Publicar una nota solo cambia su estado'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_nota_publicar_sin_cambios
        BEFORE UPDATE ON nota
        FOR EACH ROW
        WHEN (OLD.estado = 'PROPUESTA' AND NEW.estado = 'PUBLICADA')
        EXECUTE FUNCTION nota_publicar_sin_cambios()
    `)

    // revision_notas ya tiene UPDATE (estado, actualizado_por) (NOT-08).
    await q.query(`
      CREATE POLICY pol_revision_notas_aprobacion ON revision_notas
        FOR UPDATE TO cursus_app
        USING (${PROFESOR} AND estado = 'EN_REVISION'
               AND ${ES_PROFESOR_DE_LA_EVALUACION('revision_notas')})
        WITH CHECK (${PROFESOR} AND estado = 'APROBADA'
                    AND actualizado_por = usuario_actual()
                    AND ${ES_PROFESOR_DE_LA_EVALUACION('revision_notas')})
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP POLICY pol_revision_notas_aprobacion ON revision_notas')
    await q.query('DROP TRIGGER tg_nota_publicar_sin_cambios ON nota')
    await q.query('DROP FUNCTION nota_publicar_sin_cambios()')
    await q.query('DROP POLICY pol_nota_publicacion ON nota')
    // nota_cambio no se borra: con eventos PUBLICACION, los CHECK de NOT-04
    // vuelven como NOT VALID para no fallar con ellos, y rigen para lo nuevo.
    await q.query(`
      ALTER TABLE nota_cambio
        DROP CONSTRAINT ck_nota_cambio_tipo,
        DROP CONSTRAINT ck_nota_cambio_alcance,
        ADD CONSTRAINT ck_nota_cambio_tipo CHECK (tipo IN (${TIPOS})) NOT VALID,
        ADD CONSTRAINT ck_nota_cambio_alcance CHECK (${ALCANCE('')}) NOT VALID
    `)
    await q.query('DROP FUNCTION usuario_actual()')
  }
}
