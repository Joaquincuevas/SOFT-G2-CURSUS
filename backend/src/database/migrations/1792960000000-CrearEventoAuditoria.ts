import type { MigrationInterface, QueryRunner } from 'typeorm'

// SEG-04: registro de solo adición de los inicios de sesión y de las acciones
// sensibles (cambios de notas, asignaciones y cierres de curso). SEG-05 lo
// consulta con los filtros usuario, universidad, tipo y rango de fechas,
// paginado del más reciente al más antiguo: los índices van en ese orden
// (fecha DESC, id DESC) y sirven de paginación por cursor.
//
// - Nadie escribe la tabla directamente: la app solo la lee. Escriben dos
//   rutas SECURITY DEFINER (como superadmin_cambio): registrar_inicio_sesion
//   para el login, que ocurre sin sesión ni universidad, y un trigger sobre las
//   tablas de historial que ya existen, para no repetir código en cada
//   servicio ni duplicar los datos.
// - Privacidad: no guarda contraseñas, tokens, hashes ni el correo digitado
//   (la gente pega la contraseña en ese campo). El login resuelve la cuenta
//   dentro de la función y solo conserva su id; si no existe, el evento no
//   lleva usuario. El detalle admite solo cuatro claves, sin valores de notas.
// - Un fallo al registrar nunca debe tumbar la operación de negocio: el
//   trigger lo captura y lo deja como WARNING en el log de PostgreSQL.
//
// No lleva tg_evento_auditoria_auditar_superadmin: como curso_cambio,
// nota_cambio o superadmin_cambio, es una auditoría, y el contrato de
// test/multitenant/rls las exceptúa por nombre.
const ROL_APP = 'cursus_app'

export class CrearEventoAuditoria1792960000000 implements MigrationInterface {
  name = 'CrearEventoAuditoria1792960000000'

