import type { MigrationInterface, QueryRunner } from 'typeorm'

// MT-04 (ADR 0002): el superadmin es un usuario sin universidad ni facultad
// propias. Todos los demás roles siguen teniendo universidad.
//
// Como la API escribe con cursus_app y las políticas de usuario exigen
// universidad_id = universidad_actual(), la API nunca puede crear un
// superadmin ni convertir a alguien en uno: solo el dueño de las tablas (el
// comando crear-superadmin, que corre una persona).

// Responsables de cambios que hace el Administrativo, y por lo tanto también
// el superadmin cuando trabaja en una facultad: [tabla, restricción, columna].
const RESPONSABLES: [tabla: string, restriccion: string, columna: string][] = [
  ['curso_cambio', 'fk_curso_cambio_responsable', 'responsable_id'],
  ['asignacion_cambio', 'fk_asignacion_cambio_responsable', 'responsable_id'],
  ['inscripcion', 'fk_inscripcion_archivada_por', 'archivada_por'],
]

export class PermitirUsuarioSuperadmin1792651000000 implements MigrationInterface {
  name = 'PermitirUsuarioSuperadmin1792651000000'

  async up(q: QueryRunner): Promise<void> {
    // Compatible hacia atrás: el código anterior nunca inserta un NULL.
    await q.query(
      `ALTER TABLE usuario ALTER COLUMN universidad_id DROP NOT NULL`,
    )
    await q.query(`
      ALTER TABLE usuario ADD CONSTRAINT ck_usuario_superadmin CHECK (
        (rol = 'SUPERADMIN') = (universidad_id IS NULL)
        AND (rol <> 'SUPERADMIN' OR facultad_id IS NULL)
      )
    `)
    // El correo es único por universidad (ux_usuario_universidad_correo), y
    // ese índice no cubre un NULL: entre los superadmins, también es único.
    await q.query(`
      CREATE UNIQUE INDEX ux_usuario_correo_superadmin
        ON usuario (lower(correo)) WHERE universidad_id IS NULL
    `)
    // El Director lee los usuarios de todas las universidades (ADR 0001),
    // pero el superadmin no es de ninguna: nadie lo ve desde la API.
    await q.query(`DROP POLICY pol_usuario_lectura ON usuario`)
    await q.query(`
      CREATE POLICY pol_usuario_lectura ON usuario
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual()
               OR (rol_actual() = 'DIRECTOR' AND universidad_id IS NOT NULL))
    `)

    // Las FKs compuestas (responsable, universidad) exigían que el
    // responsable fuera de la misma universidad del cambio. El superadmin no
    // tiene universidad, así que la FK pasa a referenciar solo al usuario, y
    // un trigger mantiene la regla: el responsable es de la universidad del
    // cambio o es un superadmin. Responde con el mismo código y la misma
    // restricción que la FK anterior. SECURITY DEFINER: RLS no deja ver al
    // superadmin ni a otra universidad desde la API.
    await q.query(`
      CREATE FUNCTION responsable_de_la_universidad() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE
        responsable uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
      BEGIN
        IF responsable IS NOT NULL AND NOT EXISTS (
          SELECT FROM usuario u
           WHERE u.id = responsable
             AND (u.universidad_id = NEW.universidad_id OR u.rol = 'SUPERADMIN')
        ) THEN
          RAISE EXCEPTION 'El responsable debe ser de la misma universidad o un superadmin'
            USING ERRCODE = 'foreign_key_violation', CONSTRAINT = TG_ARGV[1];
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    for (const [tabla, restriccion, columna] of RESPONSABLES) {
      await q.query(`ALTER TABLE ${tabla} DROP CONSTRAINT ${restriccion}`)
      await q.query(`
        ALTER TABLE ${tabla} ADD CONSTRAINT ${restriccion}
          FOREIGN KEY (${columna}) REFERENCES usuario (id) ON DELETE RESTRICT
      `)
      await q.query(`
        CREATE TRIGGER tg_${tabla}_${columna}_universidad
          BEFORE INSERT OR UPDATE OF ${columna} ON ${tabla}
          FOR EACH ROW
          EXECUTE FUNCTION responsable_de_la_universidad('${columna}', '${restriccion}')
      `)
    }
  }

  async down(q: QueryRunner): Promise<void> {
    // Falla si ya hay un superadmin o un cambio hecho por uno: se revierte
    // solo en una base sin superadmins.
    for (const [tabla, restriccion, columna] of RESPONSABLES) {
      await q.query(
        `DROP TRIGGER tg_${tabla}_${columna}_universidad ON ${tabla}`,
      )
      await q.query(`ALTER TABLE ${tabla} DROP CONSTRAINT ${restriccion}`)
      await q.query(`
        ALTER TABLE ${tabla} ADD CONSTRAINT ${restriccion}
          FOREIGN KEY (${columna}, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      `)
    }
    await q.query(`DROP FUNCTION responsable_de_la_universidad()`)
    // La política de PermitirLecturaDirector.
    await q.query(`DROP POLICY pol_usuario_lectura ON usuario`)
    await q.query(`
      CREATE POLICY pol_usuario_lectura ON usuario
        FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`DROP INDEX ux_usuario_correo_superadmin`)
    await q.query(`ALTER TABLE usuario DROP CONSTRAINT ck_usuario_superadmin`)
    await q.query(
      `ALTER TABLE usuario ALTER COLUMN universidad_id SET NOT NULL`,
    )
  }
}
