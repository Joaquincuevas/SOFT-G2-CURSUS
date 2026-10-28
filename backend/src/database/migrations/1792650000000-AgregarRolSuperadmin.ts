import type { MigrationInterface, QueryRunner } from 'typeorm'

// MT-04 (ADR 0002): rol del superadmin, que administra la plataforma y trabaja
// en cualquier universidad. Va solo en esta migración: PostgreSQL no deja usar
// un valor nuevo de un enum en la misma transacción que lo agrega, y cada
// migración corre en su propia transacción (migrationsTransactionMode 'each').
export class AgregarRolSuperadmin1792650000000 implements MigrationInterface {
  name = 'AgregarRolSuperadmin1792650000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'SUPERADMIN'`)
  }

  async down(): Promise<void> {
    // PostgreSQL no permite quitar un valor de un enum: al revertir, el valor
    // queda sin uso (la API no crea usuarios con este rol).
  }
}
