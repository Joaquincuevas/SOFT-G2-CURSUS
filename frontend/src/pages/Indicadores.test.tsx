import type {
  MetricasConsolidadas,
  MetricasUniversidad,
  ResumenUniversidad,
  Rol,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/metricas/consolidado'
const UNIVERSIDADES = '/api/metricas/universidades'
const FACULTADES = `${UNIVERSIDADES}/u-norte/facultades`

const SIN_INDICADORES = {
  aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
  promedio: { valor: null, alumnos: 0 },
  asistencia: { valor: null, presentes: 0, registros: 0 },
}
const LISTA: ResumenUniversidad[] = [
  {
    id: 'u-norte',
    nombre: 'Universidad Demo Norte',
    periodo: { anio: 2026, semestre: 2 },
    aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
    promedio: { valor: 4.5, alumnos: 2 },
    asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    alumnos: 40,
    cursos: 8,
  },
  {
    id: 'u-sur',
    nombre: 'Universidad Demo Sur',
    periodo: { anio: 2026, semestre: 2 },
    ...SIN_INDICADORES,
    alumnos: 0,
    cursos: 0,
  },
]
const DETALLE: MetricasUniversidad = {
  universidad: { id: 'u-norte', nombre: 'Universidad Demo Norte' },
  periodo: { anio: 2026, semestre: 2 },
  facultades: [
    {
      id: 'f-ing',
      nombre: 'Ingeniería',
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
      alumnos: 30,
      cursos: 5,
    },
    {
      id: 'f-cs',
      nombre: 'Ciencias',
      ...SIN_INDICADORES,
      alumnos: 0,
      cursos: 0,
    },
  ],
}

const METRICAS: MetricasConsolidadas = {
  periodos: [
    { universidad: 'Universidad Demo Norte', anio: 2026, semestre: 2 },
    { universidad: 'Universidad Demo Sur', anio: 2026, semestre: 2 },
  ],
  aprobacion: { valor: 66.7, aprobados: 2, evaluados: 3 },
  promedio: { valor: 4.57, alumnos: 3 },
  asistencia: { valor: 83.33, presentes: 5, registros: 6 },
  alumnos: 12,
  cursos: 4,
}

describe('Indicadores del Director (MET-01)', () => {
  test('muestra las tres tarjetas con valor, unidad y n', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
    })
    const tarjetas = within(
      await screen.findByRole('list', { name: 'Indicadores' }),
    )
    const aprobacion = within(
      tarjetas.getByRole('article', { name: 'Tasa de aprobación' }),
    )
    expect(aprobacion.getByText('66,7')).toBeInTheDocument()
    expect(aprobacion.getByText('%')).toBeInTheDocument()
    expect(
      aprobacion.getByText('2 de 3 alumnos con nota final'),
    ).toBeInTheDocument()
    const promedio = within(tarjetas.getByRole('article', { name: 'Promedio' }))
    expect(promedio.getByText('4,57')).toBeInTheDocument()
    expect(promedio.getByText('3 alumnos con nota final')).toBeInTheDocument()
    const asistencia = within(
      tarjetas.getByRole('article', { name: 'Asistencia' }),
    )
    expect(asistencia.getByText('83,33')).toBeInTheDocument()
    expect(
      asistencia.getByText('5 presentes de 6 registros'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('12 alumnos inscritos en 4 cursos del período activo.'),
    ).toBeInTheDocument()
    // MET-03: el período activo viene seleccionado y el selector es funcional.
    const periodo = screen.getByRole('combobox', { name: 'Período' })
    expect(periodo).not.toBeDisabled()
    expect(periodo).toHaveValue('2026-2')
  })

  test('un indicador sin denominador dice "Sin datos suficientes" en vez de 0', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [UNIVERSIDADES]: () => LISTA,
      [RUTA]: () => ({
        ...METRICAS,
        periodos: [METRICAS.periodos[0]],
        aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
        promedio: { valor: null, alumnos: 0 },
      }),
    })
    const tarjetas = within(
      await screen.findByRole('list', { name: 'Indicadores' }),
    )
    const aprobacion = within(
      tarjetas.getByRole('article', { name: 'Tasa de aprobación' }),
    )
    expect(aprobacion.getByText('Sin datos suficientes')).toBeInTheDocument()
    expect(aprobacion.queryByText('0')).toBeNull()
    expect(
      within(tarjetas.getByRole('article', { name: 'Promedio' })).getByText(
        'Sin datos suficientes',
      ),
    ).toBeInTheDocument()
    // La asistencia sí tiene datos.
    expect(
      within(tarjetas.getByRole('article', { name: 'Asistencia' })).getByText(
        '83,33',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue(
      '2026-2',
    )
  })

  test('si la API falla, avisa y permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/indicadores', {
      [UNIVERSIDADES]: () => LISTA,
      [RUTA]: () => (intentos++ === 0 ? json({}, 500) : METRICAS),
    })
    expect(
      await screen.findByText('No pudimos cargar los indicadores.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Indicadores' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('list', { name: 'Indicadores' }),
    ).toBeInTheDocument()
  })

  test.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO'])(
    '%s no ve Indicadores en el menú',
    async (rol) => {
      await renderConSesion(rol, '/')
      expect(screen.queryByRole('link', { name: 'Indicadores' })).toBeNull()
    },
  )
})

