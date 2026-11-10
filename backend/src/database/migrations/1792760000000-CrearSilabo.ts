import type { MigrationInterface, QueryRunner } from 'typeorm'

const ROL_APP = 'cursus_app'

export class CrearSilabo1792760000000 implements MigrationInterface {
  name = 'CrearSilabo1792760000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE silabo (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        curso_id uuid NOT NULL,
        version integer NOT NULL,
        contenido bytea NOT NULL,
        subido_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_silabo PRIMARY KEY (id),
        CONSTRAINT fk_silabo_curso FOREIGN KEY (curso_id, universidad_id)
          REFERENCES curso (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT uq_silabo_curso_version UNIQUE (curso_id, version),
        CONSTRAINT ck_silabo_version CHECK (version > 0),
        CONSTRAINT ck_silabo_contenido CHECK (
          octet_length(contenido) BETWEEN 1 AND 10485760
        )
      )
    `)
    await queryRunner.query(`GRANT SELECT, INSERT ON silabo TO ${ROL_APP}`)
    await queryRunner.query(`ALTER TABLE silabo ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      CREATE POLICY pol_silabo_lectura ON silabo
        FOR SELECT TO ${ROL_APP}
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await queryRunner.query(`
      CREATE POLICY pol_silabo_insercion ON silabo
        FOR INSERT TO ${ROL_APP}
        WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'PROFESOR')
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE silabo`)
  }
}
