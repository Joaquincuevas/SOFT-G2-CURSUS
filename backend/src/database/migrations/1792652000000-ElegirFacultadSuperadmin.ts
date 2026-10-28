import type { MigrationInterface, QueryRunner } from 'typeorm'

// MT-04 (ADR 0002): el superadmin elige una universidad y una facultad, y
// dentro de ella trabaja como el Administrativo de esa facultad.
const ROL_APP = 'cursus_app'

// Tablas que el superadmin lee de todas las universidades para elegir dónde
// trabajar. Las escribe recién en GES-23.
const TABLAS_ELEGIBLES: [tabla: string, columna: string][] = [
  ['universidad', 'id'],
  ['facultad', 'universidad_id'],
]

export class ElegirFacultadSuperadmin1792652000000 implements MigrationInterface {
  name = 'ElegirFacultadSuperadmin1792652000000'

  async up(q: QueryRunner): Promise<void> {
    // La elección vive en la sesión y no en el JWT: rige desde la petición
    // siguiente y cada sesión (por ejemplo, otra pestaña de otro equipo)
    // tiene la suya. La FK compuesta asegura que la facultad sea de esa
    // universidad.
    await q.query(`
      ALTER TABLE sesion_auth
        ADD COLUMN universidad_activa_id uuid,
        ADD COLUMN facultad_activa_id uuid,
        ADD CONSTRAINT fk_sesion_auth_facultad_activa
          FOREIGN KEY (facultad_activa_id, universidad_activa_id)
          REFERENCES facultad (id, universidad_id) ON DELETE RESTRICT,
        ADD CONSTRAINT ck_sesion_auth_facultad_activa
          CHECK ((universidad_activa_id IS NULL) = (facultad_activa_id IS NULL))
    `)

    // Superadmin de la consulta (set_config('app.superadmin_id')), o NULL.
    // Lo fija BaseDeDatos cuando la sesión es de un superadmin que trabaja en
    // una facultad, junto con app.facultad_id. Lo usan facultad_actual() y la
    // auditoría (CrearSuperadminCambio).
    await q.query(`
      CREATE FUNCTION superadmin_actual() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.superadmin_id', true), '')::uuid
      $$
    `)

    // Facultad en la que trabaja el usuario de la sesión (p_usuario), o NULL:
    // - El superadmin: la que eligió, si sigue vigente y es de la universidad
    //   fijada.
    // - El Administrativo: la suya, si él y su facultad siguen vigentes.
    // Reemplaza a la subconsulta que cada servicio de gestión repetía sobre
    // usuario. Corre con los permisos de quien la llama, así que RLS se aplica.
    await q.query(`
      CREATE FUNCTION facultad_actual(p_usuario uuid) RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT CASE
          WHEN p_usuario = superadmin_actual() THEN (
            SELECT f.id FROM facultad f
             WHERE f.id = NULLIF(current_setting('app.facultad_id', true), '')::uuid
               AND f.universidad_id = universidad_actual()
               AND f.archived_at IS NULL)
          ELSE (
            SELECT u.facultad_id FROM usuario u
              JOIN facultad f ON f.id = u.facultad_id
                             AND f.universidad_id = u.universidad_id
             WHERE u.id = p_usuario AND u.universidad_id = universidad_actual()
               AND u.rol = 'ADMINISTRATIVO' AND u.archived_at IS NULL
               AND f.archived_at IS NULL)
        END
      $$
    `)

    // El superadmin lee las universidades y facultades de todas, como el
    // Director, para elegir dónde trabajar (BaseDeDatos.consultarComoSuperadmin,
    // en una transacción READ ONLY). Las políticas de escritura no cambian:
    // dentro de una facultad, el superadmin escribe como Administrativo.
    for (const [tabla, columna] of TABLAS_ELEGIBLES) {
      await q.query(`DROP POLICY pol_${tabla}_lectura ON ${tabla}`)
      await q.query(`
        CREATE POLICY pol_${tabla}_lectura ON ${tabla}
          FOR SELECT TO ${ROL_APP}
          USING (${columna} = universidad_actual()
                 OR rol_actual() IN ('DIRECTOR', 'SUPERADMIN'))
      `)
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const [tabla, columna] of TABLAS_ELEGIBLES) {
      await q.query(`DROP POLICY pol_${tabla}_lectura ON ${tabla}`)
      // La política de PermitirLecturaDirector.
      await q.query(`
        CREATE POLICY pol_${tabla}_lectura ON ${tabla}
          FOR SELECT TO ${ROL_APP}
          USING (${columna} = universidad_actual() OR rol_actual() = 'DIRECTOR')
      `)
    }
    await q.query(`DROP FUNCTION facultad_actual(uuid)`)
    await q.query(`DROP FUNCTION superadmin_actual()`)
    await q.query(`
      ALTER TABLE sesion_auth
        DROP COLUMN facultad_activa_id,
        DROP COLUMN universidad_activa_id
    `)
  }
}
