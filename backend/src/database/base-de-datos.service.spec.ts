import { NotFoundException } from '@nestjs/common'
import { BaseDeDatos } from './base-de-datos.service.js'

const UNIVERSIDAD = '00000000-0000-0000-0000-000000000001'

// Sin base real: se reemplaza query para revisar qué llega a la base.
function crearBaseDeDatos(filas: unknown[] = []) {
  const bd = new BaseDeDatos()
  const query = vi.spyOn(bd, 'query').mockResolvedValue(filas)
  return { bd, query }
}

describe('BaseDeDatos.consultarEnUniversidad', () => {
  it('agrega la universidad como $1, antes de los demás parámetros', async () => {
    const { bd, query } = crearBaseDeDatos()
    const sql = 'SELECT * FROM facultad WHERE universidad_id = $1 AND id = $2'

    await bd.consultarEnUniversidad(UNIVERSIDAD, sql, ['facultad'])

    expect(query).toHaveBeenCalledWith(sql, [UNIVERSIDAD, 'facultad'])
  })

  it.each([
    ['sin parámetros', 'SELECT * FROM facultad'],
    ['solo con $10', 'SELECT * FROM facultad WHERE id = $10'],
  ])('rechaza una consulta que no usa $1 (%s)', async (_caso, sql) => {
    const { bd, query } = crearBaseDeDatos()

    await expect(bd.consultarEnUniversidad(UNIVERSIDAD, sql)).rejects.toThrow(
      'La consulta no filtra por universidad ($1)',
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('rechaza una consulta sin universidad', async () => {
    const { bd, query } = crearBaseDeDatos()

    await expect(
      bd.consultarEnUniversidad('', 'SELECT 1 WHERE $1 IS NOT NULL'),
    ).rejects.toThrow('Falta la universidad de la sesión')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('BaseDeDatos.obtenerEnUniversidad', () => {
  const sql = 'SELECT * FROM facultad WHERE universidad_id = $1 AND id = $2'

  it('devuelve la fila encontrada', async () => {
    const { bd } = crearBaseDeDatos([{ id: 'facultad' }])

    await expect(
      bd.obtenerEnUniversidad(UNIVERSIDAD, sql, ['facultad']),
    ).resolves.toEqual({ id: 'facultad' })
  })

  it('responde 404 si no hay fila en la universidad de la sesión', async () => {
    const { bd } = crearBaseDeDatos([])

    await expect(
      bd.obtenerEnUniversidad(UNIVERSIDAD, sql, ['facultad']),
    ).rejects.toThrow(NotFoundException)
  })
})
