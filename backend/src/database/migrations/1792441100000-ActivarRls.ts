import type { MigrationInterface, QueryRunner } from 'typeorm'

// Rol con el que la API ejecuta las consultas institucionales (SET LOCAL ROLE
// en BaseDeDatos.consultarEnUniversidad). No es dueño de las tablas, así que
// RLS se le aplica, y no tiene DELETE: nada institucional se borra. Una
// migración no importa código de la aplicación: el valor se repite aquí.
const ROL_APP = 'cursus_app'

// Tablas institucionales y la columna que identifica su universidad.
const TABLAS: [tabla: string, columna: string][] = [
  ['universidad', 'id'],
  ['facultad', 'universidad_id'],
  ['carrera', 'universidad_id'],
  ['periodo', 'universidad_id'],
  ['usuario', 'universidad_id'],
]

export class ActivarRls1792441100000 implements MigrationInterface {
  name = 'ActivarRls1792441100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Los roles son de todo el servidor, no de una base: puede existir ya si
    // otra base del mismo servidor aplicó esta migración (por ejemplo, en los
    // tests).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROL_APP}') THEN
          CREATE ROLE ${ROL_APP} NOLOGIN;
        END IF;
      END
      $$
    `)
    // El usuario de la API (dueño de las tablas) necesita ser miembro del rol
    // para poder hacer SET ROLE.
    await queryRunner.query(`GRANT ${ROL_APP} TO CURRENT_USER`)
    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO ${ROL_APP}`)

    // Universidad fijada en la consulta (set_config('app.universidad_id')), o
    // NULL si no se fijó: sin universidad, las políticas no dejan pasar filas.
    await queryRunner.query(`
      CREATE FUNCTION universidad_actual() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.universidad_id', true), '')::uuid
      $$
    `)

    // ENABLE y no FORCE: el dueño de las tablas (migraciones, seed, login y
    // sesiones) sigue sin RLS; la API pasa por las políticas con ROL_APP.
    for (const [tabla, columna] of TABLAS) {
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE ON ${tabla} TO ${ROL_APP}`,
      )
      await queryRunner.query(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        CREATE POLICY pol_${tabla}_universidad ON ${tabla} TO ${ROL_APP}
          USING (${columna} = universidad_actual())
          WITH CHECK (${columna} = universidad_actual())
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tabla] of [...TABLAS].reverse()) {
      await queryRunner.query(
        `DROP POLICY pol_${tabla}_universidad ON ${tabla}`,
      )
      await queryRunner.query(`ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`REVOKE ALL ON ${tabla} FROM ${ROL_APP}`)
    }
    await queryRunner.query(`DROP FUNCTION universidad_actual()`)
    await queryRunner.query(`REVOKE USAGE ON SCHEMA public FROM ${ROL_APP}`)
    // El rol no se borra: es de todo el servidor y otras bases pueden usarlo.
  }
}
