import type { MigrationInterface, QueryRunner } from 'typeorm'

// Escritura de material (CrearMaterial, MAT-04), sin cambios en el WITH CHECK.
const ESCRIBE_MATERIAL = `universidad_id = universidad_actual()
      AND rol_actual() = 'PROFESOR'
      AND subido_por = usuario_actual()
      AND EXISTS (SELECT 1 FROM seccion s
               WHERE s.curso_id = material.curso_id
                 AND s.universidad_id = material.universidad_id
                 AND s.archived_at IS NULL
                 AND es_profesor_de_seccion(s.id, usuario_actual()))`
const PROFESOR_DEL_MATERIAL = `universidad_id = universidad_actual()
      AND rol_actual() = 'PROFESOR'
      AND EXISTS (SELECT 1 FROM seccion s
               WHERE s.curso_id = material.curso_id
                 AND s.universidad_id = material.universidad_id
                 AND s.archived_at IS NULL
                 AND es_profesor_de_seccion(s.id, usuario_actual()))`

// MAT-07: historial de versiones de un material, de solo adición, con el
// patrón de silabo (MAT-02). Cada versión fija la versión del objeto en S3.
// material.archivo_id se mantiene como el archivo de la versión 1, así MAT-04
// y MAT-06 no cambian de forma; la vigente es la de mayor número.
export class CrearMaterialVersion1792890000000 implements MigrationInterface {
  name = 'CrearMaterialVersion1792890000000'

