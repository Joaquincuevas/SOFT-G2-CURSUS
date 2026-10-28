import type { MigrationInterface, QueryRunner } from 'typeorm'

// ANU-04: la última visita se registra sobre los anuncios efectivamente
// recibidos, no con un corte de reloj que pueda perder publicaciones concurrentes.
export class CrearLecturaAnuncio1792620000000 implements MigrationInterface {
  name = 'CrearLecturaAnuncio1792620000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE anuncio ADD CONSTRAINT
      uq_anuncio_id_universidad UNIQUE (id, universidad_id)`)
    await q.query(`CREATE TABLE lectura_anuncio (
      alumno_id uuid NOT NULL,
      anuncio_id uuid NOT NULL,
      universidad_id uuid NOT NULL,
      visto_en timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_lectura_anuncio PRIMARY KEY (alumno_id, anuncio_id),
      CONSTRAINT fk_lectura_anuncio_alumno FOREIGN KEY (alumno_id, universidad_id)
        REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
      CONSTRAINT fk_lectura_anuncio_anuncio FOREIGN KEY (anuncio_id, universidad_id)
        REFERENCES anuncio (id, universidad_id) ON DELETE RESTRICT
    )`)
    await q.query(`CREATE INDEX ix_lectura_anuncio_anuncio
      ON lectura_anuncio (anuncio_id, universidad_id)`)
    // Registros inmutables: solo SELECT/INSERT; sin UPDATE ni DELETE. El alumno
    // se toma de la sesión y se filtra en cada consulta, además del RLS por tenant.
    await q.query('GRANT SELECT, INSERT ON lectura_anuncio TO cursus_app')
    await q.query('ALTER TABLE lectura_anuncio ENABLE ROW LEVEL SECURITY')
    const propioTenant = `universidad_id = universidad_actual() AND rol_actual() = 'ALUMNO'`
    await q.query(`CREATE POLICY pol_lectura_anuncio_lectura ON lectura_anuncio
      FOR SELECT TO cursus_app USING (${propioTenant})`)
    await q.query(`CREATE POLICY pol_lectura_anuncio_insercion ON lectura_anuncio
      FOR INSERT TO cursus_app WITH CHECK (${propioTenant})`)
  }

  async down(q: QueryRunner): Promise<void> {
    // Se pierde el seguimiento de lectura; los anuncios permanecen intactos.
    await q.query('DROP TABLE lectura_anuncio')
    await q.query(
      'ALTER TABLE anuncio DROP CONSTRAINT uq_anuncio_id_universidad',
    )
  }
}
