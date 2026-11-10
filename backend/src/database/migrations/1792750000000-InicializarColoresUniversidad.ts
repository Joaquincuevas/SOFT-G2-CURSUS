import { createHash } from 'node:crypto'
import type { MigrationInterface, QueryRunner } from 'typeorm'

// UI-04. GES-23 dejó todas las universidades existentes con el azul de
// CURSUS. Inicializa colores distintos solo en esas filas; conserva los que
// ya personalizó el superadmin. El orden por dominio es estable.
const COLOR_CURSUS = '#1b4f72'
const PALETA = [
  '#1b4f72',
  '#0a5c36',
  '#6b2d84',
  '#8b2635',
  '#005b66',
  '#7a4700',
]

export class InicializarColoresUniversidad1792750000000 implements MigrationInterface {
  name = 'InicializarColoresUniversidad1792750000000'

  async up(q: QueryRunner): Promise<void> {
    const universidades = (await q.query(
      'SELECT id, color FROM universidad ORDER BY dominio_correo, id',
    )) as { id: string; color: string }[]
    const usados = new Set(
      universidades.filter((u) => u.color !== COLOR_CURSUS).map((u) => u.color),
    )
    let indice = 0
    for (const universidad of universidades) {
      if (universidad.color !== COLOR_CURSUS) continue
      let color: string
      do {
        // Si hay más universidades que tonos en la paleta, genera otro tono
        // oscuro: sus canales 32..111 garantizan contraste AA en los fondos
        // claros. También evita repetir los colores ya personalizados.
        const hash = createHash('sha256')
          .update(`${universidad.id}:${indice}`)
          .digest()
        color =
          PALETA[indice++] ??
          `#${Array.from(hash.subarray(0, 3), (canal) =>
            (32 + (canal % 80)).toString(16).padStart(2, '0'),
          ).join('')}`
      } while (usados.has(color))
      usados.add(color)
      await q.query('UPDATE universidad SET color = $2 WHERE id = $1', [
        universidad.id,
        color,
      ])
    }
  }

  async down(): Promise<void> {
    // Solo inicializa datos, sin cambiar el esquema. No se revierten colores:
    // podrían haber sido elegidos de nuevo por el superadmin tras el despliegue.
  }
}
