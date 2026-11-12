import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

// MAT-04: materiales de un curso (guías, presentaciones, pruebas anteriores y
// código). El material es del curso, no de quien lo subió: lo ve y lo
// gestiona cualquier profesor vigente de cualquier sección del curso en ese
// período (GES-25), así que lo hereda el próximo profesor. Las secciones y los
// cursos son de un solo período, así que la herencia entre períodos no existe
// todavía (docs/mat-04-subir-material.md). El contenido es un archivo de
// MAT-01, ya confirmado en S3: aquí no se guardan bytes.
export class CrearMaterial1792860000000 implements MigrationInterface {
  name = 'CrearMaterial1792860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La FK compuesta (archivo, universidad) usa uq_archivo_id_universidad,
    // que crea CrearEntrega (MAT-09, 1792840000000) y es de esa migración.

    // Nada se elimina: un material se archiva con archived_at. archivo_id es
    // único: un archivo pertenece a un solo material (aunque se archive).
    await queryRunner.query(`
      CREATE TABLE material (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        curso_id uuid NOT NULL,
        archivo_id uuid NOT NULL,
        categoria text NOT NULL,
        titulo text NOT NULL,
        descripcion text,
        subido_por uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_material PRIMARY KEY (id),
        CONSTRAINT uq_material_archivo UNIQUE (archivo_id),
        CONSTRAINT fk_material_curso FOREIGN KEY (curso_id, universidad_id)
          REFERENCES curso (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_material_archivo FOREIGN KEY (archivo_id, universidad_id)
          REFERENCES archivo (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_material_subido_por FOREIGN KEY (subido_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_material_categoria CHECK (
          categoria IN ('GUIA', 'PRESENTACION', 'PRUEBA_ANTERIOR', 'CODIGO')
        ),
        CONSTRAINT ck_material_titulo CHECK (
          titulo = btrim(titulo) AND length(titulo) BETWEEN 1 AND 100
        ),
        CONSTRAINT ck_material_descripcion CHECK (
          descripcion IS NULL
          OR (descripcion = btrim(descripcion) AND length(descripcion) BETWEEN 1 AND 1000)
        )
      )
    `)

    // fk_material_curso y la lista de materiales de un curso (MAT-05).
    await queryRunner.query(`
      CREATE INDEX ix_material_curso ON material (curso_id, universidad_id, created_at DESC, id)
    `)
    // fk_material_subido_por. fk_material_archivo la cubre uq_material_archivo.
    await queryRunner.query(`
      CREATE INDEX ix_material_subido_por ON material (subido_por, universidad_id)
    `)

    await queryRunner.query(`
      CREATE TRIGGER tg_material_updated_at
        BEFORE UPDATE ON material
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // Un CHECK no puede consultar otra tabla, así que el archivo se valida en
    // un trigger: debe estar confirmado en S3 (subido_at), vigente, ser de
    // una sección de este curso y haberlo subido quien registra el material.
    // Corre con la RLS de quien escribe (archivo y seccion se leen por
    // universidad), así que no necesita SECURITY DEFINER. Después de
    // registrado, el curso, el archivo y quien lo subió no cambian.
    await queryRunner.query(`
      CREATE FUNCTION public.validar_material() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND (NEW.universidad_id, NEW.curso_id, NEW.archivo_id, NEW.subido_por)
             IS DISTINCT FROM (OLD.universidad_id, OLD.curso_id, OLD.archivo_id, OLD.subido_por) THEN
          RAISE EXCEPTION 'El curso, el archivo y quien subió el material no se pueden cambiar'
            USING ERRCODE = 'check_violation';
        END IF;
        IF TG_OP = 'INSERT' AND NOT EXISTS (
          SELECT 1 FROM public.archivo a
            JOIN public.seccion s ON s.id = a.seccion_id
                                 AND s.universidad_id = a.universidad_id
           WHERE a.id = NEW.archivo_id AND a.universidad_id = NEW.universidad_id
             AND a.subido_at IS NOT NULL AND a.archived_at IS NULL
             AND a.subido_por = NEW.subido_por
             AND s.curso_id = NEW.curso_id
        ) THEN
          RAISE EXCEPTION 'El archivo debe estar confirmado y ser de una sección del curso'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END
      $$
    `)
    await queryRunner.query(`
      CREATE TRIGGER tg_material_validar
        BEFORE INSERT OR UPDATE ON material
        FOR EACH ROW EXECUTE FUNCTION public.validar_material()
    `)

    // RLS con el patrón de CrearArchivo, sin DELETE. Escribe solo un profesor
    // vigente de alguna sección del curso (GES-25: es_profesor_de_seccion) y
    // a su nombre: subido_por debe ser el usuario que fijó la API
    // (usuario_actual(), ver fijarUsuario), así nadie registra un material a
    // nombre de otro, ni con SQL directo. Lee cualquier integrante de una
    // sección del curso (profesor, ayudante o alumno) y el Director: la
    // privacidad está aquí y no solo en la API. Sin usuario fijado,
    // usuario_actual() es NULL y no se lee nada, salvo el Director.
    const enAlgunaSeccion = (condicion: string) => `
      EXISTS (SELECT 1 FROM seccion s
               WHERE s.curso_id = material.curso_id
                 AND s.universidad_id = material.universidad_id
                 AND s.archived_at IS NULL
                 AND ${condicion})`
    const puedeEscribir = `universidad_id = universidad_actual()
      AND rol_actual() = 'PROFESOR'
      AND subido_por = usuario_actual()
      AND ${enAlgunaSeccion('es_profesor_de_seccion(s.id, usuario_actual())')}`
    const esIntegrante = enAlgunaSeccion(`(
        es_profesor_de_seccion(s.id, usuario_actual())
        OR EXISTS (SELECT 1 FROM ayudante_seccion a
                    WHERE a.seccion_id = s.id AND a.usuario_id = usuario_actual()
                      AND a.archived_at IS NULL)
        OR EXISTS (SELECT 1 FROM inscripcion i
                    WHERE i.seccion_id = s.id AND i.usuario_id = usuario_actual()
                      AND i.archived_at IS NULL))`)
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON material TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE material ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_material_lectura ON material
        FOR SELECT TO ${ROL_APP}
        USING ((universidad_id = universidad_actual() AND ${esIntegrante})
               OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_material_insercion ON material
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_material_modificacion ON material
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)

    // MT-04: las escrituras del superadmin quedan en superadmin_cambio, como
    // en el resto de las tablas con universidad_id (CrearSuperadminCambio).
    await queryRunner.query(`
      CREATE TRIGGER tg_material_auditar_superadmin
        AFTER INSERT OR UPDATE ON material
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin()
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus políticas, índices, triggers y
    // permisos. Los archivos de MAT-01 y los objetos del bucket no se tocan.
    await queryRunner.query(`DROP TABLE material`)
    await queryRunner.query(`DROP FUNCTION public.validar_material()`)
    // uq_archivo_id_universidad queda: es de CrearEntrega (MAT-09).
  }
}
