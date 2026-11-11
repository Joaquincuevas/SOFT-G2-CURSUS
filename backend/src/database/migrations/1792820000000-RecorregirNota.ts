import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-15: la nota apunta al último evento de recorrección, que conserva el
// valor anterior, el nuevo, el motivo, el profesor y la fecha. El alumno solo
// recibe la marca; no obtiene permisos de lectura sobre la auditoría.
export class RecorregirNota1792820000000 implements MigrationInterface {
  name = 'RecorregirNota1792820000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE nota_cambio
      ADD CONSTRAINT uq_nota_cambio_id_universidad UNIQUE (id, universidad_id)`)
    await q.query(`ALTER TABLE nota ADD COLUMN recorreccion_id uuid,
      ADD CONSTRAINT fk_nota_recorreccion FOREIGN KEY (recorreccion_id, universidad_id)
        REFERENCES nota_cambio (id, universidad_id) ON DELETE RESTRICT`)
    await q.query(`
      CREATE POLICY pol_nota_recorreccion ON nota FOR UPDATE TO cursus_app
      USING (universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'
        AND estado = 'PUBLICADA' AND archived_at IS NULL
        AND EXISTS (SELECT 1 FROM evaluacion e JOIN seccion s
          ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
          JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE e.id = nota.evaluacion_id AND e.universidad_id = nota.universidad_id
            AND es_profesor_de_seccion(s.id, usuario_actual()) AND e.archived_at IS NULL
            AND s.archived_at IS NULL AND c.archived_at IS NULL))
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'
        AND estado = 'PUBLICADA' AND archived_at IS NULL AND recorreccion_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM evaluacion e JOIN seccion s
          ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
          WHERE e.id = nota.evaluacion_id AND e.universidad_id = nota.universidad_id
            AND es_profesor_de_seccion(s.id, usuario_actual())))`)
    await q.query(`
      CREATE FUNCTION validar_recorreccion_nota() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.recorreccion_id IS NOT NULL THEN
            RAISE EXCEPTION 'Una nota debe publicarse antes de recorregirse'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        END IF;
        IF OLD.estado = 'PUBLICADA' AND (
          NEW.id IS DISTINCT FROM OLD.id
          OR NEW.universidad_id IS DISTINCT FROM OLD.universidad_id
          OR NEW.evaluacion_id IS DISTINCT FROM OLD.evaluacion_id
          OR NEW.alumno_id IS DISTINCT FROM OLD.alumno_id
          OR NEW.propuesta_por IS DISTINCT FROM OLD.propuesta_por
          OR NEW.estado IS DISTINCT FROM OLD.estado) THEN
          RAISE EXCEPTION 'Recorregir conserva la identidad y el estado de la nota'
            USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.recorreccion_id IS DISTINCT FROM OLD.recorreccion_id
           OR (OLD.estado = 'PUBLICADA' AND NEW.valor IS DISTINCT FROM OLD.valor) THEN
          IF OLD.estado <> 'PUBLICADA' OR NEW.estado <> 'PUBLICADA'
             OR NEW.valor IS NOT DISTINCT FROM OLD.valor
             OR NEW.recorreccion_id IS NULL
             OR NEW.recorreccion_id IS NOT DISTINCT FROM OLD.recorreccion_id
             OR NOT EXISTS (SELECT 1 FROM nota_cambio nc
               WHERE nc.id = NEW.recorreccion_id AND nc.tipo = 'RECORRECCION'
                 AND nc.universidad_id = OLD.universidad_id
                 AND nc.evaluacion_id = OLD.evaluacion_id AND nc.alumno_id = OLD.alumno_id
                 AND nc.nota_anterior = OLD.valor AND nc.nota_nueva = NEW.valor
                 AND nc.responsable_id = usuario_actual()) THEN
            RAISE EXCEPTION 'La recorrección requiere su evento de auditoría'
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        RETURN NEW;
      END
      $$`)
    await q.query(`CREATE TRIGGER tg_validar_recorreccion_nota
      BEFORE INSERT OR UPDATE ON nota FOR EACH ROW
      EXECUTE FUNCTION validar_recorreccion_nota()`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP POLICY pol_nota_recorreccion ON nota')
    await q.query('DROP TRIGGER tg_validar_recorreccion_nota ON nota')
    await q.query('DROP FUNCTION validar_recorreccion_nota()')
    await q.query('ALTER TABLE nota DROP COLUMN recorreccion_id')
    await q.query(
      'ALTER TABLE nota_cambio DROP CONSTRAINT uq_nota_cambio_id_universidad',
    )
  }
}
