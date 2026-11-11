import type { MigrationInterface, QueryRunner } from 'typeorm'

// MAT-09: cada reemplazo agrega una entrega; las anteriores y sus versiones
// de S3 se conservan. No hay UPDATE ni DELETE para la API.
export class CrearEntrega1792840000000 implements MigrationInterface {
  name = 'CrearEntrega1792840000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE actividad ADD CONSTRAINT uq_actividad_id_universidad UNIQUE (id, universidad_id)`,
    )
    await q.query(
      `ALTER TABLE archivo ADD CONSTRAINT uq_archivo_id_universidad UNIQUE (id, universidad_id)`,
    )
    await q.query(`CREATE TABLE entrega (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      universidad_id uuid NOT NULL,
      actividad_id uuid NOT NULL,
      alumno_id uuid NOT NULL,
      archivo_id uuid NOT NULL,
      version_objeto text NOT NULL,
      entregada_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_entrega PRIMARY KEY (id),
      CONSTRAINT fk_entrega_actividad FOREIGN KEY (actividad_id, universidad_id)
        REFERENCES actividad (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT fk_entrega_alumno FOREIGN KEY (alumno_id, universidad_id)
        REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT fk_entrega_archivo FOREIGN KEY (archivo_id, universidad_id)
        REFERENCES archivo (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT uq_entrega_archivo UNIQUE (actividad_id, alumno_id, archivo_id),
      CONSTRAINT ck_entrega_version CHECK (length(btrim(version_objeto)) > 0 AND version_objeto <> 'null')
    )`)
    await q.query(`CREATE INDEX ix_entrega_alumno_actividad
      ON entrega (actividad_id, alumno_id, entregada_at DESC, id DESC)`)
    await q.query(
      `CREATE INDEX ix_entrega_archivo ON entrega (archivo_id, universidad_id)`,
    )
    await q.query(
      `CREATE INDEX ix_entrega_alumno ON entrega (alumno_id, universidad_id)`,
    )
    await q.query(`GRANT SELECT, INSERT ON entrega TO cursus_app`)
    await q.query(`ALTER TABLE entrega ENABLE ROW LEVEL SECURITY`)
    const propia = `universidad_id = universidad_actual() AND rol_actual() = 'ALUMNO'
      AND alumno_id = usuario_actual()`
    await q.query(
      `CREATE POLICY pol_entrega_lectura ON entrega FOR SELECT TO cursus_app USING (${propia})`,
    )
    await q.query(
      `CREATE POLICY pol_entrega_insercion ON entrega FOR INSERT TO cursus_app WITH CHECK (${propia})`,
    )
    // También con SQL directo: sección vigente, alumno inscrito, archivo
    // propio confirmado y plazo abierto. Los locks impiden retirarlos durante
    // la entrega; clock_timestamp() comprueba la hora después de esperar.
    await q.query(`CREATE FUNCTION validar_entrega() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE limite timestamptz;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('entrega:' || NEW.actividad_id || ':' || NEW.alumno_id, 0));
        SELECT a.plazo INTO limite FROM actividad a
          JOIN seccion s ON s.id=a.seccion_id AND s.universidad_id=a.universidad_id
          JOIN curso c ON c.id=s.curso_id AND c.universidad_id=s.universidad_id
          JOIN inscripcion i ON i.seccion_id=s.id AND i.universidad_id=s.universidad_id AND i.usuario_id=NEW.alumno_id
          JOIN usuario u ON u.id=i.usuario_id AND u.universidad_id=i.universidad_id
          JOIN archivo f ON f.id=NEW.archivo_id AND f.universidad_id=a.universidad_id AND f.seccion_id=s.id
         WHERE a.id=NEW.actividad_id AND a.universidad_id=NEW.universidad_id
           AND a.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
           AND i.archived_at IS NULL AND u.archived_at IS NULL AND u.rol='ALUMNO'
           AND f.archived_at IS NULL AND f.subido_at IS NOT NULL
           AND f.subido_por=NEW.alumno_id AND f.subido_como='ALUMNO'
         FOR SHARE OF s,c,i,u,f;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'La entrega requiere una actividad vigente y un archivo propio confirmado'
            USING ERRCODE='check_violation', CONSTRAINT='ck_entrega_archivo';
        END IF;
        NEW.entregada_at := clock_timestamp();
        IF limite <= NEW.entregada_at THEN
          RAISE EXCEPTION 'La actividad está cerrada. No se aceptan nuevas entregas ni reemplazos.'
            USING ERRCODE='check_violation', CONSTRAINT='ck_entrega_plazo';
        END IF;
        RETURN NEW;
      END $$`)
    await q.query(`CREATE TRIGGER tg_validar_entrega BEFORE INSERT ON entrega
      FOR EACH ROW EXECUTE FUNCTION validar_entrega()`)
    await q.query(`CREATE TRIGGER tg_entrega_auditar_superadmin AFTER INSERT ON entrega
      FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL) EXECUTE FUNCTION auditar_superadmin()`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE entrega')
    await q.query('DROP FUNCTION validar_entrega()')
    await q.query(
      'ALTER TABLE archivo DROP CONSTRAINT uq_archivo_id_universidad',
    )
    await q.query(
      'ALTER TABLE actividad DROP CONSTRAINT uq_actividad_id_universidad',
    )
  }
}