  async up(q: QueryRunner): Promise<void> {
    // Para la FK compuesta (material, universidad) de las versiones.
    await q.query(`
      ALTER TABLE material
        ADD CONSTRAINT uq_material_id_universidad UNIQUE (id, universidad_id)
    `)
    // version_objeto solo puede faltar en la versión 1: es la de los
    // materiales anteriores a MAT-07, cuya versión de S3 una migración no
    // puede leer. Se descargan sin VersionId, es decir, la última del objeto:
    // la clave de un archivo es única y la aplicación nunca la sobrescribe,
    // así que es la misma que se confirmó. Las versiones nuevas exigen la
    // versión de S3 (pol_material_version_insercion).
    await q.query(`
      CREATE TABLE material_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        material_id uuid NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        archivo_id uuid NOT NULL UNIQUE,
        version_objeto text CHECK (
          (version_objeto IS NULL AND version = 1)
          OR btrim(version_objeto) NOT IN ('', 'null')
        ),
        subido_por uuid NOT NULL,
        subido_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (material_id, version),
        FOREIGN KEY (material_id, universidad_id) REFERENCES material (id, universidad_id),
        FOREIGN KEY (archivo_id, universidad_id) REFERENCES archivo (id, universidad_id),
        FOREIGN KEY (subido_por, universidad_id) REFERENCES usuario (id, universidad_id)
      )
    `)
    // Backfill: como dueño de la tabla, sin RLS.
    await q.query(`
      INSERT INTO material_version
        (universidad_id, material_id, version, archivo_id, subido_por, subido_en)
      SELECT universidad_id, id, 1, archivo_id, subido_por, created_at FROM material
    `)

    // La vigente, para la RLS: una política no puede consultar su propia
    // tabla sin recursión. Solo revela el número de la última versión.
    await q.query(`
      CREATE FUNCTION public.material_version_vigente(material uuid) RETURNS integer
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT max(version) FROM public.material_version WHERE material_id = material
      $$;
      REVOKE ALL ON FUNCTION public.material_version_vigente(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.material_version_vigente(uuid) TO cursus_app;
    `)

    // La descarga genérica de MAT-01 aplica la misma regla que las rutas de
    // materiales: el archivo de una versión anterior solo lo descarga el
    // profesor. Como es_archivo_silabo, ve la tabla aunque la RLS se la oculte
    // al lector.
    await q.query(`
      CREATE FUNCTION public.es_version_anterior_material(archivo uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.material_version mv
           WHERE mv.archivo_id = archivo
             AND mv.version < (SELECT max(version) FROM public.material_version
                                WHERE material_id = mv.material_id))
      $$;
      REVOKE ALL ON FUNCTION public.es_version_anterior_material(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.es_version_anterior_material(uuid) TO cursus_app;
    `)

    // Despliegue: la migración corre antes de que ECS cambie de backend, y el
    // anterior registra materiales sin versión. Todo material nuevo recibe aquí
    // su versión 1, como dueño (el backend anterior no fija la versión de S3,
    // que la política de INSERT exige). El backend nuevo pasa el VersionId en
    // app.version_objeto, local a su transacción; sin él queda NULL, como en
    // el backfill, y se descarga sin VersionId. Va en la misma transacción que
    // el backfill: ningún material queda entre ambos.
    await q.query(`
      CREATE FUNCTION public.crear_version_inicial_material() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      BEGIN
        INSERT INTO public.material_version
          (universidad_id, material_id, version, archivo_id, subido_por, version_objeto, subido_en)
        VALUES (NEW.universidad_id, NEW.id, 1, NEW.archivo_id, NEW.subido_por,
                NULLIF(current_setting('app.version_objeto', true), ''), NEW.created_at);
        RETURN NULL;
      END
      $$;
      REVOKE ALL ON FUNCTION public.crear_version_inicial_material() FROM PUBLIC;
      CREATE TRIGGER tg_material_version_inicial
        AFTER INSERT ON material
        FOR EACH ROW EXECUTE FUNCTION public.crear_version_inicial_material();
    `)

    // Lee quien ve el material (su RLS: integrantes del curso y Director),
    // pero solo el profesor del curso ve las versiones anteriores.
    const profesorDelCurso = `EXISTS (
      SELECT 1 FROM material m JOIN seccion s
        ON s.curso_id = m.curso_id AND s.universidad_id = m.universidad_id
       WHERE m.id = material_version.material_id
         AND m.universidad_id = material_version.universidad_id
         AND s.archived_at IS NULL
         AND es_profesor_de_seccion(s.id, usuario_actual()))`
    await q.query(`
      ALTER TABLE material_version ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT ON material_version TO cursus_app;
      CREATE POLICY pol_material_version_lectura ON material_version
        FOR SELECT TO cursus_app
        USING (
          EXISTS (SELECT 1 FROM material m
                   WHERE m.id = material_version.material_id
                     AND m.universidad_id = material_version.universidad_id)
          AND (version = material_version_vigente(material_id)
               OR (universidad_id = universidad_actual()
                   AND rol_actual() = 'PROFESOR' AND ${profesorDelCurso})));
      CREATE POLICY pol_material_version_insercion ON material_version
        FOR INSERT TO cursus_app
        WITH CHECK (universidad_id = universidad_actual()
          AND rol_actual() = 'PROFESOR'
          AND subido_por = usuario_actual()
          AND version_objeto IS NOT NULL
          AND version = COALESCE(material_version_vigente(material_id), 0) + 1
          AND ${profesorDelCurso}
          AND EXISTS (
            SELECT 1 FROM material m
              JOIN archivo a ON a.universidad_id = m.universidad_id
              JOIN seccion s ON s.id = a.seccion_id AND s.universidad_id = a.universidad_id
             WHERE m.id = material_version.material_id
               AND m.universidad_id = material_version.universidad_id
               AND a.id = material_version.archivo_id
               AND a.subido_por = material_version.subido_por
               AND a.subido_at IS NOT NULL AND a.archived_at IS NULL
               AND s.curso_id = m.curso_id
               AND NOT es_archivo_silabo(a.id)));
      CREATE TRIGGER tg_material_version_auditar_superadmin AFTER INSERT ON material_version
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin();
    `)

    // Para numerar, la API bloquea el material con FOR UPDATE, que pasa por
    // el USING de la política de UPDATE: cualquier profesor del curso lo
    // bloquea. El WITH CHECK sigue igual, así que solo quien lo subió lo
    // modifica (tg_material_validar no deja cambiar subido_por).
    await q.query(`
      DROP POLICY pol_material_modificacion ON material;
      CREATE POLICY pol_material_modificacion ON material
        FOR UPDATE TO cursus_app
        USING (${PROFESOR_DEL_MATERIAL})
        WITH CHECK (${ESCRIBE_MATERIAL});
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP POLICY pol_material_modificacion ON material;
      CREATE POLICY pol_material_modificacion ON material
        FOR UPDATE TO cursus_app
        USING (${ESCRIBE_MATERIAL})
        WITH CHECK (${ESCRIBE_MATERIAL});
    `)
    // Las versiones 2 en adelante se pierden; sus archivos y objetos quedan.
    await q.query('DROP TRIGGER tg_material_version_inicial ON material')
    await q.query('DROP FUNCTION public.crear_version_inicial_material()')
    await q.query('DROP FUNCTION public.es_version_anterior_material(uuid)')
    await q.query('DROP TABLE material_version')
    await q.query('DROP FUNCTION public.material_version_vigente(uuid)')
    await q.query(
      'ALTER TABLE material DROP CONSTRAINT uq_material_id_universidad',
    )
  }
}
