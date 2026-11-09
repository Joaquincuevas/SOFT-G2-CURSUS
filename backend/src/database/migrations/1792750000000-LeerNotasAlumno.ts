import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-13 (RE-02): el alumno lee sus notas publicadas. CrearNota dejó al
// alumno sin ninguna fila de nota porque no había cómo saber quién era el
// usuario de la sesión; usuario_actual() (AprobarNotas) lo resuelve. La API
// lo fija con fijarUsuario solo en la transacción de mis-notas: si no lo
// fija, el alumno sigue sin ver nada. Las propuestas (borrador, en revisión
// o devueltas), las archivadas y las de otros alumnos nunca son visibles.
// Es permisiva: se suma con OR a pol_nota_lectura, que no cambia.
export class LeerNotasAlumno1792750000000 implements MigrationInterface {
  name = 'LeerNotasAlumno1792750000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE POLICY pol_nota_lectura_alumno ON nota FOR SELECT TO cursus_app
        USING (universidad_id = universidad_actual()
               AND rol_actual() = 'ALUMNO'
               AND estado = 'PUBLICADA'
               AND archived_at IS NULL
               AND alumno_id = usuario_actual())`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP POLICY pol_nota_lectura_alumno ON nota`)
  }
}
