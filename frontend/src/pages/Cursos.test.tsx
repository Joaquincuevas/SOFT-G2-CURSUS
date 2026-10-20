import type {
  Carrera,
  CursoCreado,
  CursoListado,
  OpcionPeriodo,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }

const CARRERAS: Carrera[] = [
  { id: 'carrera-1', nombre: 'Ingeniería Civil en Informática' },
]
// La API devuelve el período activo primero.
const PERIODOS: OpcionPeriodo[] = [
  { ...PERIODO, activo: true },
  { id: 'periodo-2026-1', anio: 2026, semestre: 1, activo: false },
]

const CURSO: CursoCreado = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
  carreraNombre: 'Ingeniería Civil en Informática',
  periodo: PERIODO,
}

const LISTADO: CursoListado = { ...CURSO, secciones: 0 }

// Rutas del formulario; `crear` responde POST /api/cursos. GET /api/cursos
// lista los cursos creados con éxito.
function rutas(crear: RutaSimulada): Record<string, RutaSimulada> {
  let listado: CursoListado[] = []
  return {
    '/api/carreras': () => CARRERAS,
    '/api/periodos': () => PERIODOS,
    '/api/cursos': (init) => {
      if (init?.method !== 'POST') return listado
      const respuesta = crear(init)
      if (respuesta instanceof Response && respuesta.ok) listado = [LISTADO]
      return respuesta
    },
  }
}

