import { NotFoundException } from '@nestjs/common'
import { BaseDeDatos, ROL_APP } from './base-de-datos.service.js'

const UNIVERSIDAD = '00000000-0000-0000-0000-000000000001'

// Sin base real: la transacción entrega una conexión falsa para revisar qué
// llega a la base y en qué orden. La última consulta devuelve `filas`.
function crearBaseDeDatos(filas: unknown[] = []) {
  const bd = new BaseDeDatos()
  const consultas = vi.fn((sql: string) =>
    Promise.resolve(
      sql.startsWith('SET') || sql.includes('set_config') ? [] : filas,
    ),
  )
  vi.spyOn(bd, 'enTransaccion').mockImplementation((tarea) =>
    tarea({ query: consultas as BaseDeDatos['query'] }),
  )
  const query = vi.spyOn(bd, 'query')
  return { bd, consultas, query }
}

describe('BaseDeDatos.consultarEnUniversidad', () => {
  const sql = 'SELECT * FROM facultad WHERE universidad_id = $1 AND id = $2'

  it('agrega la universidad como $1, antes de los demás parámetros', async () => {
    const { bd, consultas } = crearBaseDeDatos()

    await bd.consultarEnUniversidad(UNIVERSIDAD, sql, ['facultad'])

    expect(consultas).toHaveBeenLastCalledWith(sql, [UNIVERSIDAD, 'facultad'])
  })

  it('fija el rol de la API y la universidad antes de la consulta (RLS)', async () => {
    const { bd, consultas, query } = crearBaseDeDatos()

    await bd.consultarEnUniversidad(UNIVERSIDAD, sql, ['facultad'])

    expect(consultas.mock.calls).toEqual([
      [`SET LOCAL ROLE ${ROL_APP}`],
      [`SELECT set_config('app.universidad_id', $1, true)`, [UNIVERSIDAD]],
      [sql, [UNIVERSIDAD, 'facultad']],
    ])
    // Nada pasa por la conexión sin transacción.
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    ['sin parámetros', 'SELECT * FROM facultad'],
    ['solo con $10', 'SELECT * FROM facultad WHERE id = $10'],
  ])('rechaza una consulta que no usa $1 (%s)', async (_caso, sinFiltro) => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(
      bd.consultarEnUniversidad(UNIVERSIDAD, sinFiltro),
    ).rejects.toThrow('La consulta no filtra por universidad ($1)')
    expect(consultas).not.toHaveBeenCalled()
  })

  it('rechaza una consulta sin universidad', async () => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(
      bd.consultarEnUniversidad('', 'SELECT 1 WHERE $1 IS NOT NULL'),
    ).rejects.toThrow('Falta la universidad de la sesión')
    expect(consultas).not.toHaveBeenCalled()
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
