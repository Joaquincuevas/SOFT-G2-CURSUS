import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

// 20 MB, como TAMANO_MAXIMO_ARCHIVO de @cursus/shared.
const TAMANO_MAXIMO = 20 * 1024 * 1024

// Archivos de una sección (MAT-01), guardados en el bucket S3 privado. La fila
// se crea al pedir la subida y subido_at se llena al confirmarla, cuando el
// objeto ya está en S3. clave es la llave del objeto
// (universidad/sección/archivo): el nombre original queda solo aquí, para no
// usar texto del usuario en la llave. subido_como es el rol con el que se
// subió, para que un alumno descargue lo del equipo docente pero no las
// entregas de otros alumnos.
export class CrearArchivo1792770000000 implements MigrationInterface {
  name = 'CrearArchivo1792770000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Las FKs compuestas aseguran que la sección y quien sube sean de la
    // misma universidad que el archivo (uq_seccion_id_universidad y
    // uq_usuario_id_universidad de CrearInscripcion). Nada se elimina: un
    // archivo se archiva con archived_at.
    await queryRunner.query(`
      CREATE TABLE archivo (
        id uuid NOT NULL,
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        subido_por uuid NOT NULL,
        subido_como text NOT NULL,
        nombre text NOT NULL,
        tipo text NOT NULL,
        tamano integer NOT NULL,
        clave text NOT NULL,
        subido_at timestamptz,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_archivo PRIMARY KEY (id),
        CONSTRAINT uq_archivo_clave UNIQUE (clave),
        CONSTRAINT fk_archivo_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_archivo_subido_por FOREIGN KEY (subido_por, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_archivo_subido_como CHECK (
          subido_como IN ('PROFESOR', 'AYUDANTE', 'ALUMNO')
        ),
        CONSTRAINT ck_archivo_nombre CHECK (
          nombre = btrim(nombre) AND length(nombre) BETWEEN 1 AND 255
        ),
        CONSTRAINT ck_archivo_tipo CHECK (length(tipo) BETWEEN 1 AND 200),
        CONSTRAINT ck_archivo_tamano CHECK (tamano BETWEEN 1 AND ${TAMANO_MAXIMO}),
        CONSTRAINT ck_archivo_clave CHECK (
          clave = universidad_id || '/' || seccion_id || '/' || id
        )
      )
    `)

    // Cubre fk_archivo_seccion y los listados de una sección de MAT-02 a
    // MAT-10.
    await queryRunner.query(`
      CREATE INDEX ix_archivo_seccion ON archivo (seccion_id, created_at DESC, id)
    `)
    // Para fk_archivo_subido_por.
    await queryRunner.query(`
      CREATE INDEX ix_archivo_subido_por ON archivo (subido_por, universidad_id)
    `)

    await queryRunner.query(`
      CREATE TRIGGER tg_archivo_updated_at
        BEFORE UPDATE ON archivo
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearAnuncio: cada universidad lee sus archivos y
    // el Director los de todas (ADR 0001); solo el profesor, el ayudante y el
    // alumno suben o confirman, en su universidad. Que sea integrante de la
    // sección lo verifica ArchivosService. Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual()
      AND rol_actual() IN ('PROFESOR', 'AYUDANTE', 'ALUMNO')`
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON archivo TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE archivo ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_archivo_lectura ON archivo
        FOR SELECT TO ${ROL_APP}
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_archivo_insercion ON archivo
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_archivo_modificacion ON archivo
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)

    // MT-04: las escrituras del superadmin quedan en superadmin_cambio, como
    // en el resto de las tablas con universidad_id (CrearSuperadminCambio).
    // Hoy no escribe archivos (la RLS exige profesor, ayudante o alumno),
    // pero el trigger cubre cualquier cambio futuro de esas políticas.
    await queryRunner.query(`
      CREATE TRIGGER tg_archivo_auditar_superadmin
        AFTER INSERT OR UPDATE ON archivo
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin()
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus políticas, índices, trigger y permisos.
    // Los objetos del bucket no se tocan.
    await queryRunner.query(`DROP TABLE archivo`)
  }
}
