import type { MigrationInterface, QueryRunner } from 'typeorm'

// ANU-05 (RN-09): cada edición conserva la versión realmente reemplazada,
// con responsable y fecha de reemplazo, de forma atómica e inmutable.
// RLS aísla universidad y rol; el servicio restringe la lectura al autor.
export class CrearHistorialAnuncio1792670000000 implements MigrationInterface {
  name = 'CrearHistorialAnuncio1792670000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE anuncio ADD COLUMN editado_en timestamptz')
    await q.query(`
      CREATE TABLE anuncio_cambio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        anuncio_id uuid NOT NULL,
        responsable_id uuid NOT NULL,
        titulo text NOT NULL,
        cuerpo text NOT NULL,
        fecha timestamptz NOT NULL,
        CONSTRAINT fk_anuncio_cambio_anuncio FOREIGN KEY (anuncio_id, universidad_id)
          REFERENCES anuncio (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_anuncio_cambio_responsable FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      )
    `)
    await q.query(`
      CREATE INDEX ix_anuncio_cambio_fecha ON anuncio_cambio (anuncio_id, fecha, id)
    `)
    await q.query(`
      CREATE INDEX ix_anuncio_cambio_responsable ON anuncio_cambio (responsable_id, universidad_id)
    `)
    await q.query('GRANT SELECT, INSERT ON anuncio_cambio TO cursus_app')
    await q.query('ALTER TABLE anuncio_cambio ENABLE ROW LEVEL SECURITY')
    const permitido = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await q.query(`
      CREATE POLICY pol_anuncio_cambio_lectura ON anuncio_cambio
        FOR SELECT TO cursus_app USING (${permitido})
    `)
    await q.query(`
      CREATE POLICY pol_anuncio_cambio_insercion ON anuncio_cambio
        FOR INSERT TO cursus_app WITH CHECK (${permitido})
    `)
    await q.query(`
      CREATE FUNCTION anuncio_cambio_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'El historial de anuncios es de solo adición'
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_anuncio_cambio_inmutable
        BEFORE UPDATE OR DELETE ON anuncio_cambio
        FOR EACH ROW EXECUTE FUNCTION anuncio_cambio_inmutable()
    `)
    // BEFORE UPDATE recibe la versión realmente reemplazada, incluso si dos
    // pestañas guardan a la vez. Historial, contenido y fecha son atómicos.
    await q.query(`
      CREATE FUNCTION guardar_version_anuncio() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.cuerpo IS DISTINCT FROM OLD.cuerpo THEN
          IF current_user = 'cursus_app' AND OLD.autor_id::text IS DISTINCT FROM
            current_setting('app.anuncio_autor_id', true) THEN
            RAISE EXCEPTION 'Solo el autor puede editar el anuncio'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          NEW.editado_en := clock_timestamp();
          INSERT INTO anuncio_cambio (universidad_id, anuncio_id, responsable_id, titulo, cuerpo, fecha)
          VALUES (OLD.universidad_id, OLD.id, OLD.autor_id, OLD.titulo, OLD.cuerpo, NEW.editado_en);
        ELSE
          NEW.editado_en := OLD.editado_en;
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_anuncio_guardar_version BEFORE UPDATE ON anuncio
        FOR EACH ROW EXECUTE FUNCTION guardar_version_anuncio()
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER tg_anuncio_guardar_version ON anuncio')
    await q.query('DROP FUNCTION guardar_version_anuncio()')
    await q.query('DROP TABLE anuncio_cambio')
    await q.query('DROP FUNCTION anuncio_cambio_inmutable()')
    await q.query('ALTER TABLE anuncio DROP COLUMN editado_en')
  }
}