async function llenarYEnviar() {
  fireEvent.change(await screen.findByLabelText('Código'), {
    target: { value: 'icc101' },
  })
  fireEvent.change(screen.getByLabelText('Nombre del curso'), {
    target: { value: 'Introducción a la Programación' },
  })
  fireEvent.change(screen.getByLabelText('Carrera'), {
    target: { value: 'carrera-1' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear curso' }))
}

describe('crear curso', () => {
  test('los cuatro campos son obligatorios y el período activo viene elegido', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas(() => json(CURSO, 201)),
    )

    for (const campo of [
      'Código',
      'Nombre del curso',
      'Carrera',
      'Período académico',
    ]) {
      expect(await screen.findByLabelText(campo)).toBeRequired()
    }
    expect(screen.getByLabelText('Período académico')).toHaveValue(
      'periodo-2026-2',
    )
    expect(screen.getByLabelText('Carrera')).toHaveValue('')
  })

  test('al guardar vuelve a /cursos con el mensaje y el curso en el listado', async () => {
    const enviados: unknown[] = []
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas((init) => {
        enviados.push(JSON.parse(String(init?.body)))
        return json(CURSO, 201)
      }),
    )
    await llenarYEnviar()

    expect(await screen.findByText('Curso ICC101 creado.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(
      await screen.findByRole('cell', {
        name: 'Introducción a la Programación',
      }),
    ).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        codigo: 'icc101',
        nombre: 'Introducción a la Programación',
        carreraId: 'carrera-1',
        periodoId: 'periodo-2026-2',
      },
    ])
  })

  test('muestra el mensaje del 409 en el formulario', async () => {
    const mensaje =
      'Ya existe un curso con el código ICC101 en el período 2026-2'
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas(() => json({ statusCode: 409, message: mensaje }, 409)),
    )
    await llenarYEnviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    // Sigue en el formulario, con lo que escribió.
    expect(screen.getByLabelText('Código')).toHaveValue('icc101')
    expect(screen.getByRole('button', { name: 'Crear curso' })).toBeEnabled()
  })

  test('si las listas no cargan, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion('ADMINISTRATIVO', '/cursos/nuevo', {
      '/api/carreras': () =>
        fallar ? new Response(null, { status: 500 }) : CARRERAS,
      '/api/periodos': () => PERIODOS,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las carreras y los períodos.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Carrera')).toBeInTheDocument()
  })

  test('sin permiso para crear, vuelve a /cursos', async () => {
    // El Director lee Gestión académica pero no puede crear cursos.
    await renderConSesion('DIRECTOR', '/cursos/nuevo', {
      '/api/cursos': () => [],
    })

    expect(
      await screen.findByRole('region', { name: 'Gestión de cursos' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })
})

describe('listado de cursos', () => {
  const columnas = async () =>
    within(await screen.findByRole('table'))
      .getAllByRole('columnheader')
      .map((th) => th.textContent)

  test('el Administrativo ve la tabla y el botón Crear curso', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () => [LISTADO],
    })

    expect(await columnas()).toEqual([
      'Código',
      'Curso',
      'Carrera',
      'Período',
      'Secciones',
    ])
    expect(
      screen.getByRole('row', {
        name: 'ICC101 Introducción a la Programación Ingeniería Civil en Informática 2026-2 0',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Facultad de Ingeniería · Período 2026-2'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear curso' })).toHaveAttribute(
      'href',
      '/cursos/nuevo',
    )
  })

  test('el Director ve la columna Universidad y ningún botón para crear', async () => {
    await renderConSesion('DIRECTOR', '/cursos', {
      '/api/cursos': () => [
        { ...LISTADO, universidadNombre: 'Universidad Demo Sur' },
      ],
    })

    expect((await columnas())[0]).toBe('Universidad')
    expect(
      screen.getByRole('cell', { name: 'Universidad Demo Sur' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })

  test('sin cursos muestra el estado vacío con Crear curso', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () => [],
    })

    expect(
      await screen.findByText('Aún no hay cursos en tu facultad.'),
    ).toBeInTheDocument()
    // Un solo botón: el del estado vacío.
    expect(screen.getAllByRole('link', { name: 'Crear curso' })).toHaveLength(1)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('el estado vacío no ofrece Crear curso sin permiso', async () => {
    await renderConSesion('DIRECTOR', '/cursos', { '/api/cursos': () => [] })

    expect(
      await screen.findByText('Aún no hay cursos en tu facultad.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })

  test('si el listado falla, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () =>
        fallar ? new Response(null, { status: 500 }) : [LISTADO],
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los cursos.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('filtros del listado (GES-04)', () => {
  const INDUSTRIAL: Carrera = {
    id: 'carrera-2',
    nombre: 'Ingeniería Civil Industrial',
  } as Carrera
  const CURSOS: CursoListado[] = [
    LISTADO,
    {
      ...LISTADO,
      id: 'curso-2',
      codigo: 'IND101',
      nombre: 'Optimización',
      carreraNombre: INDUSTRIAL.nombre,
    },
    {
      ...LISTADO,
      id: 'curso-3',
      codigo: 'ICC001',
      nombre: 'Curso anterior',
      periodo: { id: 'periodo-2026-1', anio: 2026, semestre: 1 },
    },
  ]
  const CARRERA_DE: Record<string, string> = {
    'carrera-1': 'Ingeniería Civil en Informática',
    'carrera-2': INDUSTRIAL.nombre,
  }

  // Backend que filtra como la API y anota cada URL pedida a /api/cursos.
  function simular(periodos = PERIODOS) {
    const pedidos: string[] = []
    const rutas: Record<string, RutaSimulada> = {
      '/api/carreras': () => [...CARRERAS, INDUSTRIAL],
      '/api/periodos': () => periodos,
      '/api/cursos': (_init, url = '') => {
        pedidos.push(url)
        const query = new URLSearchParams(url.split('?')[1])
        const carrera = query.get('carreraId')
        const periodo = query.get('periodoId')
        return CURSOS.filter(
          (curso) =>
            (!carrera || curso.carreraNombre === CARRERA_DE[carrera]) &&
            (!periodo || curso.periodo.id === periodo),
        )
      },
    }
    return { pedidos, rutas }
  }

  const filtro = (nombre: 'Carrera' | 'Período') =>
    within(screen.getByRole('search', { name: 'Filtros' })).getByLabelText(
      nombre,
    )
  const codigos = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((fila) => within(fila).getAllByRole('cell')[0].textContent)

  test('por defecto muestra el período activo, con una sola petición', async () => {
    const { pedidos, rutas } = simular()
    await renderConSesion('ADMINISTRATIVO', '/cursos', rutas)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(filtro('Período')).toHaveValue('periodo-2026-2')
    expect(filtro('Carrera')).toHaveValue('')
    expect(codigos()).toEqual(['ICC101', 'IND101'])
    // No pide primero sin filtros y después con el período.
    expect(pedidos).toEqual(['/api/cursos?periodoId=periodo-2026-2'])
  })

  test('sin período activo, el período queda en Todos', async () => {
    const { pedidos, rutas } = simular(
      PERIODOS.map((periodo) => ({ ...periodo, activo: false })),
    )
    await renderConSesion('ADMINISTRATIVO', '/cursos', rutas)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(filtro('Período')).toHaveValue('')
    expect(codigos()).toEqual(['ICC101', 'IND101', 'ICC001'])
    expect(pedidos).toEqual(['/api/cursos'])
  })

  test('combina carrera y período y actualiza el listado sin recargar', async () => {
    const { pedidos, rutas } = simular()
    await renderConSesion('ADMINISTRATIVO', '/cursos', rutas)
    await screen.findByRole('table')

    fireEvent.change(filtro('Carrera'), { target: { value: 'carrera-2' } })
    await screen.findByRole('cell', { name: 'Optimización' })
    expect(codigos()).toEqual(['IND101'])
    expect(pedidos.at(-1)).toBe(
      '/api/cursos?carreraId=carrera-2&periodoId=periodo-2026-2',
    )

    fireEvent.change(filtro('Período'), { target: { value: '' } })
    fireEvent.change(filtro('Carrera'), { target: { value: 'carrera-1' } })
    await screen.findByRole('cell', { name: 'Curso anterior' })
    expect(codigos()).toEqual(['ICC101', 'ICC001'])
    expect(pedidos.at(-1)).toBe('/api/cursos?carreraId=carrera-1')
    // Sigue en la misma página, con el encabezado y los filtros.
    expect(
      screen.getByRole('region', { name: 'Gestión de cursos' }),
    ).toBeInTheDocument()
  })

  test('sin resultados muestra el estado vacío de los filtros', async () => {
    const { rutas } = simular()
    await renderConSesion('ADMINISTRATIVO', '/cursos', rutas)
    await screen.findByRole('table')

    fireEvent.change(filtro('Período'), {
      target: { value: 'periodo-2026-1' },
    })
    fireEvent.change(filtro('Carrera'), { target: { value: 'carrera-2' } })

    expect(
      await screen.findByText('No hay cursos con estos filtros.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Crear curso sigue disponible arriba de los filtros.
    expect(
      screen.getByRole('link', { name: 'Crear curso' }),
    ).toBeInTheDocument()
  })

  test('el formulario reutiliza las carreras y los períodos ya cargados', async () => {
    const { rutas } = simular()
    const fetch = await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos',
      rutas,
    ).then(() => vi.mocked(globalThis.fetch))
    await screen.findByRole('table')

    fireEvent.click(screen.getByRole('link', { name: 'Crear curso' }))
    expect(await screen.findByLabelText('Período académico')).toHaveValue(
      'periodo-2026-2',
    )
    const pedidosA = (ruta: string) =>
      fetch.mock.calls.filter(([url]) => String(url) === ruta).length
    expect(pedidosA('/api/carreras')).toBe(1)
    expect(pedidosA('/api/periodos')).toBe(1)
  })

  test('el Director ve el listado sin filtros', async () => {
    const { pedidos, rutas } = simular()
    await renderConSesion('DIRECTOR', '/cursos', rutas)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(
      screen.queryByRole('search', { name: 'Filtros' }),
    ).not.toBeInTheDocument()
    expect(pedidos).toEqual(['/api/cursos'])
  })
})
