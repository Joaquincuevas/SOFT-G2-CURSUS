import type { ReporteFacultad as DatosReporte } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/metricas/facultad'
const PERIODOS = '/api/periodos'
const REPORTE: DatosReporte = {
  facultad: { id: 'f-1', nombre: 'Ingeniería' },
  periodo: { anio: 2026, semestre: 2 },
  carreras: [
    {
      id: 'c-1',
      nombre: 'Ingeniería Civil',
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
      cursos: [
        {
          id: 'curso-1',
          codigo: 'ICC101',
          nombre: 'Introducción',
          aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
          promedio: { valor: null, alumnos: 0 },
          asistencia: { valor: null, presentes: 0, registros: 0 },
        },
      ],
    },
  ],
}

const periodos = [
  {
    id: 'p2',
    anio: 2026,
    semestre: 2,
    activo: true,
    fechaInicio: '',
    fechaTermino: '',
  },
  {
    id: 'p1',
    anio: 2026,
    semestre: 1,
    activo: false,
    fechaInicio: '',
    fechaTermino: '',
  },
]

test('muestra carreras, cursos, indicadores null y filtra por período en la URL', async () => {
  const pedidos: string[] = []
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: (_init, url) => {
      pedidos.push(url ?? RUTA)
      return REPORTE
    },
    [PERIODOS]: () => periodos,
  })
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
  expect(screen.getByText('ICC101 · Introducción')).toBeInTheDocument()
  expect(screen.getAllByText('Sin datos suficientes')).toHaveLength(3)
  const selector = screen.getByRole('combobox', { name: 'Período' })
  expect(selector).toHaveValue('2026-2')
  fireEvent.change(selector, { target: { value: '2026-1' } })
  await waitFor(() => expect(pedidos).toContain(`${RUTA}?periodo=2026-1`))
})

test('un período de tres dígitos se elige como 0999-1 y se consulta', async () => {
  const pedidos: string[] = []
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: (_init, url) => {
      pedidos.push(url ?? RUTA)
      return REPORTE
    },
    [PERIODOS]: () => [
      ...periodos,
      {
        id: 'p999',
        anio: 999,
        semestre: 1,
        activo: false,
        fechaInicio: '',
        fechaTermino: '',
      },
    ],
  })
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Período' }), {
    target: { value: '0999-1' },
  })
  await waitFor(() => expect(pedidos).toContain(`${RUTA}?periodo=0999-1`))
  expect(screen.queryByText(/no es válido/)).toBeNull()
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
})

test('muestra vacío y error con reintento', async () => {
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => ({ ...REPORTE, carreras: [] }),
    [PERIODOS]: () => periodos,
  })
  expect(
    await screen.findByText('Tu facultad no tiene carreras para este período.'),
  ).toBeInTheDocument()

  let intentos = 0
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => (intentos++ === 0 ? json({}, 500) : REPORTE),
    [PERIODOS]: () => periodos,
  })
  expect(
    await screen.findByText('No pudimos cargar el reporte académico.'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
})

test.each(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'] as const)(
  '%s no ve el reporte en la navegación',
  async (rol) => {
    await renderConSesion(rol, '/reporte-facultad')
    expect(screen.queryByRole('link', { name: 'Reporte académico' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  },
)

// UI/UX-08: la tabla agrupa cada carrera con sus cursos en un Fragment con key.
// Sin ella, React avisaba «Each child in a list should have a unique "key"».
test('TablaReporte no avisa de keys faltantes ni repetidas', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => ({
      ...REPORTE,
      carreras: [
        REPORTE.carreras[0],
        { ...REPORTE.carreras[0], id: 'c-2', nombre: 'Ingeniería Industrial' },
      ],
    }),
    [PERIODOS]: () => periodos,
  })
  expect(await screen.findByText('Ingeniería Industrial')).toBeInTheDocument()
  const avisos = error.mock.calls.filter((llamada) =>
    String(llamada[0]).includes('unique "key"'),
  )
  expect(avisos).toEqual([])
  error.mockRestore()
})

test('cada carrera encabeza sus cursos y la tabla se anuncia con su nombre', async () => {
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => REPORTE,
    [PERIODOS]: () => periodos,
  })
  const tabla = await screen.findByRole('table', {
    name: 'Carreras y cursos de la facultad',
  })
  expect(
    within(tabla)
      .getAllByRole('columnheader')
      .map((c) => c.textContent),
  ).toEqual(['Carrera / curso', 'Aprobación', 'Promedio', 'Asistencia'])
  const filas = within(tabla).getAllByRole('row').slice(1)
  expect(filas).toHaveLength(2)
  expect(within(filas[0]).getByRole('rowheader')).toHaveTextContent(
    'Ingeniería Civil',
  )
  expect(
    within(filas[0])
      .getAllByRole('cell')
      .map((c) => c.textContent),
  ).toEqual(['50,0 %', '4,50', '66,67 %'])
  expect(within(filas[1]).getByRole('rowheader')).toHaveTextContent(
    'ICC101 · Introducción',
  )
})

test('mientras carga muestra esqueletos y lo anuncia', async () => {
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => new Promise(() => {}),
    [PERIODOS]: () => periodos,
  })
  expect(
    await screen.findByText('Cargando reporte académico…'),
  ).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('table')).toBeNull()
})

test('un período con formato inválido no consulta y ofrece volver al activo', async () => {
  const pedida = vi.fn(() => REPORTE)
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad?periodo=activo', {
    [RUTA]: pedida,
    [PERIODOS]: () => periodos,
  })
  expect(
    await screen.findByText(/El período «activo» no es válido/),
  ).toBeInTheDocument()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(pedida).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ver el período activo' }))
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
})

test('si los períodos fallan, avisa y deja reintentar sin esconder el reporte', async () => {
  let intentos = 0
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad', {
    [RUTA]: () => REPORTE,
    [PERIODOS]: () => (intentos++ === 0 ? json({}, 500) : periodos),
  })
  expect(
    await screen.findByText('No pudimos cargar los períodos.'),
  ).toBeInTheDocument()
  expect(await screen.findByText('Ingeniería Civil')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  const selector = await screen.findByRole('combobox', { name: 'Período' })
  expect(selector.tagName).toBe('SELECT')
  expect(selector).toHaveValue('2026-2')
})

test('un 400 del reporte dice que el período no es válido', async () => {
  await renderConSesion('ADMINISTRATIVO', '/reporte-facultad?periodo=2026-1', {
    [RUTA]: () => json({}, 400),
    [PERIODOS]: () => periodos,
  })
  expect(
    await screen.findByText('El período no es válido.'),
  ).toBeInTheDocument()
})
