import type { MigrationInterface, QueryRunner } from 'typeorm'

// El Director lee todas las universidades pero no modifica ninguna, ni la
// suya (ADR 0001). La política única de ActivarRls se separa en lectura,
// inserción y modificación. No hay política de DELETE: cursus_app no tiene
// ese permiso.
const ROL_APP = 'cursus_app'

// Tablas institucionales y la columna que identifica su universidad.
const TABLAS: [tabla: string, columna: string][] = [
  ['universidad', 'id'],
  ['facultad', 'universidad_id'],
  ['carrera', 'universidad_id'],
  ['periodo', 'universidad_id'],
  ['usuario', 'universidad_id'],
]

export class PermitirLecturaDirector1792442000000 implements MigrationInterface {
  name = 'PermitirLecturaDirector1792442000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rol de la sesión fijado en la consulta (set_config('app.rol')), o NULL.
    await queryRunner.query(`
      CREATE FUNCTION rol_actual() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.rol', true), '')
      $$
    `)

    for (const [tabla, columna] of TABLAS) {
      const deSuUniversidad = `${columna} = universidad_actual()`
      // Escribe solo quien tiene un rol fijado que no es Director.
      const puedeEscribir = `${deSuUniversidad} AND rol_actual() <> 'DIRECTOR'`

      await queryRunner.query(
        `DROP POLICY pol_${tabla}_universidad ON ${tabla}`,
      )
      await queryRunner.query(`
        CREATE POLICY pol_${tabla}_lectura ON ${tabla}
          FOR SELECT TO ${ROL_APP}
          USING (${deSuUniversidad} OR rol_actual() = 'DIRECTOR')
      `)
      await queryRunner.query(`
        CREATE POLICY pol_${tabla}_insercion ON ${tabla}
          FOR INSERT TO ${ROL_APP}
          WITH CHECK (${puedeEscribir})
      `)
      await queryRunner.query(`
        CREATE POLICY pol_${tabla}_modificacion ON ${tabla}
          FOR UPDATE TO ${ROL_APP}
          USING (${puedeEscribir})
          WITH CHECK (${puedeEscribir})
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tabla, columna] of TABLAS) {
      for (const politica of ['lectura', 'insercion', 'modificacion']) {
        await queryRunner.query(
          `DROP POLICY pol_${tabla}_${politica} ON ${tabla}`,
        )
      }
      // La política de ActivarRls.
      await queryRunner.query(`
        CREATE POLICY pol_${tabla}_universidad ON ${tabla} TO ${ROL_APP}
          USING (${columna} = universidad_actual())
          WITH CHECK (${columna} = universidad_actual())
      `)
    }
    await queryRunner.query(`DROP FUNCTION rol_actual()`)
  }
}
