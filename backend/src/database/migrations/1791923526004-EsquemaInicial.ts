import type { MigrationInterface, QueryRunner } from 'typeorm'

// Tablas con columna updated_at mantenida por trigger, en orden de creación.
const TABLAS = ['universidad', 'facultad', 'carrera', 'periodo', 'usuario']

export class EsquemaInicial1791923526004 implements MigrationInterface {
  name = 'EsquemaInicial1791923526004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION actualizar_updated_at() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$
    `)

    await queryRunner.query(`
      CREATE TYPE rol_usuario AS ENUM (
        'DIRECTOR', 'ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'
      )
    `)

    // El dominio se guarda en minúsculas y sin '@' (por ejemplo, 'uandes.cl').
    await queryRunner.query(`
      CREATE TABLE universidad (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        nombre text NOT NULL,
        dominio_correo text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_universidad PRIMARY KEY (id),
        CONSTRAINT uq_universidad_nombre UNIQUE (nombre),
        CONSTRAINT uq_universidad_dominio_correo UNIQUE (dominio_correo),
        CONSTRAINT ck_universidad_dominio_correo CHECK (
          dominio_correo ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
        )
      )
    `)

    // uq_facultad_id_universidad permite que usuario referencie (facultad, universidad)
    // y así asegurar que la facultad de un usuario sea de su misma universidad.
    await queryRunner.query(`
      CREATE TABLE facultad (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        nombre text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_facultad PRIMARY KEY (id),
        CONSTRAINT fk_facultad_universidad FOREIGN KEY (universidad_id)
          REFERENCES universidad (id) ON DELETE RESTRICT,
        CONSTRAINT uq_facultad_universidad_nombre UNIQUE (universidad_id, nombre),
        CONSTRAINT uq_facultad_id_universidad UNIQUE (id, universidad_id)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE carrera (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        facultad_id uuid NOT NULL,
        nombre text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_carrera PRIMARY KEY (id),
        CONSTRAINT fk_carrera_facultad FOREIGN KEY (facultad_id)
          REFERENCES facultad (id) ON DELETE RESTRICT,
        CONSTRAINT uq_carrera_facultad_nombre UNIQUE (facultad_id, nombre)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE periodo (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        anio smallint NOT NULL,
        semestre smallint NOT NULL,
        fecha_inicio date NOT NULL,
        fecha_termino date NOT NULL,
        activo boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_periodo PRIMARY KEY (id),
        CONSTRAINT fk_periodo_universidad FOREIGN KEY (universidad_id)
          REFERENCES universidad (id) ON DELETE RESTRICT,
        CONSTRAINT uq_periodo_universidad_anio_semestre UNIQUE (universidad_id, anio, semestre),
        CONSTRAINT ck_periodo_semestre CHECK (semestre IN (1, 2)),
        CONSTRAINT ck_periodo_fechas CHECK (fecha_termino > fecha_inicio)
      )
    `)

    // Como máximo un período activo por universidad.
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_periodo_activo_por_universidad
        ON periodo (universidad_id) WHERE activo
    `)

    // password_hash debe tener formato de hash ($<algoritmo>$...), por ejemplo
    // bcrypt ($2b$...) o argon2 ($argon2id$...), para rechazar texto plano.
    await queryRunner.query(`
      CREATE TABLE usuario (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        facultad_id uuid,
        nombre text NOT NULL,
        correo text NOT NULL,
        password_hash text NOT NULL,
        rol rol_usuario NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_usuario PRIMARY KEY (id),
        CONSTRAINT fk_usuario_universidad FOREIGN KEY (universidad_id)
          REFERENCES universidad (id) ON DELETE RESTRICT,
        CONSTRAINT fk_usuario_facultad FOREIGN KEY (facultad_id, universidad_id)
          REFERENCES facultad (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_usuario_password_hash CHECK (
          password_hash ~ '^[$][a-z0-9-]+[$].{20,}$'
        )
      )
    `)

    // El correo no se repite dentro de una universidad, sin distinguir mayúsculas.
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_usuario_universidad_correo
        ON usuario (universidad_id, lower(correo))
    `)

    for (const tabla of TABLAS) {
      await queryRunner.query(`
        CREATE TRIGGER tg_${tabla}_updated_at
          BEFORE UPDATE ON ${tabla}
          FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al borrar cada tabla se borran también sus índices y triggers.
    for (const tabla of [...TABLAS].reverse()) {
      await queryRunner.query(`DROP TABLE ${tabla}`)
    }
    await queryRunner.query(`DROP TYPE rol_usuario`)
    await queryRunner.query(`DROP FUNCTION actualizar_updated_at()`)
  }
}
