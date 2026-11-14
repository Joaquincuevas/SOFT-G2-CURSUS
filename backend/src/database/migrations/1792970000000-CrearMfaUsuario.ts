import type { MigrationInterface, QueryRunner } from 'typeorm'

// SEG-01. Secreto TOTP de cada usuario que activa la verificación en dos
// pasos. Mientras activado_en es NULL, el secreto está pendiente: el usuario
// ya vio el QR pero no confirmó un código; si genera otro QR, se reemplaza.
//
// Va en una tabla propia y no en usuario: la auditoría del superadmin
// (superadmin_cambio) copia la fila completa de usuario, y el secreto no debe
// quedar en ninguna otra parte. Como sesion_auth y refresh_token, es una
// credencial y no un dato institucional: no tiene universidad_id ni RLS, y el
// rol de la API no tiene permisos sobre ella. La usa solo el servicio de MFA,
// con la conexión del backend y siempre filtrando por el id del JWT.
//
// El CHECK exige el formato cifrado (v1.<iv>.<tag>.<cifrado>): un secreto en
// base32 en claro, que nunca lleva puntos, se rechaza en la base.
export class CrearMfaUsuario1792970000000 implements MigrationInterface {
  name = 'CrearMfaUsuario1792970000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mfa_usuario (
        usuario_id uuid PRIMARY KEY REFERENCES usuario(id),
        secreto_cifrado text NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        activado_en timestamptz,
        CONSTRAINT ck_mfa_usuario_secreto_cifrado CHECK (
          secreto_cifrado ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'
        )
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mfa_usuario`)
  }
}
