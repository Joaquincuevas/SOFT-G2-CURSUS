import type { MigrationInterface, QueryRunner } from 'typeorm'

// SEG-02. Dos cambios para pedir el código TOTP al iniciar sesión:
//
// 1. mfa_usuario.ultimo_paso: el último paso de 30 s cuyo código se aceptó
//    (al confirmar el MFA o al iniciar sesión). Un código solo vale si su paso
//    es mayor, así que el mismo código no se usa dos veces dentro de su
//    ventana (RFC 6238, 5.2). Va en la tabla del secreto, que el rol de la API
//    no puede leer ni escribir (SEG-01).
// 2. registrar_inicio_sesion (SEG-04) recibe un subtipo opcional: el paso del
//    código se registra como un INICIO_SESION con subtipo 'MFA' (detalle ya
//    admite esa clave), sin nuevo tipo de evento ni cambio en la tabla. Cambia
//    la firma, así que se reemplaza la función y se vuelven a dar sus permisos.
const ROL_APP = 'cursus_app'

export class AgregarUltimoPasoMfa1792980000000 implements MigrationInterface {
  name = 'AgregarUltimoPasoMfa1792980000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE mfa_usuario
        ADD COLUMN ultimo_paso integer,
        ADD CONSTRAINT ck_mfa_usuario_ultimo_paso CHECK (ultimo_paso >= 0)
    `)
    await q.query(`
      DROP FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid);
      CREATE FUNCTION public.registrar_inicio_sesion(
        p_correo text, p_ip inet, p_resultado text,
        p_usuario uuid DEFAULT NULL, p_subtipo text DEFAULT NULL
      ) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE
        v_correo text := lower(regexp_replace(p_correo, '^\\s+|\\s+$', '', 'g'));
        v_usuario uuid;
        v_universidad uuid;
        v_provisoria boolean;
        v_detalle jsonb := '{}'::jsonb;
      BEGIN
        IF p_subtipo IS NOT NULL AND p_subtipo <> 'MFA' THEN
          RAISE EXCEPTION 'subtipo de inicio de sesión desconocido'
            USING ERRCODE = 'check_violation';
        END IF;
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
        IF p_resultado = 'EXITOSO' AND coalesce(v_provisoria, false) THEN
          v_detalle := v_detalle || '{"credencialProvisoria": true}'::jsonb;
        END IF;
        IF p_subtipo IS NOT NULL THEN
          v_detalle := v_detalle || jsonb_build_object('subtipo', p_subtipo);
        END IF;
        INSERT INTO public.evento_auditoria
          (tipo, resultado, usuario_id, universidad_id, ip, detalle)
        VALUES ('INICIO_SESION', p_resultado, v_usuario, v_universidad, p_ip, v_detalle);
      END;
      $$;
      REVOKE ALL ON FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid, text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid, text) TO ${ROL_APP};
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Vuelve a la función de SEG-04 (cuatro parámetros). Los pasos ya usados
    // se pierden; los eventos con subtipo MFA quedan en el registro.
    await q.query(`
      DROP FUNCTION public.registrar_inicio_sesion(text, inet, text, uuid, text);
      CREATE FUNCTION public.registrar_inicio_sesion(
        p_correo text, p_ip inet, p_resultado text, p_usuario uuid DEFAULT NULL
      ) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
      DECLARE
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
    await q.query(`
      ALTER TABLE mfa_usuario
        DROP CONSTRAINT ck_mfa_usuario_ultimo_paso,
        DROP COLUMN ultimo_paso
    `)
  }
}
