import type {
  MetricasConsolidadas,
  MetricasFacultad,
  MetricasUniversidad,
  ResumenUniversidad,
  Rol,
} from '@cursus/shared'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/metricas/consolidado'
const UNIVERSIDADES = '/api/metricas/universidades'
const FACULTADES = `${UNIVERSIDADES}/u-norte/facultades`
const CARRERAS_RUTA = '/api/metricas/facultades/f-ing/carreras'

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
const CARRERAS: MetricasFacultad = {
  universidad: { id: 'u-norte', nombre: 'Universidad Demo Norte' },
  facultad: { id: 'f-ing', nombre: 'Ingeniería' },
  periodo: { anio: 2026, semestre: 2 },
  carreras: [
    {
      id: 'c-ing',
      nombre: 'Ingeniería Civil',
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    },
    {
      id: 'c-vacia',
      nombre: 'Carrera sin datos',
      aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
      promedio: { valor: null, alumnos: 0 },
      asistencia: { valor: null, presentes: 0, registros: 0 },
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
    // Por defecto no es un semestre: es el activo de cada universidad.
    expect(periodo).toHaveValue('')
    expect(
      within(periodo).getByRole('option', {
        name: 'Período activo de cada universidad',
        selected: true,
      }),
    ).toBeInTheDocument()
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
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue('')
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

  test('una facultad abre sus carreras y conserva período y breadcrumb', async () => {
    const pedidas: string[] = []
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte?periodo=2026-1',
      {
        [FACULTADES]: () => DETALLE,
        [CARRERAS_RUTA]: (_init, url) => {
          pedidas.push(url ?? '')
          return CARRERAS
        },
      },
    )
    fireEvent.click(await screen.findByRole('link', { name: 'Ingeniería' }))
    expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
    expect(screen.getByText('Carrera sin datos')).toBeInTheDocument()
    expect(screen.getAllByText('Sin datos suficientes')).toHaveLength(3)
    expect(pedidas).toContain(`${CARRERAS_RUTA}?periodo=2026-1`)
    const migas = within(
      screen.getByRole('navigation', { name: 'Ruta de navegación' }),
    )
    expect(migas.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
    expect(
      migas.getByRole('link', { name: 'Universidad Demo Norte' }),
    ).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-norte?periodo=2026-1',
    )
  })

  // Un enlace directo puede traer la universidad de la URL distinta a la de la
  // facultad: el breadcrumb vuelve a la universidad que muestra, la de la API.
  test('el breadcrumb vuelve a la universidad de la facultad y no a la de la URL', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-sur?periodo=2026-1',
      {
        '/api/metricas/facultades/f-sur/carreras': () => ({
          ...CARRERAS,
          universidad: { id: 'u-sur', nombre: 'Universidad Demo Sur' },
          facultad: { id: 'f-sur', nombre: 'Facultad de Sur' },
        }),
      },
    )
    const migas = within(
      await screen.findByRole('navigation', { name: 'Ruta de navegación' }),
    )
    const enlace = await migas.findByRole('link', {
      name: 'Universidad Demo Sur',
    })
    expect(enlace).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur?periodo=2026-1',
    )
    expect(migas.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
  })

  test('carreras: vacío, error con reintento y facultad inexistente', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      {
        [CARRERAS_RUTA]: () => ({ ...CARRERAS, carreras: [] }),
      },
    )
    expect(
      await screen.findByText('Esta facultad no tiene carreras.'),
    ).toBeInTheDocument()

    cleanup()
    let intentos = 0
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      {
        [CARRERAS_RUTA]: () => (intentos++ === 0 ? json({}, 500) : CARRERAS),
      },
    )
    expect(
      await screen.findByText('No pudimos cargar las carreras.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()

    cleanup()
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      { [CARRERAS_RUTA]: () => json({}, 404) },
    )
    expect(
      await screen.findByText('La facultad no existe.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Volver a la universidad' }),
    ).toHaveAttribute('href', '/indicadores/universidades/u-norte')
  })

  test.each<Rol>(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s no accede a las carreras por URL',
    async (rol) => {
      const pedida = vi.fn(() => CARRERAS)
      await renderConSesion(
        rol,
        '/indicadores/universidades/u-norte/facultades/f-ing',
        { [CARRERAS_RUTA]: pedida },
      )
      expect(screen.queryByRole('list', { name: 'Carreras' })).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )

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

  // Norte tiene 2026-2 activo y Sur, 2026-1: la vista por defecto combina
  // ambos activos y no equivale a ningún semestre.
  test('la vista por defecto es el activo de cada universidad y se puede volver a ella', async () => {
    const { pedidas, registrar } = registrador()
    const DISTINTOS: MetricasConsolidadas = {
      ...METRICAS,
      periodos: [
        { universidad: 'Universidad Demo Norte', anio: 2026, semestre: 2 },
        { universidad: 'Universidad Demo Sur', anio: 2026, semestre: 1 },
      ],
    }
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: registrar(RUTA, DISTINTOS),
      [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
    })
    await screen.findByRole('list', { name: 'Indicadores' })
    const selector = screen.getByRole('combobox', { name: 'Período' })
    expect(selector).toHaveValue('')
    expect(
      within(selector)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Período activo de cada universidad', '2026-2', '2026-1'])
    expect(pedidas.some((u) => u.includes('periodo='))).toBe(false)

    fireEvent.change(selector, { target: { value: '2026-2' } })
    await waitFor(() => expect(pedidas).toContain(`${RUTA}?periodo=2026-2`))
    expect(selector).toHaveValue('2026-2')

    // La opción explícita quita ?periodo= y vuelve a pedir el activo de cada
    // universidad.
    pedidas.length = 0
    fireEvent.change(selector, { target: { value: '' } })
    await waitFor(() => expect(pedidas).toContain(RUTA))
    expect(pedidas).toContain(UNIVERSIDADES)
    expect(pedidas.some((u) => u.includes('periodo='))).toBe(false)
    expect(selector).toHaveValue('')
    expect(
      screen.getByRole('link', { name: 'Universidad Demo Norte' }),
    ).toHaveAttribute('href', '/indicadores/universidades/u-norte')
  })

  // Gestión admite años del 1 al 9999: 999-1 se escribe 0999-1, que es el que
  // la API y la pantalla aceptan.
  test('un período de tres dígitos se elige como 0999-1 y se consulta', async () => {
    const { pedidas, registrar } = registrador()
    await renderConSesion('DIRECTOR', '/indicadores', {
      '/api/metricas/periodos': () => [
        { anio: 2026, semestre: 2, activo: true },
        { anio: 999, semestre: 1, activo: false },
      ],
      [RUTA]: registrar(RUTA, METRICAS),
      [UNIVERSIDADES]: registrar(UNIVERSIDADES, LISTA),
    })
    await screen.findByRole('list', { name: 'Indicadores' })
    const selector = screen.getByRole('combobox', { name: 'Período' })
    expect(
      within(selector)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['', '2026-2', '0999-1'])
    fireEvent.change(selector, { target: { value: '0999-1' } })
    await waitFor(() => expect(pedidas).toContain(`${RUTA}?periodo=0999-1`))
    expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=0999-1`)
    // La pantalla lo acepta y muestra sus indicadores.
    expect(screen.queryByText(/no es válido/)).toBeNull()
    expect(
      await screen.findByRole('list', { name: 'Indicadores' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('12 alumnos inscritos en 4 cursos del período 0999-1.'),
    ).toBeInTheDocument()
  })
})

describe('comparación entre universidades (MET-02)', () => {
  const COMPARAR = '/indicadores/comparar'

  const celdas = (nombre: string) =>
    within(screen.getByRole('row', { name: new RegExp(nombre) }))
      .getAllByRole('cell')
      .map((c) => c.textContent)

  const relleno = (nombre: string) =>
    within(screen.getByRole('list', { name: /por universidad$/ }))
      .getByText(nombre)
      .closest('li')
      ?.querySelector('.indicadores__barra-relleno')

  test('muestra los tres indicadores de cada universidad lado a lado en una tabla', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => LISTA,
    })
    const tabla = await screen.findByRole('table', {
      name: 'Indicadores por universidad',
    })
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Universidad',
      'Período',
      'Tasa de aprobación',
      'Promedio',
      'Asistencia',
      'Alumnos',
    ])
    expect(celdas('Universidad Demo Norte')).toEqual([
      '2026-2',
      '50,0 %',
      '4,50',
      '66,67 %',
      '40',
    ])
    // Sur no tiene datos: se dice, no se muestra 0.
    expect(celdas('Universidad Demo Sur')).toEqual([
      '2026-2',
      'Sin datos suficientes',
      'Sin datos suficientes',
      'Sin datos suficientes',
      '0',
    ])
  })

  test('una universidad sin el período pedido lo indica en la tabla', async () => {
    await renderConSesion('DIRECTOR', `${COMPARAR}?periodo=2026-1`, {
      [UNIVERSIDADES]: () => [LISTA[0], { ...LISTA[1], periodo: null }],
    })
    await screen.findByRole('table', { name: 'Indicadores por universidad' })
    expect(celdas('Universidad Demo Sur')[0]).toBe('Sin período')
  })

  test('el gráfico muestra la tasa de aprobación y se puede elegir otro indicador', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => LISTA,
    })
    const selector = await screen.findByRole('combobox', {
      name: 'Indicador a graficar',
    })
    expect(selector).toHaveValue('aprobacion')
    const barras = within(
      screen.getByRole('list', { name: 'Tasa de aprobación por universidad' }),
    )
    expect(barras.getByText('50,0 %')).toBeInTheDocument()
    expect(relleno('Universidad Demo Norte')).toHaveStyle({ width: '50.00%' })
    // Sin datos: no hay barra, se dice.
    expect(relleno('Universidad Demo Sur')).toBeNull()
    expect(barras.getByText('Sin datos suficientes')).toBeInTheDocument()

    fireEvent.change(selector, { target: { value: 'promedio' } })
    const promedio = within(
      screen.getByRole('list', { name: 'Promedio por universidad' }),
    )
    expect(promedio.getByText('4,50')).toBeInTheDocument()
    // El promedio se dibuja sobre la escala 1,0 a 7,0: 4,5 es 3,5 / 6.
    expect(relleno('Universidad Demo Norte')).toHaveStyle({ width: '58.33%' })

    fireEvent.change(selector, { target: { value: 'asistencia' } })
    expect(
      within(
        screen.getByRole('list', { name: 'Asistencia por universidad' }),
      ).getByText('66,67 %'),
    ).toBeInTheDocument()
    expect(relleno('Universidad Demo Norte')).toHaveStyle({ width: '66.67%' })
  })

  test('se llega desde el consolidado conservando el período, y el breadcrumb vuelve', async () => {
    const pedidas: string[] = []
    await renderConSesion('DIRECTOR', '/indicadores?periodo=2026-1', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: (_, url) => {
        pedidas.push(url ?? UNIVERSIDADES)
        return LISTA
      },
    })
    const enlace = await screen.findByRole('link', {
      name: 'Comparar universidades',
    })
    expect(enlace).toHaveAttribute('href', `${COMPARAR}?periodo=2026-1`)
    fireEvent.click(enlace)
    await screen.findByRole('table', { name: 'Indicadores por universidad' })
    expect(pedidas.every((u) => u === `${UNIVERSIDADES}?periodo=2026-1`)).toBe(
      true,
    )
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue(
      '2026-1',
    )
    const migas = within(
      screen.getByRole('navigation', { name: 'Ruta de navegación' }),
    )
    expect(migas.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
  })

  test('cambiar el período vuelve a pedir la comparación', async () => {
    const pedidas: string[] = []
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: (_, url) => {
        pedidas.push(url ?? UNIVERSIDADES)
        return LISTA
      },
    })
    await screen.findByRole('table', { name: 'Indicadores por universidad' })
    expect(pedidas).toContain(UNIVERSIDADES)
    expect(pedidas.some((u) => u.includes('periodo='))).toBe(false)
    fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), {
      target: { value: '2026-1' },
    })
    await waitFor(() =>
      expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=2026-1`),
    )
  })

  test('un período inválido en la URL lo avisa y no pide nada', async () => {
    const pedida = vi.fn(() => LISTA)
    await renderConSesion('DIRECTOR', `${COMPARAR}?periodo=activo`, {
      [UNIVERSIDADES]: pedida,
    })
    expect(
      await screen.findByText(/El período «activo» no es válido/),
    ).toBeInTheDocument()
    expect(pedida).not.toHaveBeenCalled()
  })

  test('si la API falla, avisa y permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => (intentos++ === 0 ? json({}, 500) : LISTA),
    })
    expect(
      await screen.findByText('No pudimos cargar las universidades.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('table', { name: 'Indicadores por universidad' }),
    ).toBeInTheDocument()
  })

  test('sin universidades lo dice', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => [],
    })
    expect(await screen.findByText('No hay universidades.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  // Solo el Director: otro rol que escribe la URL no llega a la comparación
  // ni la pide a la API.
  test.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO'])(
    '%s no accede a la comparación por la URL',
    async (rol) => {
      const pedida = vi.fn(() => LISTA)
      await renderConSesion(rol, COMPARAR, { [UNIVERSIDADES]: pedida })
      expect(
        screen.queryByRole('region', {
          name: 'Comparación entre universidades',
        }),
      ).toBeNull()
      expect(screen.queryByRole('table')).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )
})
