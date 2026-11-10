import type { MigrationInterface, QueryRunner } from 'typeorm'

// GES-25: una sección puede tener varios profesores, con los mismos permisos.
// Expand/contract: seccion_profesor pasa a ser la fuente de verdad, pero
// seccion.profesor_id se mantiene (el primer profesor vigente) y se
// sincroniza en los dos sentidos, para que un deploy anterior siga
// funcionando. Un deploy posterior lo retira (docs/ges-25-varios-profesores.md).

// "Quien escribe es profesor de la sección de la evaluación", como la dejaron
// AprobarNotas (NOT-11) y DevolverNotas (NOT-12), y como queda ahora.
const PROFESOR_ANTERIOR = (tabla: string) => `
  EXISTS (SELECT 1 FROM evaluacion e
            JOIN seccion s ON s.id = e.seccion_id
                          AND s.universidad_id = e.universidad_id
           WHERE e.id = ${tabla}.evaluacion_id
             AND e.universidad_id = ${tabla}.universidad_id
             AND s.profesor_id = usuario_actual())`
const PROFESOR_NUEVO = (tabla: string) => `
  EXISTS (SELECT 1 FROM evaluacion e
           WHERE e.id = ${tabla}.evaluacion_id
             AND e.universidad_id = ${tabla}.universidad_id
             AND es_profesor_de_seccion(e.seccion_id, usuario_actual()))`

const PROFESOR = `universidad_id = universidad_actual()
  AND rol_actual() = 'PROFESOR'`

// Las tres políticas del profesor, idénticas a las de NOT-11 y NOT-12 salvo
// la condición de la sección.
async function politicasDelProfesor(
  q: QueryRunner,
  esProfesor: (tabla: string) => string,
) {
  await q.query('DROP POLICY pol_nota_publicacion ON nota')
  await q.query(`
    CREATE POLICY pol_nota_publicacion ON nota
      FOR UPDATE TO cursus_app
      USING (${PROFESOR} AND estado = 'PROPUESTA' AND archived_at IS NULL
             AND ${esProfesor('nota')}
             AND (SELECT r.estado FROM revision_notas r
                   WHERE r.evaluacion_id = nota.evaluacion_id
                     AND r.universidad_id = nota.universidad_id) = 'EN_REVISION')
      WITH CHECK (${PROFESOR} AND estado = 'PUBLICADA' AND archived_at IS NULL
                  AND valor BETWEEN 1.0 AND 7.0
                  AND ${esProfesor('nota')})
  `)
  await q.query('DROP POLICY pol_revision_notas_aprobacion ON revision_notas')
  await q.query(`
    CREATE POLICY pol_revision_notas_aprobacion ON revision_notas
      FOR UPDATE TO cursus_app
      USING (${PROFESOR} AND estado = 'EN_REVISION'
             AND ${esProfesor('revision_notas')})
      WITH CHECK (${PROFESOR} AND estado = 'APROBADA'
                  AND actualizado_por = usuario_actual()
                  AND ${esProfesor('revision_notas')})
  `)
  await q.query('DROP POLICY pol_revision_notas_devolucion ON revision_notas')
  await q.query(`
    CREATE POLICY pol_revision_notas_devolucion ON revision_notas
      FOR UPDATE TO cursus_app
      USING (${PROFESOR} AND estado = 'EN_REVISION'
             AND ${esProfesor('revision_notas')})
      WITH CHECK (${PROFESOR} AND estado = 'DEVUELTA'
                  AND actualizado_por = usuario_actual()
                  AND comentario_devolucion IS NOT NULL
                  AND ${esProfesor('revision_notas')})
  `)
}

// ASI-04: el trigger que audita las correcciones de asistencia, como lo dejó
// CrearAsistenciaCambio y como queda ahora. Solo cambia la condición del
// profesor.
const CORRECCION_ANTERIOR = `
              JOIN usuario u ON u.id = s.profesor_id AND u.universidad_id = s.universidad_id
             WHERE c.id = OLD.clase_id AND c.universidad_id = OLD.universidad_id
               AND s.profesor_id = profesor AND u.rol = 'PROFESOR'
               AND c.archived_at IS NULL AND s.archived_at IS NULL
               AND cu.archived_at IS NULL AND u.archived_at IS NULL`
const CORRECCION_NUEVA = `
             WHERE c.id = OLD.clase_id AND c.universidad_id = OLD.universidad_id
               AND es_profesor_de_seccion(s.id, profesor)
               AND c.archived_at IS NULL AND s.archived_at IS NULL
               AND cu.archived_at IS NULL`

