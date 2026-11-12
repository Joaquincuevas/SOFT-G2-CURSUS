import type { MigrationInterface, QueryRunner } from 'typeorm'

// MAT-02: historial de solo adición. Cada publicación fija la versión de S3.
export class CrearSilabo1792870000000 implements MigrationInterface {
  name = 'CrearSilabo1792870000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE silabo (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        curso_id uuid NOT NULL,
        archivo_id uuid NOT NULL UNIQUE,
        version integer NOT NULL CHECK (version > 0),
        version_objeto text NOT NULL CHECK (btrim(version_objeto) NOT IN ('', 'null')),
        subido_por uuid NOT NULL,
        subido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (curso_id, version),
        FOREIGN KEY (curso_id, universidad_id) REFERENCES curso (id, universidad_id),
        FOREIGN KEY (archivo_id, universidad_id) REFERENCES archivo (id, universidad_id),
        FOREIGN KEY (subido_por, universidad_id) REFERENCES usuario (id, universidad_id)
      )
    `)
    const profesor = 'es_profesor_de_seccion(s.id, usuario_actual())'
    await q.query(`
      ALTER TABLE silabo ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT ON silabo TO cursus_app;
      CREATE POLICY pol_silabo_lectura ON silabo FOR SELECT TO cursus_app
      USING (universidad_id = universidad_actual()
        AND EXISTS (
          SELECT 1 FROM seccion s JOIN curso c
            ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE s.curso_id = silabo.curso_id AND s.universidad_id = silabo.universidad_id
            AND s.archived_at IS NULL AND c.archived_at IS NULL
            AND CASE rol_actual()::text
              WHEN 'PROFESOR' THEN ${profesor}
              WHEN 'AYUDANTE' THEN EXISTS (
                SELECT 1 FROM ayudante_seccion a WHERE a.seccion_id = s.id
                  AND a.usuario_id = usuario_actual() AND a.archived_at IS NULL)
              WHEN 'ALUMNO' THEN EXISTS (
                SELECT 1 FROM inscripcion i WHERE i.seccion_id = s.id
                  AND i.usuario_id = usuario_actual() AND i.archived_at IS NULL)
              ELSE false
            END
        ));
      CREATE POLICY pol_silabo_insercion ON silabo FOR INSERT TO cursus_app
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'
        AND subido_por = usuario_actual() AND EXISTS (
          SELECT 1 FROM archivo a JOIN seccion s
            ON s.id = a.seccion_id AND s.universidad_id = a.universidad_id
          JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE a.id = silabo.archivo_id AND a.universidad_id = silabo.universidad_id
            AND a.subido_por = silabo.subido_por AND a.subido_como = 'PROFESOR'
            AND a.subido_at IS NOT NULL AND a.archived_at IS NULL
            AND a.tipo = 'application/pdf' AND a.tamano BETWEEN 5 AND 10485760
            AND s.curso_id = silabo.curso_id AND s.archived_at IS NULL
            AND c.archived_at IS NULL AND ${profesor}
        ));
      CREATE TRIGGER tg_silabo_auditar_superadmin AFTER INSERT ON silabo
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin();
    `)
    // La descarga genérica de MAT-01 debe delegar los sílabos a sus rutas
    // específicas, incluso si la RLS de silabo oculta el vínculo al lector.
    await q.query(`
      CREATE FUNCTION public.es_archivo_silabo(archivo uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT EXISTS (SELECT 1 FROM public.silabo WHERE archivo_id = archivo)
      $$;
      REVOKE ALL ON FUNCTION public.es_archivo_silabo(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.es_archivo_silabo(uuid) TO cursus_app;
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION public.es_archivo_silabo(uuid)')
    await q.query('DROP TABLE silabo')
  }
}
