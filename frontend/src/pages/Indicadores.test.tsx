import type {
  MetricasConsolidadas,
  MetricasCarrera,
  DistribucionNotas,
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
const CURSOS_RUTA = '/api/metricas/carreras/c-ing/cursos'
const DISTRIBUCION_RUTA = '/api/metricas/cursos/curso-1/distribucion'

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
const CURSOS: MetricasCarrera = {
  universidad: { id: 'u-norte', nombre: 'Universidad Demo Norte' },
  facultad: { id: 'f-ing', nombre: 'Ingeniería' },
  carrera: { id: 'c-ing', nombre: 'Ingeniería Civil' },
  periodo: { anio: 2026, semestre: 2 },
  cursos: [
    {
      id: 'curso-1',
      codigo: 'INF-101',
      nombre: 'Programación',
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    },
    {
      id: 'curso-2',
      codigo: 'MAT-101',
      nombre: 'Cálculo',
      aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
      promedio: { valor: null, alumnos: 0 },
      asistencia: { valor: null, presentes: 0, registros: 0 },
    },
    {
      id: 'curso-3',
      codigo: 'FIS-101',
      nombre: 'Física',
      aprobacion: { valor: 90, aprobados: 9, evaluados: 10 },
      promedio: { valor: 6, alumnos: 10 },
      asistencia: { valor: 80, presentes: 8, registros: 10 },
    },
  ],
}
const DISTRIBUCION: DistribucionNotas = {
  universidad: { id: 'u-norte', nombre: 'Universidad Demo Norte' },
  facultad: { id: 'f-ing', nombre: 'Ingeniería' },
  carrera: { id: 'c-ing', nombre: 'Ingeniería Civil' },
  curso: { id: 'curso-1', codigo: 'INF-101', nombre: 'Programación' },
  totalEvaluados: 7,
  notaMinimaAprobacion: 4,
  rangos: [
    { minimo: 1, maximo: 1.9, alumnos: 1 },
    { minimo: 2, maximo: 2.9, alumnos: 1 },
    { minimo: 3, maximo: 3.9, alumnos: 1 },
    { minimo: 4, maximo: 4.9, alumnos: 1 },
    { minimo: 5, maximo: 5.9, alumnos: 1 },
    { minimo: 6, maximo: 7, alumnos: 2 },
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

// Un paso del breadcrumb del encabezado: un enlace, o —si la ruta es larga y
// quedó en el menú «…»— un ítem de ese menú.
async function paso(nombre: string) {
  // Hasta que llegan los nombres, el breadcrumb tiene un esqueleto.
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('navigation', { name: 'Breadcrumb', hidden: true }),
      ).queryByRole('status', { hidden: true }),
    ).toBeNull(),
  )
  // Con el menú «…» abierto el resto de la página queda oculto (hidden).
  const abierto = screen.queryByRole('menu')
  const enMenu = abierto
    ? within(abierto).queryByRole('menuitem', { name: nombre })
    : null
  if (enMenu) return enMenu
  const nav = screen.getByRole('navigation', {
    name: 'Breadcrumb',
    hidden: true,
  })
  const directo = within(nav).queryByRole('link', {
    name: nombre,
    hidden: true,
  })
  if (directo) return directo
  fireEvent.keyDown(
    within(nav).getByRole('button', {
      name: 'Ver los pasos intermedios',
      hidden: true,
    }),
    { key: 'Enter' },
  )
  return within(await screen.findByRole('menu')).getByRole('menuitem', {
    name: nombre,
  })
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
    const norte = within(
      (
        await lista.findByRole('link', { name: 'Universidad Demo Norte' })
      ).closest('tr')!,
    )
    expect(
      norte
        .getAllByRole('cell')
        .slice(1, 4)
        .map((c) => c.textContent),
    ).toEqual(['50,0 %', '4,50', '66,67 %'])
    // Sur no tiene datos: un guion con el motivo, no un 0.
    expect(lista.getAllByText('Sin datos suficientes')).toHaveLength(3)
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
    expect(await paso('Indicadores')).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
    expect(await paso('Universidad Demo Norte')).toHaveAttribute(
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
    const enlace = await waitFor(() => paso('Universidad Demo Sur'))
    expect(enlace).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur?periodo=2026-1',
    )
    expect(await paso('Indicadores')).toHaveAttribute(
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

  test('una carrera abre sus cursos, conserva período y ordena null al final', async () => {
    await renderConSesion('DIRECTOR', '/indicadores?periodo=2026-1', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
      [FACULTADES]: () => DETALLE,
      [CARRERAS_RUTA]: () => CARRERAS,
      [CURSOS_RUTA]: (_init, url) => {
        expect(url).toBe(`${CURSOS_RUTA}?periodo=2026-1`)
        return CURSOS
      },
    })
    fireEvent.click(
      await screen.findByRole('link', { name: 'Universidad Demo Norte' }),
    )
    fireEvent.click(await screen.findByRole('link', { name: 'Ingeniería' }))
    fireEvent.click(
      await screen.findByRole('link', { name: 'Ingeniería Civil' }),
    )
    expect(await screen.findByText('Programación')).toBeInTheDocument()
    expect(screen.getByText('Cálculo')).toBeInTheDocument()
    const tabla = screen.getByRole('table', { name: 'Cursos de la carrera' })
    expect(within(tabla).getAllByText('Sin datos suficientes')).toHaveLength(3)
    const filas = within(tabla).getAllByRole('row')
    expect(filas[1]).toHaveTextContent('FIS-101')
    fireEvent.click(
      within(tabla).getByRole('button', { name: 'Ordenar por Aprobación' }),
    )
    expect(
      within(tabla).getByRole('columnheader', { name: /Aprobación/ }),
    ).toHaveAttribute('aria-sort', 'ascending')
    expect(within(tabla).getAllByRole('row')[1]).toHaveTextContent('INF-101')
    expect(await paso('Indicadores')).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
    expect(await paso('Ingeniería')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-norte/facultades/f-ing?periodo=2026-1',
    )
    // Y vuelve también a la universidad, conservando el período.
    expect(await paso('Universidad Demo Norte')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-norte?periodo=2026-1',
    )
  })

  // La universidad de la API manda sobre la de la URL, como en el nivel de
  // carreras.
  test('el breadcrumb de la carrera vuelve a la universidad de la API', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing?periodo=2026-1',
      {
        [CURSOS_RUTA]: () => ({
          ...CURSOS,
          universidad: { id: 'u-sur', nombre: 'Universidad Demo Sur' },
          facultad: { id: 'f-otra', nombre: 'Facultad de Sur' },
        }),
      },
    )
    expect(await paso('Universidad Demo Sur')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur?periodo=2026-1',
    )
    // La URL trae f-ing, pero la carrera es de otra facultad: el enlace usa la
    // de la API y conserva el período.
    expect(await paso('Facultad de Sur')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur/facultades/f-otra?periodo=2026-1',
    )
  })

  // Cambiar el período no borra el orden de la tabla: permite comparar
  // semestres sin volver a ordenar.
  test('al cambiar el período se conservan el orden y la dirección', async () => {
    const pedidas: string[] = []
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing?periodo=2026-2&orden=promedio&direccion=desc',
      {
        [CURSOS_RUTA]: (_init, url) => {
          pedidas.push(url ?? '')
          return CURSOS
        },
      },
    )
    const tabla = await screen.findByRole('table', {
      name: 'Cursos de la carrera',
    })
    expect(
      within(tabla).getByRole('columnheader', { name: 'Promedio' }),
    ).toHaveAttribute('aria-sort', 'descending')
    fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), {
      target: { value: '2026-1' },
    })
    await waitFor(() =>
      expect(pedidas).toContain(`${CURSOS_RUTA}?periodo=2026-1`),
    )
    expect(
      within(
        await screen.findByRole('table', { name: 'Cursos de la carrera' }),
      ).getByRole('columnheader', { name: 'Promedio' }),
    ).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue(
      '2026-1',
    )
  })

  // Cada indicador ordena en los dos sentidos y los null quedan siempre al
  // final.
  test.each([
    ['Aprobación', 'asc', ['B', 'C', 'A', 'N']],
    ['Aprobación', 'desc', ['A', 'C', 'B', 'N']],
    ['Promedio', 'asc', ['C', 'A', 'B', 'N']],
    ['Promedio', 'desc', ['B', 'A', 'C', 'N']],
    ['Asistencia', 'asc', ['A', 'B', 'C', 'N']],
    ['Asistencia', 'desc', ['C', 'B', 'A', 'N']],
  ] as const)(
    'ordena por %s %s con los null al final',
    async (columna, sentido, esperado) => {
      const curso = (
        codigo: string,
        aprobacion: number | null,
        promedio: number | null,
        asistencia: number | null,
      ) => ({
        id: `id-${codigo}`,
        codigo,
        nombre: `Curso ${codigo}`,
        aprobacion: { valor: aprobacion, aprobados: 0, evaluados: 0 },
        promedio: { valor: promedio, alumnos: 0 },
        asistencia: { valor: asistencia, presentes: 0, registros: 0 },
      })
      await renderConSesion(
        'DIRECTOR',
        '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
        {
          [CURSOS_RUTA]: () => ({
            ...CURSOS,
            cursos: [
              curso('N', null, null, null),
              curso('A', 80, 5, 10),
              curso('B', 20, 6, 20),
              curso('C', 50, 4, 30),
            ],
          }),
        },
      )
      const tabla = await screen.findByRole('table', {
        name: 'Cursos de la carrera',
      })
      const boton = within(tabla).getByRole('button', {
        name: `Ordenar por ${columna}`,
      })
      fireEvent.click(boton)
      if (sentido === 'desc') fireEvent.click(boton)
      expect(
        within(tabla).getByRole('columnheader', { name: columna }),
      ).toHaveAttribute(
        'aria-sort',
        sentido === 'asc' ? 'ascending' : 'descending',
      )
      const codigos = within(tabla)
        .getAllByRole('row')
        .slice(1)
        .map((fila) => /Curso (\w)/.exec(fila.textContent ?? '')?.[1])
      expect(codigos).toEqual(esperado)
    },
  )

  test('cursos: vacío, error con reintento y carrera inexistente', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      {
        [CURSOS_RUTA]: () => ({ ...CURSOS, cursos: [] }),
      },
    )
    expect(
      await screen.findByText('Esta carrera no tiene cursos.'),
    ).toBeInTheDocument()
    cleanup()
    let intentos = 0
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      {
        [CURSOS_RUTA]: () => (intentos++ === 0 ? json({}, 500) : CURSOS),
      },
    )
    expect(
      await screen.findByText('No pudimos cargar los cursos.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Programación')).toBeInTheDocument()
    cleanup()
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      {
        [CURSOS_RUTA]: () => json({}, 404),
      },
    )
    expect(await screen.findByText('La carrera no existe.')).toBeInTheDocument()
  })

  test.each<Rol>(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s no accede a los cursos por URL',
    async (rol) => {
      const pedida = vi.fn(() => CURSOS)
      await renderConSesion(
        rol,
        '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
        {
          [CURSOS_RUTA]: pedida,
        },
      )
      expect(
        screen.queryByRole('table', { name: 'Cursos de la carrera' }),
      ).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )

  test('un curso muestra el histograma, tabla, línea de aprobación y breadcrumb', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1?periodo=2026-1',
      {
        [DISTRIBUCION_RUTA]: (_init, url) => {
          expect(url).toBe(DISTRIBUCION_RUTA)
          return DISTRIBUCION
        },
      },
    )
    const histograma = await screen.findByRole('img', {
      name: /Distribución de notas/,
    })
    expect(histograma).toBeInTheDocument()
    expect(histograma).toHaveAccessibleName(/aprobación.*4,0/i)
    // Una barra por rango de notas; las barras de la comparación (MET-02) son
    // otro elemento.
    expect(
      histograma.querySelectorAll('[data-slot="histograma-barra"]'),
    ).toHaveLength(6)
    expect(histograma.querySelector('[data-slot="barra-relleno"]')).toBeNull()
    // La línea de aprobación se rotula con la nota mínima de la API.
    expect(screen.getByText('Aprobación 4,0')).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Tabla equivalente de distribución de notas',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('1,0–1,9').length).toBeGreaterThan(0)
    expect(screen.getByText(/7\s+alumnos evaluados/)).toBeInTheDocument()
    expect(await paso('Indicadores')).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
    expect(await paso('Ingeniería Civil')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing?periodo=2026-1',
    )
  })

  test('una ruta larga colapsa los pasos intermedios en «…»: quedan Inicio, el penúltimo y el último', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1?periodo=2026-1',
      { [DISTRIBUCION_RUTA]: () => DISTRIBUCION },
    )
    await screen.findByRole('img', { name: /Distribución de notas/ })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    await waitFor(() => expect(within(nav).queryByRole('status')).toBeNull())
    const visibles = within(nav)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    // Inicio · … · Carrera · Curso (el último es el título).
    expect(visibles[0]).toBe('Inicio')
    expect(visibles.at(-2)).toBe('Ingeniería Civil')
    expect(visibles).not.toContain('Indicadores')
    expect(within(nav).getByRole('heading', { level: 1 })).toHaveAttribute(
      'class',
      expect.stringContaining('truncate'),
    )
    // El menú «…» trae los pasos de en medio, con sus enlaces.
    fireEvent.keyDown(
      within(nav).getByRole('button', { name: 'Ver los pasos intermedios' }),
      { key: 'Enter' },
    )
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Indicadores',
      'Universidad Demo Norte',
      'Ingeniería',
    ])
  })

  // Un enlace directo puede combinar una facultad y una carrera que no son las
  // del curso: el breadcrumb usa los ids de la API y conserva el período.
  test('el breadcrumb del curso usa los ids de la API y conserva el período', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-url/carreras/c-url/cursos/curso-1?periodo=2026-1',
      {
        [DISTRIBUCION_RUTA]: () => ({
          ...DISTRIBUCION,
          universidad: { id: 'u-sur', nombre: 'Universidad Demo Sur' },
          facultad: { id: 'f-sur', nombre: 'Facultad de Sur' },
          carrera: { id: 'c-sur', nombre: 'Carrera de Sur' },
        }),
      },
    )
    expect(await paso('Universidad Demo Sur')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur?periodo=2026-1',
    )
    expect(await paso('Facultad de Sur')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur/facultades/f-sur?periodo=2026-1',
    )
    expect(await paso('Carrera de Sur')).toHaveAttribute(
      'href',
      '/indicadores/universidades/u-sur/facultades/f-sur/carreras/c-sur?periodo=2026-1',
    )
  })

  // Se llega desde el último nivel del drill-down; la distribución no recibe
  // el período (el curso fija el suyo), pero la navegación lo conserva.
  test('un curso de la tabla abre su distribución sin enviar el período', async () => {
    const pedidas: string[] = []
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing?periodo=2026-1',
      {
        [CURSOS_RUTA]: () => CURSOS,
        [DISTRIBUCION_RUTA]: (_init, url) => {
          pedidas.push(url ?? '')
          return DISTRIBUCION
        },
      },
    )
    fireEvent.click(await screen.findByRole('link', { name: /INF-101/ }))
    expect(
      await screen.findByRole('img', { name: /Distribución de notas/ }),
    ).toBeInTheDocument()
    expect(pedidas).toEqual([DISTRIBUCION_RUTA])
    expect(await paso('Indicadores')).toHaveAttribute(
      'href',
      '/indicadores?periodo=2026-1',
    )
  })

  test('distribución: vacío, error con reintento y curso inexistente', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      {
        [DISTRIBUCION_RUTA]: () => ({
          ...DISTRIBUCION,
          totalEvaluados: 0,
          rangos: DISTRIBUCION.rangos.map((r) => ({ ...r, alumnos: 0 })),
        }),
      },
    )
    expect(
      await screen.findByText('Sin notas finales para este curso'),
    ).toBeInTheDocument()
    cleanup()
    let intentos = 0
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      {
        [DISTRIBUCION_RUTA]: () =>
          intentos++ === 0 ? json({}, 500) : DISTRIBUCION,
      },
    )
    expect(
      await screen.findByText('No pudimos cargar la distribución.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('img', { name: /Distribución de notas/ }),
    ).toBeInTheDocument()
    cleanup()
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      {
        [DISTRIBUCION_RUTA]: () => json({}, 404),
      },
    )
    expect(await screen.findByText('El curso no existe.')).toBeInTheDocument()
  })

  test.each<Rol>(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s no accede a la distribución por URL',
    async (rol) => {
      const pedida = vi.fn(() => DISTRIBUCION)
      await renderConSesion(
        rol,
        '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
        {
          [DISTRIBUCION_RUTA]: pedida,
        },
      )
      expect(
        screen.queryByRole('img', { name: /Distribución de notas/ }),
      ).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )

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
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('navigation', { name: 'Breadcrumb' }),
        ).getByText('Universidad Demo Norte'),
      ).toHaveAttribute('aria-current', 'page'),
    )
    // En el detalle todavía no se pidió el consolidado.
    expect(pedidas).not.toContain(`${RUTA}?periodo=2026-1`)
    fireEvent.click(await paso('Indicadores'))
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
    await screen.findByRole('list', { name: 'Facultades' })
    expect(pedidas).toContain(`${RUTA}?periodo=2026-1`)
    expect(pedidas).toContain(`${UNIVERSIDADES}?periodo=2026-1`)
    expect(pedidas).toContain(`${FACULTADES}?periodo=2026-1`)
    // El enlace de vuelta conserva el período.
    expect(await paso('Indicadores')).toHaveAttribute(
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
        screen.queryByRole('navigation', { name: 'Breadcrumb' }),
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
      .slice(1) // la primera celda es el nombre de la universidad
      .map((c) => c.textContent)

  const relleno = (nombre: string) =>
    within(screen.getByRole('list', { name: /por universidad$/ }))
      .getByText(nombre)
      .closest('li')
      ?.querySelector('[data-slot="barra-relleno"]')

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
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Gráfico' }))
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
    expect(await paso('Indicadores')).toHaveAttribute(
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

// UI/UX-08: estados y estructura de las pantallas migradas a shadcn.
describe('estados de carga, vacío y error', () => {
  const nunca = () => new Promise(() => {})

  test('mientras carga, cada nivel muestra esqueletos y lo anuncia', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: nunca,
      [UNIVERSIDADES]: nunca,
    })
    expect(await screen.findByText('Cargando indicadores…')).toBeInTheDocument()
    expect(screen.getByText('Cargando universidades…')).toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('list', { name: 'Indicadores' })).toBeNull()
  })

  test.each([
    ['la comparación', '/indicadores/comparar', 'Cargando universidades…'],
    [
      'las facultades',
      '/indicadores/universidades/u-norte',
      'Cargando facultades…',
    ],
    [
      'las carreras',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      'Cargando carreras…',
    ],
    [
      'los cursos',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      'Cargando cursos…',
    ],
    [
      'la distribución',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      'Cargando distribución…',
    ],
  ])('%s anuncia la carga', async (_nivel, ruta, texto) => {
    await renderConSesion('DIRECTOR', ruta, {
      [UNIVERSIDADES]: nunca,
      [FACULTADES]: nunca,
      [CARRERAS_RUTA]: nunca,
      [CURSOS_RUTA]: nunca,
      [DISTRIBUCION_RUTA]: nunca,
    })
    expect(await screen.findByText(texto)).toBeInTheDocument()
  })

  test.each([
    [
      'la universidad sin facultades',
      '/indicadores/universidades/u-norte',
      FACULTADES,
      { ...DETALLE, facultades: [] },
      'Esta universidad no tiene facultades.',
    ],
    [
      'la facultad sin carreras',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      CARRERAS_RUTA,
      { ...CARRERAS, carreras: [] },
      'Esta facultad no tiene carreras.',
    ],
    [
      'la carrera sin cursos',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      CURSOS_RUTA,
      { ...CURSOS, cursos: [] },
      'Esta carrera no tiene cursos.',
    ],
    [
      'el curso sin notas',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      DISTRIBUCION_RUTA,
      { ...DISTRIBUCION, totalEvaluados: 0 },
      'Sin notas finales para este curso',
    ],
  ])('%s dice qué falta', async (_caso, ruta, api, datos, mensaje) => {
    await renderConSesion('DIRECTOR', ruta, { [api]: () => datos })
    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test.each([
    ['las universidades', '/indicadores/comparar', UNIVERSIDADES, LISTA],
    [
      'las facultades',
      '/indicadores/universidades/u-norte',
      FACULTADES,
      DETALLE,
    ],
    [
      'las carreras',
      '/indicadores/universidades/u-norte/facultades/f-ing',
      CARRERAS_RUTA,
      CARRERAS,
    ],
    [
      'los cursos',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      CURSOS_RUTA,
      CURSOS,
    ],
    [
      'la distribución',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing/cursos/curso-1',
      DISTRIBUCION_RUTA,
      DISTRIBUCION,
    ],
  ])('si fallan %s, ofrece reintentar', async (_nivel, ruta, api, datos) => {
    let intentos = 0
    await renderConSesion('DIRECTOR', ruta, {
      [api]: () => (intentos++ === 0 ? json({}, 500) : datos),
    })
    expect(
      await screen.findByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull(),
    )
    expect(intentos).toBe(2)
  })

  test('si los períodos fallan, el selector se cambia por un aviso con reintento', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
      '/api/metricas/periodos': () =>
        intentos++ === 0
          ? json({}, 500)
          : [{ anio: 2026, semestre: 2, activo: true }],
    })
    expect(
      await screen.findByText('No pudimos cargar los períodos.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('combobox', { name: 'Período' }),
    ).toBeInTheDocument()
  })

  test('el selector de período es un <select> con su etiqueta', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
    })
    const selector = await screen.findByRole('combobox', { name: 'Período' })
    expect(selector.tagName).toBe('SELECT')
    expect(selector).toHaveAttribute('data-slot', 'native-select')
    expect(selector).toHaveValue('')
    expect(screen.getByLabelText('Período')).toBe(selector)
  })
})