const correccionAsistencia = (condicion: string) => `
      CREATE OR REPLACE FUNCTION auditar_correccion_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        profesor uuid := NULLIF(current_setting('app.asistencia_profesor_id', true), '')::uuid;
        razon text := btrim(current_setting('app.asistencia_motivo', true));
      BEGIN
        IF NEW.presente IS DISTINCT FROM OLD.presente THEN
          IF OLD.archived_at IS NOT NULL OR profesor IS NULL OR NOT EXISTS (
            SELECT 1 FROM clase c
              JOIN seccion s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
              JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id${condicion}
          ) THEN
            RAISE EXCEPTION 'Solo el profesor vigente de la sección puede corregir la asistencia'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          INSERT INTO asistencia_cambio
            (universidad_id, asistencia_id, anterior, nuevo, motivo, responsable_id)
          VALUES (OLD.universidad_id, OLD.id, OLD.presente, NEW.presente, razon, profesor);
        END IF;
        RETURN NEW;
      END;
      $$
    `

export class VariosProfesoresSeccion1792780000000 implements MigrationInterface {
  name = 'VariosProfesoresSeccion1792780000000'

  async up(q: QueryRunner): Promise<void> {
    // Igual que ayudante_seccion (GES-12): FKs compuestas por universidad,
    // archivar en vez de borrar (GES-14) y un profesor vigente una sola vez
    // por sección. created_at con clock_timestamp(): ordena a los profesores
    // agregados en la misma transacción.
    await q.query(`
      CREATE TABLE seccion_profesor (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        seccion_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_seccion_profesor PRIMARY KEY (id),
        CONSTRAINT fk_seccion_profesor_seccion FOREIGN KEY (seccion_id, universidad_id)
          REFERENCES seccion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_seccion_profesor_usuario FOREIGN KEY (usuario_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT
      )
    `)
    await q.query(`CREATE UNIQUE INDEX ux_seccion_profesor_activo
      ON seccion_profesor (seccion_id, usuario_id) WHERE archived_at IS NULL`)
    await q.query(
      `CREATE INDEX ix_seccion_profesor_usuario ON seccion_profesor (usuario_id)`,
    )
    await q.query(`CREATE TRIGGER tg_seccion_profesor_updated_at
      BEFORE UPDATE ON seccion_profesor
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()`)

    // RLS como ayudante_seccion: leen la universidad y el Director; escribe el
    // Administrativo. Sin DELETE.
    await q.query(
      `GRANT SELECT, INSERT, UPDATE ON seccion_profesor TO cursus_app`,
    )
    await q.query(`ALTER TABLE seccion_profesor ENABLE ROW LEVEL SECURITY`)
    await q.query(`CREATE POLICY pol_seccion_profesor_lectura ON seccion_profesor
      FOR SELECT TO cursus_app
      USING (universidad_id = universidad_actual() OR rol_actual() = 'DIRECTOR')`)
    await q.query(`CREATE POLICY pol_seccion_profesor_insercion ON seccion_profesor
      FOR INSERT TO cursus_app
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
    await q.query(`CREATE POLICY pol_seccion_profesor_modificacion ON seccion_profesor
      FOR UPDATE TO cursus_app
      USING (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')
      WITH CHECK (universidad_id = universidad_actual() AND rol_actual() = 'ADMINISTRATIVO')`)
    // MT-04, como en ayudante_seccion.
    await q.query(`
      CREATE TRIGGER tg_seccion_profesor_auditar_superadmin
        AFTER INSERT OR UPDATE ON seccion_profesor
        FOR EACH ROW WHEN (superadmin_actual() IS NOT NULL)
        EXECUTE FUNCTION auditar_superadmin()
    `)

    // Backfill: cada sección con profesor lo conserva.
    await q.query(`
      INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
      SELECT universidad_id, id, profesor_id FROM seccion
       WHERE profesor_id IS NOT NULL
    `)

    // Un profesor vigente de la sección: asignado y sin archivar, con una
    // cuenta de profesor vigente. Reemplaza a "s.profesor_id = X". Corre con
    // la RLS de quien consulta (lee seccion_profesor y usuario de su
    // universidad), así que no necesita SECURITY DEFINER. Sin SET search_path
    // (usa nombres calificados): así PostgreSQL la expande en la consulta y
    // usa los índices, en vez de llamarla por cada sección.
    await q.query(`
      CREATE FUNCTION public.es_profesor_de_seccion(seccion uuid, usuario uuid)
      RETURNS boolean
      LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.seccion_profesor sp
            JOIN public.usuario u ON u.id = sp.usuario_id
                                 AND u.universidad_id = sp.universidad_id
           WHERE sp.seccion_id = seccion AND sp.usuario_id = usuario
             AND sp.archived_at IS NULL
             AND u.rol = 'PROFESOR' AND u.archived_at IS NULL)
      $$
    `)
    await q.query(
      'REVOKE ALL ON FUNCTION public.es_profesor_de_seccion(uuid, uuid) FROM PUBLIC',
    )
    await q.query(
      'GRANT EXECUTE ON FUNCTION public.es_profesor_de_seccion(uuid, uuid) TO cursus_app',
    )

    await politicasDelProfesor(q, PROFESOR_NUEVO)
    await q.query(correccionAsistencia(CORRECCION_NUEVA))

    // Sincronización en los dos sentidos. Las dos funciones son idempotentes:
    // solo escriben si algo cambia, así que la recursión termina sola. Son
    // SECURITY DEFINER (con search_path fijo y nombres calificados) para no
    // depender de la RLS de quien hizo el cambio.
    //
    // seccion_profesor -> seccion: profesor_id es el primer profesor vigente
    // (por created_at e id), o NULL.
    await q.query(`
      CREATE FUNCTION public.sincronizar_profesor_de_seccion() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE
        primero uuid;
      BEGIN
        SELECT sp.usuario_id INTO primero FROM public.seccion_profesor sp
         WHERE sp.seccion_id = NEW.seccion_id AND sp.archived_at IS NULL
         ORDER BY sp.created_at, sp.id
         LIMIT 1;
        UPDATE public.seccion SET profesor_id = primero
         WHERE id = NEW.seccion_id AND profesor_id IS DISTINCT FROM primero;
        RETURN NULL;
      END
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_seccion_profesor_sincronizar
        AFTER INSERT OR UPDATE OF archived_at ON seccion_profesor
        FOR EACH ROW EXECUTE FUNCTION public.sincronizar_profesor_de_seccion()
    `)
    // seccion -> seccion_profesor, para el código que aún escribe
    // profesor_id (un deploy anterior). Primero archiva solo al anterior y
    // después agrega al nuevo: en el otro orden, la primera sincronización
    // volvería a poner al anterior y archivaría al nuevo. Nunca toca a los
    // demás profesores.
    await q.query(`
      CREATE FUNCTION public.sincronizar_seccion_profesor() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      BEGIN
        -- Como SECURITY DEFINER escribe seccion_profesor sin su RLS: solo el
        -- Administrativo (o el dueño, sin rol: migraciones y seed) cambia
        -- profesor_id. Si no, cualquier rol que pueda modificar la sección se
        -- asignaría como profesor.
        IF NEW.profesor_id IS DISTINCT FROM
             (CASE WHEN TG_OP = 'UPDATE' THEN OLD.profesor_id END)
           AND public.rol_actual() IS NOT NULL
           AND public.rol_actual() <> 'ADMINISTRATIVO' THEN
          RAISE EXCEPTION 'Solo el Administrativo asigna profesores'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.profesor_id IS NOT NULL
           AND OLD.profesor_id IS DISTINCT FROM NEW.profesor_id THEN
          UPDATE public.seccion_profesor SET archived_at = clock_timestamp()
           WHERE seccion_id = NEW.id AND usuario_id = OLD.profesor_id
             AND archived_at IS NULL;
        END IF;
        IF NEW.profesor_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.seccion_profesor sp
           WHERE sp.seccion_id = NEW.id AND sp.usuario_id = NEW.profesor_id
             AND sp.archived_at IS NULL) THEN
          INSERT INTO public.seccion_profesor (universidad_id, seccion_id, usuario_id)
          VALUES (NEW.universidad_id, NEW.id, NEW.profesor_id);
        END IF;
        RETURN NULL;
      END
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_seccion_sincronizar_profesor
        AFTER INSERT OR UPDATE OF profesor_id ON seccion
        FOR EACH ROW EXECUTE FUNCTION public.sincronizar_seccion_profesor()
    `)
    for (const funcion of [
      'sincronizar_profesor_de_seccion',
      'sincronizar_seccion_profesor',
    ]) {
      await q.query(`REVOKE ALL ON FUNCTION public.${funcion}() FROM PUBLIC`)
    }
  }

  async down(q: QueryRunner): Promise<void> {
    // profesor_id quedó sincronizado con el primer profesor vigente: el
    // código anterior sigue con ese. Los co-profesores se pierden.
    await q.query('DROP TRIGGER tg_seccion_sincronizar_profesor ON seccion')
    await q.query('DROP FUNCTION public.sincronizar_seccion_profesor()')
    await q.query(
      'DROP TRIGGER tg_seccion_profesor_sincronizar ON seccion_profesor',
    )
    await q.query('DROP FUNCTION public.sincronizar_profesor_de_seccion()')
    await q.query(correccionAsistencia(CORRECCION_ANTERIOR))
    await politicasDelProfesor(q, PROFESOR_ANTERIOR)
    await q.query('DROP FUNCTION public.es_profesor_de_seccion(uuid, uuid)')
    // Al borrar la tabla se borran sus índices, triggers y políticas.
    await q.query('DROP TABLE seccion_profesor')
  }
}
