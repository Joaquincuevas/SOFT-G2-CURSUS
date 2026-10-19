import type { MigrationInterface, QueryRunner } from 'typeorm'

export class NombreCarreraUnicoNormalizado1792450000000 implements MigrationInterface {
  name = 'NombreCarreraUnicoNormalizado1792450000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Incluye archivadas, como la restricción original. Si existen duplicados
    // previos, falla sin modificar ni eliminar las carreras del cliente.
    await queryRunner.query(`CREATE UNIQUE INDEX ux_carrera_facultad_nombre_normalizado
      ON carrera (facultad_id, lower(btrim(regexp_replace(nombre, '[[:space:]]+', ' ', 'g'))))`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX ux_carrera_facultad_nombre_normalizado`)
  }
}