  async up(q: QueryRunner): Promise<void> {
    // usuario_id y universidad_id son opcionales a la vez: un fallo sin cuenta
    // no lleva ninguno, y el superadmin no tiene universidad. Con MATCH SIMPLE
    // la FK compuesta no se revisa si falta una de las dos columnas, así que la
    // FK simple a usuario asegura que el usuario exista en cualquier caso y la
    // compuesta, que sea de esa universidad cuando hay ambas.
    await q.query(`
      CREATE TABLE evento_auditoria (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tipo text NOT NULL,
        resultado text NOT NULL,
        usuario_id uuid,
        universidad_id uuid,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        ip inet,
        detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT pk_evento_auditoria PRIMARY KEY (id),
        CONSTRAINT fk_evento_auditoria_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuario (id) ON DELETE RESTRICT,
        CONSTRAINT fk_evento_auditoria_usuario_universidad
          FOREIGN KEY (usuario_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_evento_auditoria_universidad FOREIGN KEY (universidad_id)
          REFERENCES universidad (id) ON DELETE RESTRICT,
        CONSTRAINT ck_evento_auditoria_tipo CHECK (
          tipo IN ('INICIO_SESION', 'CAMBIO_NOTA', 'ASIGNACION', 'CIERRE_CURSO')
        ),
        CONSTRAINT ck_evento_auditoria_resultado CHECK (
          resultado IN ('EXITOSO', 'FALLIDO', 'BLOQUEADO')
        ),
        -- Solo el inicio de sesión puede fallar o bloquearse; una acción
        -- sensible se registra cuando ocurrió, con su autor y su universidad.
        CONSTRAINT ck_evento_auditoria_accion CHECK (
          tipo = 'INICIO_SESION'
          OR (resultado = 'EXITOSO' AND usuario_id IS NOT NULL
              AND universidad_id IS NOT NULL)
        ),
        CONSTRAINT ck_evento_auditoria_login_exitoso CHECK (
          tipo <> 'INICIO_SESION' OR resultado <> 'EXITOSO'
          OR usuario_id IS NOT NULL
        ),
        -- Un objeto con claves conocidas: nada más cabe en el detalle.
        CONSTRAINT ck_evento_auditoria_detalle CHECK (
          jsonb_typeof(detalle) = 'object'
          AND detalle - ARRAY['credencialProvisoria', 'subtipo', 'origen', 'origenId']
              = '{}'::jsonb
        )
      )
    `)
    // Los cuatro filtros de SEG-05 (sin filtro, por universidad, por usuario y
    // por tipo), cada uno con el orden de la lista. Los de usuario y
    // universidad cubren además sus FK.
    await q.query(`
      CREATE INDEX ix_evento_auditoria_fecha ON evento_auditoria (fecha DESC, id DESC);
      CREATE INDEX ix_evento_auditoria_universidad
        ON evento_auditoria (universidad_id, fecha DESC, id DESC);
      CREATE INDEX ix_evento_auditoria_usuario
        ON evento_auditoria (usuario_id, fecha DESC, id DESC);
      CREATE INDEX ix_evento_auditoria_tipo
        ON evento_auditoria (tipo, fecha DESC, id DESC);
    `)

    // Defensa adicional, como en superadmin_cambio: ni el dueño de la tabla
    // modifica ni borra un registro. TRUNCATE no se bloquea con un trigger
    // (la app no tiene ese privilegio, ver rls.db-spec) porque el reinicio de
    // las bases de prueba, TRUNCATE universidad CASCADE, también la alcanza.
    await q.query(`
      CREATE FUNCTION evento_auditoria_inmutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'evento_auditoria es de solo adición: no se puede %', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$;
      CREATE TRIGGER tg_evento_auditoria_inmutable
        BEFORE UPDATE OR DELETE ON evento_auditoria
        FOR EACH ROW EXECUTE FUNCTION evento_auditoria_inmutable();
    `)

    // La API solo lee, y solo el Director (SEG-05) y el superadmin. No tiene
    // INSERT, UPDATE ni DELETE: escriben las funciones de abajo.
    await q.query(`
      GRANT SELECT ON evento_auditoria TO ${ROL_APP};
      ALTER TABLE evento_auditoria ENABLE ROW LEVEL SECURITY;
      CREATE POLICY pol_evento_auditoria_lectura ON evento_auditoria
        FOR SELECT TO ${ROL_APP}
        USING (rol_actual() IN ('DIRECTOR', 'SUPERADMIN'));
    `)

    // El login ocurre antes de tener sesión. En un éxito la app pasa el id de
    // la cuenta que resolvió la autenticación (p_usuario): se registra esa, sin
    // volver a buscar por correo (una cuenta archivada entre medio, o una
    // normalización distinta, dejarían el éxito sin usuario). En un fallo la
    // función recibe lo digitado solo para resolver la cuenta, con la misma
    // regla que AuthService (correo sin espacios en los extremos y en
    // minúsculas, universidad por el dominio o superadmin, sin cuentas
    // archivadas), y nunca lo guarda. Una cuenta archivada o inexistente deja un
    // evento sin usuario: el log no distingue cuál es.
    await q.query(`
      CREATE FUNCTION public.registrar_inicio_sesion(
        p_correo text, p_ip inet, p_resultado text, p_usuario uuid DEFAULT NULL
      ) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE
        -- Como String.trim() de JS: quita todo espacio en blanco, no solo ' '.
        v_correo text := lower(regexp_replace(p_correo, '^\\s+|\\s+$', '', 'g'));
        v_usuario uuid;
        v_universidad uuid;
        v_provisoria boolean;
      BEGIN
        IF p_usuario IS NOT NULL THEN
          SELECT u.id, u.universidad_id, u.credencial_provisoria
            INTO v_usuario, v_universidad, v_provisoria
            FROM public.usuario u
           WHERE u.id = p_usuario;
        ELSE
          SELECT u.id, u.universidad_id, u.credencial_provisoria
            INTO v_usuario, v_universidad, v_provisoria
            FROM public.usuario u
            LEFT JOIN public.universidad un ON un.id = u.universidad_id
           WHERE lower(u.correo) = v_correo
             AND (un.dominio_correo = split_part(v_correo, '@', 2)
                  OR (u.universidad_id IS NULL AND u.rol = 'SUPERADMIN'))
             AND u.archived_at IS NULL AND un.archived_at IS NULL
           ORDER BY u.universidad_id NULLS LAST
           LIMIT 1;
        END IF;
        INSERT INTO public.evento_auditoria
          (tipo, resultado, usuario_id, universidad_id, ip, detalle)
        VALUES ('INICIO_SESION', p_resultado, v_usuario, v_universidad, p_ip,
                CASE WHEN p_resultado = 'EXITOSO' AND coalesce(v_provisoria, false)
                     THEN '{"credencialProvisoria": true}'::jsonb
                     ELSE '{}'::jsonb END);
      END;
      $$;
      REVOKE ALL ON FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid) TO ${ROL_APP};
    `)

    // Acciones sensibles, tomadas de las tablas de historial que ya existen.
    // De nota_cambio solo las que cambian lo que ve el alumno o el flujo de
    // publicación (aprobación, devolución y recorrección); la propuesta y el
    // envío son del borrador y quedan en nota_cambio. El detalle apunta a la
    // fila de origen; no copia notas, motivos ni nombres.
    await q.query(`
      CREATE FUNCTION public.registrar_evento_de_historial() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE
        v_tipo text;
        v_subtipo text;
      BEGIN
        IF TG_TABLE_NAME = 'nota_cambio' THEN
          IF NEW.tipo NOT IN ('APROBACION', 'DEVOLUCION', 'RECORRECCION') THEN
            RETURN NULL;
          END IF;
          v_tipo := 'CAMBIO_NOTA';
          v_subtipo := NEW.tipo;
        ELSIF TG_TABLE_NAME = 'asignacion_cambio' THEN
          v_tipo := 'ASIGNACION';
          v_subtipo := NEW.tipo;
        ELSE
          v_tipo := 'CIERRE_CURSO';
        END IF;
        BEGIN
          INSERT INTO public.evento_auditoria
            (tipo, resultado, usuario_id, universidad_id, fecha, detalle)
          VALUES (v_tipo, 'EXITOSO', NEW.responsable_id, NEW.universidad_id, NEW.fecha,
                  jsonb_strip_nulls(jsonb_build_object(
                    'subtipo', v_subtipo, 'origen', TG_TABLE_NAME, 'origenId', NEW.id)));
        EXCEPTION WHEN OTHERS THEN
          -- No tumba la operación de negocio; queda en el log del servidor.
          RAISE WARNING 'No se pudo registrar el evento % de %: % (%)',
            v_tipo, TG_TABLE_NAME, SQLERRM, SQLSTATE;
        END;
        RETURN NULL;
      END;
      $$;
      REVOKE ALL ON FUNCTION public.registrar_evento_de_historial() FROM PUBLIC;
      CREATE TRIGGER tg_nota_cambio_registrar_evento
        AFTER INSERT ON nota_cambio FOR EACH ROW
        EXECUTE FUNCTION public.registrar_evento_de_historial();
      CREATE TRIGGER tg_asignacion_cambio_registrar_evento
        AFTER INSERT ON asignacion_cambio FOR EACH ROW
        EXECUTE FUNCTION public.registrar_evento_de_historial();
      CREATE TRIGGER tg_cierre_curso_registrar_evento
        AFTER INSERT ON cierre_curso FOR EACH ROW
        EXECUTE FUNCTION public.registrar_evento_de_historial();
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Los eventos registrados se pierden; el historial de origen queda.
    await q.query(`
      DROP TRIGGER tg_cierre_curso_registrar_evento ON cierre_curso;
      DROP TRIGGER tg_asignacion_cambio_registrar_evento ON asignacion_cambio;
      DROP TRIGGER tg_nota_cambio_registrar_evento ON nota_cambio;
      DROP FUNCTION public.registrar_evento_de_historial();
      DROP FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid);
      DROP TABLE evento_auditoria;
      DROP FUNCTION evento_auditoria_inmutable();
    `)
  }
}
