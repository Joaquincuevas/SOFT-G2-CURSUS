import type { MigrationInterface, QueryRunner } from 'typeorm'

// PER-03. Marca las cuentas que todavía usan la contraseña provisoria que
// entregó el administrativo (GES-15, GES-16 y GES-21). Mientras esté en true,
// la API solo deja cambiarla. No se llama "password_..." porque password_hash
// debe ser la única columna de usuario con ese nombre (test de contraseñas).
// Con DEFAULT false las cuentas existentes no cambian, y el código anterior
// sigue funcionando si el deploy vuelve atrás.
export class AgregarCredencialProvisoria1792520000000 implements MigrationInterface {
  name = 'AgregarCredencialProvisoria1792520000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuario ADD COLUMN credencial_provisoria boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuario DROP COLUMN credencial_provisoria`,
    )
  }
}