describe('pestañas de la comparación', () => {
  const COMPARAR = '/indicadores/comparar'

  test('abre en la tabla; el gráfico está en la otra pestaña', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => LISTA,
    })
    const tabla = await screen.findByRole('tab', { name: 'Tabla' })
    const grafico = screen.getByRole('tab', { name: 'Gráfico' })
    expect(tabla).toHaveAttribute('aria-selected', 'true')
    expect(grafico).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.getByRole('table', { name: 'Indicadores por universidad' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Indicador a graficar' }),
    ).toBeNull()

    fireEvent.mouseDown(grafico)
    expect(grafico).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('combobox', { name: 'Indicador a graficar' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.mouseDown(tabla)
    expect(
      screen.getByRole('table', { name: 'Indicadores por universidad' }),
    ).toBeInTheDocument()
  })

  test('las flechas pasan de una pestaña a la otra', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => LISTA,
    })
    const tabla = await screen.findByRole('tab', { name: 'Tabla' })
    tabla.focus()
    fireEvent.keyDown(tabla, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Gráfico' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
  })

  test('la tabla ordena por una columna al pulsar su encabezado', async () => {
    await renderConSesion('DIRECTOR', COMPARAR, {
      [UNIVERSIDADES]: () => LISTA,
    })
    const tabla = await screen.findByRole('table', {
      name: 'Indicadores por universidad',
    })
    const nombres = () =>
      within(tabla)
        .getAllByRole('row')
        .slice(1)
        .map((fila) => within(fila).getAllByRole('cell')[0].textContent)
    expect(nombres()).toEqual([
      'Universidad Demo Norte',
      'Universidad Demo Sur',
    ])
    // Sur no tiene alumnos: con orden ascendente queda primero.
    fireEvent.click(within(tabla).getByRole('button', { name: /Alumnos/ }))
    expect(nombres()).toEqual([
      'Universidad Demo Sur',
      'Universidad Demo Norte',
    ])
  })
})

describe('tabla de cursos', () => {
  test('los encabezados ordenables son botones y el orden queda en aria-sort', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing',
      { [CURSOS_RUTA]: () => CURSOS },
    )
    const boton = await screen.findByRole('button', {
      name: 'Ordenar por Promedio',
    })
    expect(boton).toHaveAttribute('data-slot', 'orden-columna')
    const encabezado = boton.closest('th')!
    expect(encabezado).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(boton)
    expect(encabezado).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(boton)
    expect(encabezado).toHaveAttribute('aria-sort', 'descending')
  })

  test('cada curso es un enlace al detalle y la tabla se lleva su etiqueta', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/indicadores/universidades/u-norte/facultades/f-ing/carreras/c-ing?periodo=2026-1',
      { [CURSOS_RUTA]: () => CURSOS },
    )
    const tabla = await screen.findByRole('table', {
      name: 'Cursos de la carrera',
    })
    const enlaces = within(tabla).getAllByRole('link')
    expect(enlaces.length).toBe(CURSOS.cursos.length)
    expect(enlaces[0].getAttribute('href')).toMatch(
      /\/cursos\/.+\?periodo=2026-1$/,
    )
  })
})