describe('drill-down de universidad a facultad (MET-04)', () => {
  test('la lista de universidades lleva a sus facultades con los tres indicadores', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
      [FACULTADES]: () => DETALLE,
    })
    const lista = within(
      await screen.findByRole('region', { name: 'Universidades' }),
    )
    // La región aparece mientras carga: se espera a que lleguen los datos.
    expect(
      await lista.findByText(
        /Aprobación: 50,0 % · Promedio: 4,50 · Asistencia: 66,67 %/,
      ),
    ).toBeInTheDocument()
    // Sur no tiene datos: se dice, no se muestra 0.
    expect(
      lista.getAllByText(/Aprobación: Sin datos suficientes/),
    ).toHaveLength(1)
    fireEvent.click(lista.getByRole('link', { name: 'Universidad Demo Norte' }))

    const facultades = within(
      await screen.findByRole('list', { name: 'Facultades' }),
    )
    const ingenieria = within(
      facultades.getByRole('article', { name: 'Ingeniería' }),
    )
    expect(ingenieria.getByText('50,0')).toBeInTheDocument()
    expect(ingenieria.getByText('4,50')).toBeInTheDocument()
    expect(ingenieria.getByText('66,67')).toBeInTheDocument()
    expect(
      ingenieria.getByText('30 alumnos inscritos en 5 cursos.'),
    ).toBeInTheDocument()
    // Una facultad sin datos dice "Sin datos suficientes" en las tres tarjetas.
    expect(
      within(
        facultades.getByRole('article', { name: 'Ciencias' }),
      ).getAllByText('Sin datos suficientes'),
    ).toHaveLength(3)
    expect(screen.getByRole('combobox', { name: 'Período' })).not.toBeDisabled()
  })

  // Los tres niveles piden el mismo período: el consolidado, la lista de
  // universidades y las facultades.
  const registrador = () => {
    const pedidas: string[] = []
    const registrar =
      (ruta: string, cuerpo: unknown) => (_: unknown, url?: string) => {
        pedidas.push(url ?? ruta)
        return cuerpo
      }
    return { pedidas, registrar }
  }

  test('el breadcrumb vuelve al consolidado con el mismo período', async () => {
    const { pedidas, registrar } = registrador()
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte?periodo=2026-1',
      {
        [RUTA]: registrar(RUTA, METRICAS),
        [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
        [FACULTADES]: registrar(FACULTADES, DETALLE),
      },
    )
    const migas = within(
      await screen.findByRole('navigation', { name: 'Ruta de navegación' }),
    )
    await waitFor(() =>
      expect(migas.getByText('Universidad Demo Norte')).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
    // En el detalle todavía no se pidió el consolidado.
    expect(pedidas).not.toContain(`${RUTA}?periodo=2026-1`)
    fireEvent.click(migas.getByRole('link', { name: 'Indicadores' }))
    expect(
      await screen.findByRole('list', { name: 'Indicadores' }),
    ).toBeInTheDocument()
    // Al volver, el consolidado y la lista piden 2026-1 y ninguno pide el
    // período activo (sin parámetro).
    expect(pedidas).toContain(`${RUTA}?periodo=2026-1`)
    expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=2026-1`)
    expect(pedidas).not.toContain(RUTA)
    expect(pedidas).not.toContain(UNIVERSIDADES)
    expect(
      screen.getByText('12 alumnos inscritos en 4 cursos del período 2026-1.'),
    ).toBeInTheDocument()
  })

  test('el período de la URL se pide en los tres niveles y se conserva al bajar', async () => {
    const { pedidas, registrar } = registrador()
    await renderConSesion('DIRECTOR', '/indicadores?periodo=2026-1', {
      [RUTA]: registrar(RUTA, METRICAS),
      [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
      [FACULTADES]: registrar(FACULTADES, DETALLE),
    })
    fireEvent.click(
      await screen.findByRole('link', { name: 'Universidad Demo Norte' }),
    )
    const migas = within(
      await screen.findByRole('navigation', { name: 'Ruta de navegación' }),
    )
    await screen.findByRole('list', { name: 'Facultades' })
    expect(pedidas).toContain(`${RUTA}?periodo=2026-1`)
    expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=2026-1`)
    expect(pedidas).toContain(`${FACULTADES}?periodo=2026-1`)
    // El enlace de vuelta conserva el período.
    expect(migas.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
  })

  test('cambiar el período actualiza los tres niveles y la URL', async () => {
    const { pedidas, registrar } = registrador()
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: registrar(RUTA, METRICAS),
      [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
      [FACULTADES]: registrar(FACULTADES, DETALLE),
    })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Período' }), {
      target: { value: '2026-1' },
    })
    await waitFor(() => {
      expect(pedidas).toContain(`${RUTA}?periodo=2026-1`)
      expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=2026-1`)
    })
    fireEvent.click(
      await screen.findByRole('link', { name: 'Universidad Demo Norte' }),
    )
    await screen.findByRole('list', { name: 'Facultades' })
    expect(pedidas).toContain(`${FACULTADES}?periodo=2026-1`)
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue(
      '2026-1',
    )
  })

  test('sin período en la URL, los tres niveles piden el activo', async () => {
    const { pedidas, registrar } = registrador()
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: registrar(RUTA, METRICAS),
      [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
    })
    await screen.findByRole('list', { name: 'Indicadores' })
    expect(pedidas).toContain(RUTA)
    expect(pedidas).toContain(UNIVERSIDADES)
    expect(pedidas.some((u) => u.includes('periodo='))).toBe(false)
  })

  // El 400 del período no es "la universidad no existe": se dice qué falló y
  // no se pide nada a la API.
  test.each([
    ['/indicadores?periodo=activo', 'consolidado'],
    ['/indicadores/universidades/u-norte?periodo=activo', 'facultades'],
  ])('un período inválido (%s) tiene su propio mensaje', async (ruta) => {
    const pedida = vi.fn(() => DETALLE)
    await renderConSesion('DIRECTOR', ruta, {
      [RUTA]: pedida,
      [UNIVERSIDADES]: pedida,
      [FACULTADES]: pedida,
    })
    expect(
      await screen.findByText(/El período «activo» no es válido/),
    ).toBeInTheDocument()
    expect(screen.queryByText('La universidad no existe.')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Ver el período activo' }),
    ).toHaveAttribute('href', '/indicadores')
    expect(pedida).not.toHaveBeenCalled()
  })

  test('una universidad sin facultades lo dice', async () => {
    await renderConSesion('DIRECTOR', '/indicadores/universidades/u-norte', {
      [FACULTADES]: () => ({ ...DETALLE, facultades: [] }),
    })
    expect(
      await screen.findByText('Esta universidad no tiene facultades.'),
    ).toBeInTheDocument()
  })

  test('si la API falla, avisa y permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/indicadores/universidades/u-norte', {
      [FACULTADES]: () => (intentos++ === 0 ? json({}, 500) : DETALLE),
    })
    expect(
      await screen.findByText('No pudimos cargar las facultades.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('list', { name: 'Facultades' }),
    ).toBeInTheDocument()
  })

  test('una universidad inexistente (404) ofrece volver', async () => {
    await renderConSesion('DIRECTOR', '/indicadores/universidades/u-norte', {
      [FACULTADES]: () => json({ message: 'La universidad no existe' }, 404),
    })
    expect(
      await screen.findByText('La universidad no existe.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Volver a Indicadores' }),
    ).toHaveAttribute('href', '/indicadores')
  })

  // Solo el Director: otro rol que escribe la URL no llega a la vista ni la
  // pide a la API.
  test.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO'])(
    '%s no accede a las facultades por la URL',
    async (rol) => {
      const pedida = vi.fn(() => DETALLE)
      await renderConSesion(rol, '/indicadores/universidades/u-norte', {
        [FACULTADES]: pedida,
      })
      expect(
        screen.queryByRole('navigation', { name: 'Ruta de navegación' }),
      ).toBeNull()
      expect(screen.queryByRole('list', { name: 'Facultades' })).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )
})
