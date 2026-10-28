import type { MigrationInterface, QueryRunner } from 'typeorm'

// GES-23: el superadmin crea, edita y archiva universidades y facultades desde
// su vista global (rol SUPERADMIN, sin universidad de sesión). Compatible
// hacia atrás: el código anterior no escribe en estas tablas desde la API, y
// el color tiene un valor por defecto.

// Color de CURSUS (--color-primary del frontend). UI-04 asigna colores
// distintos a las universidades existentes.
const COLOR_CURSUS = '#1b4f72'

// Escritura en universidad y facultad: solo el superadmin en su vista global.
// Antes la tenía cualquier rol salvo el Director dentro de su universidad,
// aunque ninguna ruta la usaba. Dentro de una facultad, el superadmin trabaja
// con el rol ADMINISTRATIVO, así que tampoco escribe aquí.
const SOLO_SUPERADMIN = `rol_actual() = 'SUPERADMIN' AND superadmin_actual() IS NOT NULL`
// El USING de UPDATE también decide qué filas se bloquean con SELECT ... FOR
// UPDATE: GES-02 bloquea la fila de su universidad para activar un período.
// Por eso el USING conserva las filas de antes (las de su universidad, salvo
// el Director) y solo el WITH CHECK queda para el superadmin: el
// Administrativo bloquea la fila, pero un UPDATE suyo falla.

// [tabla, columna con la universidad] de las políticas que se reemplazan
// (las de PermitirLecturaDirector).
const TABLAS: [tabla: string, columna: string][] = [
  ['universidad', 'id'],
  ['facultad', 'universidad_id'],
]

// Nombre sin mayúsculas ni espacios repetidos, como el de carrera
// (NombreCarreraUnicoNormalizado).
const normalizado = (columna: string) =>
  `lower(btrim(regexp_replace(${columna}, '[[:space:]]+', ' ', 'g')))`

export class GestionarUniversidades1792660000000 implements MigrationInterface {
  name = 'GestionarUniversidades1792660000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE universidad
        ADD COLUMN color text NOT NULL DEFAULT '${COLOR_CURSUS}',
        ADD CONSTRAINT ck_universidad_color CHECK (color ~ '^#[0-9a-f]{6}$')
    `)
    // Incluyen las archivadas, como las restricciones originales: un nombre
    // no se reutiliza. Si ya hay duplicados, falla sin modificar datos.
    await q.query(`
      CREATE UNIQUE INDEX ux_universidad_nombre_normalizado
        ON universidad (${normalizado('nombre')})
    `)
    await q.query(`
      CREATE UNIQUE INDEX ux_facultad_universidad_nombre_normalizado
        ON facultad (universidad_id, ${normalizado('nombre')})
    `)

    for (const [tabla, columna] of TABLAS) {
      const bloquea = `(${columna} = universidad_actual() AND rol_actual() <> 'DIRECTOR')`
      await q.query(`DROP POLICY pol_${tabla}_insercion ON ${tabla}`)
      await q.query(`DROP POLICY pol_${tabla}_modificacion ON ${tabla}`)
      await q.query(`
        CREATE POLICY pol_${tabla}_insercion ON ${tabla}
          FOR INSERT TO cursus_app WITH CHECK (${SOLO_SUPERADMIN})
      `)
      await q.query(`
        CREATE POLICY pol_${tabla}_modificacion ON ${tabla}
          FOR UPDATE TO cursus_app
          USING (${bloquea} OR (${SOLO_SUPERADMIN}))
          WITH CHECK (${SOLO_SUPERADMIN})
      `)
    }

    // El login identifica la universidad por el dominio del correo: cambiarlo
    // dejaría sin acceso a todos sus usuarios. Solo se corrige mientras no
    // tenga usuarios. Tampoco puede ser el dominio del correo de un
    // superadmin, que no es de ninguna universidad. SECURITY DEFINER: la RLS
    // no deja ver al superadmin ni los usuarios desde la vista global.
    await q.query(`
      CREATE FUNCTION validar_dominio_universidad() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND OLD.dominio_correo = NEW.dominio_correo THEN
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' AND EXISTS (
          SELECT FROM usuario WHERE universidad_id = NEW.id
        ) THEN
          RAISE EXCEPTION 'No se puede cambiar el dominio de una universidad con usuarios: dejarían de poder iniciar sesión'
            USING ERRCODE = 'restrict_violation',
                  CONSTRAINT = 'ck_universidad_dominio_con_usuarios';
        END IF;
        IF EXISTS (
          SELECT FROM usuario
           WHERE rol = 'SUPERADMIN'
             AND lower(split_part(correo, '@', 2)) = NEW.dominio_correo
        ) THEN
          RAISE EXCEPTION 'Ese dominio es el del correo de un superadmin'
            USING ERRCODE = 'restrict_violation',
                  CONSTRAINT = 'ck_universidad_dominio_superadmin';
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_universidad_dominio
        BEFORE INSERT OR UPDATE OF dominio_correo ON universidad
        FOR EACH ROW EXECUTE FUNCTION validar_dominio_universidad()
    `)

    // Una facultad se archiva solo sin carreras ni usuarios vigentes: si no,
    // quedarían colgando de una facultad que ya no aparece.
    await q.query(`
      CREATE FUNCTION facultad_archivable() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE
        carreras int := (SELECT count(*) FROM carrera
                          WHERE facultad_id = NEW.id AND archived_at IS NULL);
        usuarios int := (SELECT count(*) FROM usuario
                          WHERE facultad_id = NEW.id AND archived_at IS NULL);
      BEGIN
        IF carreras > 0 OR usuarios > 0 THEN
          RAISE EXCEPTION 'No se puede archivar: la facultad tiene % carreras y % usuarios vigentes',
            carreras, usuarios
            USING ERRCODE = 'restrict_violation',
                  CONSTRAINT = 'ck_facultad_archivada_sin_uso';
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_facultad_archivable
        BEFORE UPDATE OF archived_at ON facultad
        FOR EACH ROW
        WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
        EXECUTE FUNCTION facultad_archivable()
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER tg_facultad_archivable ON facultad')
    await q.query('DROP FUNCTION facultad_archivable()')
    await q.query('DROP TRIGGER tg_universidad_dominio ON universidad')
    await q.query('DROP FUNCTION validar_dominio_universidad()')
    // Las políticas de PermitirLecturaDirector.
    for (const [tabla, columna] of TABLAS) {
      const propia = `${columna} = universidad_actual() AND rol_actual() <> 'DIRECTOR'`
      await q.query(`DROP POLICY pol_${tabla}_insercion ON ${tabla}`)
      await q.query(`DROP POLICY pol_${tabla}_modificacion ON ${tabla}`)
      await q.query(`
        CREATE POLICY pol_${tabla}_insercion ON ${tabla}
          FOR INSERT TO cursus_app WITH CHECK (${propia})
      `)
      await q.query(`
        CREATE POLICY pol_${tabla}_modificacion ON ${tabla}
          FOR UPDATE TO cursus_app USING (${propia}) WITH CHECK (${propia})
      `)
    }
    await q.query('DROP INDEX ux_facultad_universidad_nombre_normalizado')
    await q.query('DROP INDEX ux_universidad_nombre_normalizado')
    await q.query(`
      ALTER TABLE universidad
        DROP CONSTRAINT ck_universidad_color,
        DROP COLUMN color
    `)
  }
}
