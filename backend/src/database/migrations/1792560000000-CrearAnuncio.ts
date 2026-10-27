import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol de las consultas institucionales (ver ActivarRls). Una migración no
// importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

// Anuncios de un curso (ANU-01, RN-09). Se guardan por curso y no por sección:
// todas las secciones del curso leen la misma fila. created_at es la fecha de
// publicación.
export class CrearAnuncio1792560000000 implements MigrationInterface {
  name = 'CrearAnuncio1792560000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Las FKs compuestas aseguran que el curso y el autor sean de la misma
    // universidad que el anuncio (uq_curso_id_universidad de CrearSeccion y
    // uq_usuario_id_universidad de CrearInscripcion). Nada se elimina: un
    // anuncio se archiva con archived_at.
    await queryRunner.query(`
      CREATE TABLE anuncio (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        curso_id uuid NOT NULL,
        autor_id uuid NOT NULL,
        titulo text NOT NULL,
        cuerpo text NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_anuncio PRIMARY KEY (id),
        CONSTRAINT fk_anuncio_curso FOREIGN KEY (curso_id, universidad_id)
          REFERENCES curso (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_anuncio_autor FOREIGN KEY (autor_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_anuncio_titulo CHECK (
          titulo = btrim(titulo) AND length(titulo) BETWEEN 1 AND 200
        ),
        CONSTRAINT ck_anuncio_cuerpo CHECK (
          cuerpo = btrim(cuerpo) AND length(cuerpo) BETWEEN 1 AND 5000
        )
      )
    `)

    // Cubre fk_anuncio_curso y el listado de un curso, del más nuevo al más
    // antiguo.
    await queryRunner.query(`
      CREATE INDEX ix_anuncio_curso_fecha
        ON anuncio (curso_id, created_at DESC, id)
    `)
    // Para fk_anuncio_autor.
    await queryRunner.query(`
      CREATE INDEX ix_anuncio_autor ON anuncio (autor_id, universidad_id)
    `)

    await queryRunner.query(`
      CREATE TRIGGER tg_anuncio_updated_at
        BEFORE UPDATE ON anuncio
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `)

    // RLS con el patrón de CrearSeccion: ENABLE y no FORCE. Cada universidad
    // lee sus anuncios y el Director los de todas (ADR 0001); solo un
    // profesor publica o modifica, en su universidad. Que sea profesor del
    // curso lo verifica AnunciosService. ANU-01 no expone ningún UPDATE: la
    // política queda para archivar anuncios, como en el resto de las tablas.
    // Sin DELETE: nada se elimina.
    const puedeEscribir = `universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR'`
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON anuncio TO ${ROL_APP}`,
    )
    await queryRunner.query(`ALTER TABLE anuncio ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_anuncio_lectura ON anuncio
        FOR SELECT TO ${ROL_APP}
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_anuncio_insercion ON anuncio
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (${puedeEscribir})
    `)
    await queryRunner.query(`
      CREATE POLICY pol_anuncio_modificacion ON anuncio
        FOR UPDATE TO ${ROL_APP}
        USING (${puedeEscribir})
        WITH CHECK (${puedeEscribir})
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus políticas, índices, trigger y permisos.
    await queryRunner.query(`DROP TABLE anuncio`)
  }
}
