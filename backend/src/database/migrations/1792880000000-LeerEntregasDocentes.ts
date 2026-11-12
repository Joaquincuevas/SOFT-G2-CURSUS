import type { MigrationInterface, QueryRunner } from 'typeorm'

// MAT-10: el profesor (GES-25) o el ayudante vigente de la sección de la
// actividad lee las entregas de sus alumnos. Con el rol de la sesión y el
// usuario fijado por la API (fijarUsuario); sin él, usuario_actual() es NULL y
// no se lee nada. pol_entrega_lectura del alumno no cambia. archivo no
// necesita otra política: pol_archivo_lectura ya deja leer a la universidad.
export class LeerEntregasDocentes1792880000000 implements MigrationInterface {
  name = 'LeerEntregasDocentes1792880000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE POLICY pol_entrega_lectura_docente ON entrega
      FOR SELECT TO cursus_app
      USING (universidad_id = universidad_actual()
        AND rol_actual() IN ('PROFESOR', 'AYUDANTE')
        AND EXISTS (SELECT 1 FROM actividad a
                     WHERE a.id = entrega.actividad_id
                       AND a.universidad_id = entrega.universidad_id
                       AND CASE rol_actual()
                         WHEN 'PROFESOR' THEN es_profesor_de_seccion(a.seccion_id, usuario_actual())
                         ELSE EXISTS (SELECT 1 FROM ayudante_seccion y
                                       WHERE y.seccion_id = a.seccion_id
                                         AND y.universidad_id = a.universidad_id
                                         AND y.usuario_id = usuario_actual()
                                         AND y.archived_at IS NULL)
                       END))`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP POLICY pol_entrega_lectura_docente ON entrega')
  }
}
