import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CodigoCursoUnicoNormalizado1792460000000 implements MigrationInterface {
  name = 'CodigoCursoUnicoNormalizado1792460000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // RN-04 (GES-06): uq_curso_codigo_periodo distingue mayúsculas y espacios,
    // y solo la API los normaliza. Este índice compara el código como lo guarda
    // CrearCursoDto, así que también protege escrituras que no pasan por la API
    // y la edición de cursos. Incluye archivados, como la restricción original.
    // Si existen duplicados previos, falla sin modificar ni eliminar cursos.
    await queryRunner.query(`CREATE UNIQUE INDEX ux_curso_periodo_codigo_normalizado
      ON curso (periodo_id, upper(btrim(codigo)))`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX ux_curso_periodo_codigo_normalizado`)
  }
}
