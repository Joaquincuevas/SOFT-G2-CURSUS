import type { Rol } from '@cursus/shared'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  fijarMotivo,
  ROL_APP,
} from './base-de-datos.service.js'

const UNIVERSIDAD = '00000000-0000-0000-0000-000000000001'
const SUPERADMIN = '00000000-0000-0000-0000-000000000002'
const FACULTAD = '00000000-0000-0000-0000-000000000003'
const contexto = (rol: Rol = 'PROFESOR'): ContextoUniversidad => ({
  universidadId: UNIVERSIDAD,
  rol,
})

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

    await bd.consultarEnUniversidad(contexto(), sql, ['facultad'])

    expect(consultas).toHaveBeenLastCalledWith(sql, [UNIVERSIDAD, 'facultad'])
  })

  it('fija el rol de la API, la universidad y el rol de la sesión antes de la consulta (RLS)', async () => {
    const { bd, consultas, query } = crearBaseDeDatos()

    await bd.consultarEnUniversidad(contexto('ALUMNO'), sql, ['facultad'])

    expect(consultas.mock.calls).toEqual([
      [`SET LOCAL ROLE ${ROL_APP}`],
      // Sin superadmin, app.superadmin_id y app.facultad_id quedan vacíos.
      [expect.stringContaining('set_config'), [UNIVERSIDAD, 'ALUMNO', '', '']],
      [sql, [UNIVERSIDAD, 'facultad']],
    ])
    // Nada pasa por la conexión sin transacción.
    expect(query).not.toHaveBeenCalled()
  })

  it('con un superadmin fija también su id y la facultad que eligió (MT-04)', async () => {
    const { bd, consultas } = crearBaseDeDatos()

    await bd.consultarEnUniversidad(
      {
        universidadId: UNIVERSIDAD,
        rol: 'ADMINISTRATIVO',
        superadmin: { id: SUPERADMIN, facultadId: FACULTAD },
      },
      sql,
      ['facultad'],
    )

    expect(consultas.mock.calls[1]).toEqual([
      expect.stringContaining("set_config('app.superadmin_id', $3, true)"),
      [UNIVERSIDAD, 'ADMINISTRATIVO', SUPERADMIN, FACULTAD],
    ])
  })

  it.each([
    ['sin parámetros', 'SELECT * FROM facultad'],
    ['solo con $10', 'SELECT * FROM facultad WHERE id = $10'],
  ])('rechaza una consulta que no usa $1 (%s)', async (_caso, sinFiltro) => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(
      bd.consultarEnUniversidad(contexto(), sinFiltro),
    ).rejects.toThrow('La consulta no filtra por universidad ($1)')
    expect(consultas).not.toHaveBeenCalled()
  })

  it('rechaza una consulta sin universidad', async () => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(
      bd.consultarEnUniversidad(
        { universidadId: '', rol: 'ALUMNO' },
        'SELECT 1 WHERE $1 IS NOT NULL',
      ),
    ).rejects.toThrow('Falta la universidad de la sesión')
    expect(consultas).not.toHaveBeenCalled()
  })
})

describe('BaseDeDatos.consultarEnTodasLasUniversidades', () => {
  const sql = 'SELECT * FROM facultad'

  it('corre en una transacción de solo lectura con el rol de Director', async () => {
    const { bd, consultas, query } = crearBaseDeDatos([{ id: 'facultad' }])

    await expect(
      bd.consultarEnTodasLasUniversidades(contexto('DIRECTOR'), sql),
    ).resolves.toEqual([{ id: 'facultad' }])

    expect(consultas.mock.calls).toEqual([
      ['SET TRANSACTION READ ONLY'],
      [`SET LOCAL ROLE ${ROL_APP}`],
      [expect.stringContaining("set_config('app.rol'"), ['DIRECTOR']],
      [sql, []],
    ])
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ] as const)('responde 403 al rol %s', async (rol) => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(
      bd.consultarEnTodasLasUniversidades(contexto(rol), sql),
    ).rejects.toThrow(ForbiddenException)
    expect(consultas).not.toHaveBeenCalled()
  })
})

describe('BaseDeDatos.consultarComoSuperadmin (MT-04)', () => {
  const sql = 'SELECT * FROM universidad'

  it('corre en una transacción de solo lectura con el rol de superadmin', async () => {
    const { bd, consultas, query } = crearBaseDeDatos([{ id: 'universidad' }])

    await expect(
      bd.consultarComoSuperadmin('SUPERADMIN', sql),
    ).resolves.toEqual([{ id: 'universidad' }])

    expect(consultas.mock.calls).toEqual([
      ['SET TRANSACTION READ ONLY'],
      [`SET LOCAL ROLE ${ROL_APP}`],
      [expect.stringContaining("set_config('app.rol'"), ['SUPERADMIN']],
      [sql, []],
    ])
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    'DIRECTOR',
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    undefined,
  ] as const)('responde 403 al rol %s', async (rol) => {
    const { bd, consultas } = crearBaseDeDatos()

    await expect(bd.consultarComoSuperadmin(rol, sql)).rejects.toThrow(
      ForbiddenException,
    )
    expect(consultas).not.toHaveBeenCalled()
  })
})

describe('fijarMotivo (MT-04)', () => {
  it('fija app.motivo solo para la transacción', async () => {
    const consultas = vi.fn(() => Promise.resolve([]))

    await fijarMotivo({ query: consultas }, 'Error')

    expect(consultas).toHaveBeenCalledWith(
      `SELECT set_config('app.motivo', $1, true)`,
      ['Error'],
    )
  })
})

describe('BaseDeDatos.obtenerEnUniversidad', () => {
  const sql = 'SELECT * FROM facultad WHERE universidad_id = $1 AND id = $2'

  it('devuelve la fila encontrada', async () => {
    const { bd } = crearBaseDeDatos([{ id: 'facultad' }])

    await expect(
      bd.obtenerEnUniversidad(contexto(), sql, ['facultad']),
    ).resolves.toEqual({ id: 'facultad' })
  })

  it('responde 404 si no hay fila en la universidad de la sesión', async () => {
    const { bd } = crearBaseDeDatos([])

    await expect(
      bd.obtenerEnUniversidad(contexto(), sql, ['facultad']),
    ).rejects.toThrow(NotFoundException)
  })
})
