import type { ResumenUniversidad, Rol } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const UNIVERSIDADES = '/api/metricas/universidades'

const LISTA: ResumenUniversidad[] = [
  {
    id: 'u-sur',
    nombre: 'Universidad Demo Sur',
    periodo: { anio: 2026, semestre: 2 },
    aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
    promedio: { valor: null, alumnos: 0 },
    asistencia: { valor: null, presentes: 0, registros: 0 },
    alumnos: 0,
    cursos: 2,
  },
  {
    id: 'u-norte',
    nombre: 'Universidad Demo Norte',
    periodo: { anio: 2026, semestre: 2 },
    aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
    promedio: { valor: 4.5, alumnos: 2 },
    asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    alumnos: 1250,
    cursos: 17,
  },
]

const region = () => screen.findByRole('region', { name: 'Universidades' })
const filas = async () =>
  within(await screen.findByRole('table'))
    .getAllByRole('row')
    .slice(1)

describe('Universidades del Directorio', () => {
  test('ya no queda en blanco: muestra la tabla con indicadores y alumnos', async () => {
    await renderConSesion('DIRECTOR', '/universidades', {
      [UNIVERSIDADES]: () => LISTA,
    })
    const pagina = within(await region())
    // El título es el h1 del encabezado de la app.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Universidades' }),
    ).toBeInTheDocument()
    await pagina.findByRole('link', { name: 'Universidad Demo Norte' })
    expect(
      within(await screen.findByRole('table'))
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Universidad',
      'Aprobación',
      'Promedio',
      'Asistencia',
      'Alumnos',
      'Detalle',
    ])
    const [sur, norte] = await filas()
    expect(
      within(norte)
        .getAllByRole('cell')
        .slice(1, 5)
        .map((c) => c.textContent),
    ).toEqual(['50,0 %', '4,50', '66,67 %', '1.250'])
    // Sin datos: un guion que lo explica, no un 0.
    expect(within(sur).getAllByText('Sin datos suficientes')).toHaveLength(3)
    // Los números van a la derecha, con cifras de ancho fijo.
    expect(within(norte).getAllByRole('cell')[1]).toHaveClass(
      'text-right',
      'tabular-nums',
    )
  })

  test('el nombre lleva al detalle de la universidad en Indicadores, con el período', async () => {
    await renderConSesion('DIRECTOR', '/universidades?periodo=2026-1', {
      [UNIVERSIDADES]: () => LISTA,
    })
    expect(
      await screen.findByRole('link', { name: 'Universidad Demo Norte' }),
    ).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-norte?periodo=2026-1',
    )
  })

  test('se ordena por cualquier indicador con aria-sort', async () => {
    await renderConSesion('DIRECTOR', '/universidades', {
      [UNIVERSIDADES]: () => LISTA,
    })
    await screen.findByRole('link', { name: 'Universidad Demo Norte' })
    fireEvent.click(screen.getByRole('button', { name: 'Alumnos' }))
    expect(
      screen.getByRole('columnheader', { name: 'Alumnos' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    expect((await filas())[0]).toHaveTextContent('Universidad Demo Sur')
    fireEvent.click(screen.getByRole('button', { name: 'Alumnos' }))
    expect((await filas())[0]).toHaveTextContent('Universidad Demo Norte')
  })

  test('sin universidades muestra el estado vacío', async () => {
    await renderConSesion('DIRECTOR', '/universidades', {
      [UNIVERSIDADES]: () => [],
    })
    expect(
      await screen.findByText('No hay universidades en el Directorio.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('si la API falla, avisa y reintenta', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/universidades', {
      [UNIVERSIDADES]: () => (intentos++ === 0 ? json({}, 500) : LISTA),
    })
    expect(
      await screen.findByText('No pudimos cargar las universidades.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('link', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
  })

  test('mientras carga muestra esqueletos y lo anuncia', async () => {
    await renderConSesion('DIRECTOR', '/universidades', {
      [UNIVERSIDADES]: () => new Promise(() => {}),
    })
    expect(
      await within(await region()).findByText('Cargando universidades…'),
    ).toBeInTheDocument()
  })

  test.each<Rol>(['ADMINISTRATIVO', 'PROFESOR', 'ALUMNO'])(
    '%s no ve Universidades',
    async (rol) => {
      const pedida = vi.fn(() => LISTA)
      const menu = await renderConSesion(rol, '/universidades', {
        [UNIVERSIDADES]: pedida,
      })
      expect(
        within(menu).queryByRole('link', { name: 'Universidades' }),
      ).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )
})
