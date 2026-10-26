import type { CambioCurso, CursoEditable, Rol } from '@cursus/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { json, renderApp, usuarioDePrueba } from '../test/sesion'

const CURSO: CursoEditable = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraId: 'carrera-1',
  carreraNombre: 'Ingeniería Informática',
  periodoId: 'periodo-1',
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
}
const CARRERAS = [
  { id: CURSO.carreraId, nombre: CURSO.carreraNombre },
  { id: 'carrera-2', nombre: 'Ingeniería Civil' },
]
const PERIODOS = [
  { ...CURSO.periodo, activo: true },
  { id: 'periodo-2', anio: 2027, semestre: 1, activo: false },
]
const NUEVO: CursoEditable = {
  ...CURSO,
  codigo: 'ICC202',
  nombre: 'Programación avanzada',
  carreraId: 'carrera-2',
  carreraNombre: 'Ingeniería Civil',
  periodoId: 'periodo-2',
  periodo: { id: 'periodo-2', anio: 2027, semestre: 1 },
}
const CAMBIO: CambioCurso = {
  id: 'cambio-1',
  fecha: '2026-10-20T12:30:00.000Z',
  responsable: {
    id: 'responsable-1',
    nombre: 'Administrativo Ingeniería Norte',
  },
  anterior: CURSO,
  nuevo: NUEVO,
}
function preparar(
  opciones: {
    responder?: (ruta: string, init?: RequestInit) => Promise<Response>
    rol?: Rol
    historial?: CambioCurso[]
  } = {},
) {
  const fetch = vi.fn((ruta: string, init?: RequestInit): Promise<Response> => {
    if (ruta === '/api/auth/yo')
      return Promise.resolve(
        json(usuarioDePrueba(opciones.rol ?? 'ADMINISTRATIVO')),
      )
    if (opciones.responder) return opciones.responder(ruta, init)
    // Dashboards del profesor, ayudante y alumno, a los que vuelve
    // un rol sin acceso.
    if (
      ruta === '/api/dashboard/mis-secciones' ||
      ruta === '/api/dashboard/secciones-ayudante' ||
      ruta === '/api/dashboard/secciones-alumno'
    )
      return Promise.resolve(json([]))
    if (ruta === '/api/carreras') return Promise.resolve(json(CARRERAS))
    if (ruta === '/api/periodos') return Promise.resolve(json(PERIODOS))
    if (ruta.endsWith('/edicion')) return Promise.resolve(json(CURSO))
    if (ruta.endsWith('/historial'))
      return Promise.resolve(json(opciones.historial ?? []))
    if (ruta === '/api/cursos/curso-1' && !init?.method)
      return Promise.resolve(json({ ...CURSO, secciones: [] }))
    if (ruta === '/api/cursos' || ruta.startsWith('/api/cursos?'))
      return Promise.resolve(json([]))
    return Promise.resolve(json(NUEVO))
  })
  vi.stubGlobal('fetch', fetch)
  renderApp('/cursos/curso-1/editar', 'jwt-de-prueba')
  return fetch
}
async function modificar() {
  fireEvent.change(await screen.findByLabelText('Código'), {
    target: { value: ' icc202 ' },
  })
  fireEvent.change(screen.getByLabelText('Nombre del curso'), {
    target: { value: ' Programación avanzada ' },
  })
  fireEvent.change(screen.getByLabelText('Carrera'), {
    target: { value: 'carrera-2' },
  })
  fireEvent.change(screen.getByLabelText('Período académico'), {
    target: { value: 'periodo-2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
}

test('precarga los cuatro campos con los valores actuales, no con el período activo por defecto', async () => {
  preparar()
  expect(await screen.findByLabelText('Código')).toHaveValue(CURSO.codigo)
  expect(screen.getByLabelText('Nombre del curso')).toHaveValue(CURSO.nombre)
  expect(screen.getByLabelText('Carrera')).toHaveValue(CURSO.carreraId)
  expect(screen.getByLabelText('Período académico')).toHaveValue(
    CURSO.periodoId,
  )
  expect(screen.getByLabelText('Código')).toHaveAttribute('maxlength', '20')
  expect(screen.getByLabelText('Nombre del curso')).toHaveAttribute(
    'maxlength',
    '200',
  )
  for (const campo of [
    'Código',
    'Nombre del curso',
    'Carrera',
    'Período académico',
  ])
    expect(screen.getByLabelText(campo)).toBeRequired()
  expect(
    await screen.findByText('Aún no hay cambios registrados.'),
  ).toBeInTheDocument()
})

test('revisar muestra anterior/nuevo, volver conserva datos y solo confirmar envía PATCH', async () => {
  const fetch = preparar()
  await modificar()
  const resumen = screen.getByRole('region', { name: 'Confirmar cambios' })
  expect(within(resumen).getByText(CURSO.codigo)).toBeInTheDocument()
  expect(within(resumen).getByText(NUEVO.codigo)).toBeInTheDocument()
  expect(within(resumen).getByText('Ingeniería Civil')).toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
    false,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))
  expect(screen.getByLabelText('Código')).toHaveValue(' icc202 ')
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  const pedido = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')!
  expect(pedido[0]).toBe('/api/cursos/curso-1')
  expect(JSON.parse(pedido[1]!.body as string)).toEqual({
    codigo: NUEVO.codigo,
    nombre: NUEVO.nombre,
    carreraId: NUEVO.carreraId,
    periodoId: NUEVO.periodoId,
  })
  expect(new Headers(pedido[1]!.headers).get('Authorization')).toBe(
    'Bearer jwt-de-prueba',
  )
  expect(screen.getByLabelText('Código')).toHaveValue(NUEVO.codigo)
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter(([ruta]) => ruta.endsWith('/historial')),
    ).toHaveLength(2),
  )
})

test('cancelar sale sin enviar cambios', async () => {
  const fetch = preparar()
  await screen.findByLabelText('Código')
  fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('form', { name: 'Datos del curso' }),
    ).not.toBeInTheDocument(),
  )
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
    false,
  )
})

test('guardar sin cambios y código/nombre en blanco no abre confirmación ni envía PATCH', async () => {
  const fetch = preparar()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revisar cambios' }),
  )
  expect(screen.getByText('No hay cambios para guardar.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Código'), {
    target: { value: '   ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Ingresa un código y nombre válidos',
  )
  expect(
    screen.queryByRole('button', { name: 'Confirmar y guardar' }),
  ).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
    false,
  )
})

test.each([409, 404, 400, 500])(
  'un error %s conserva el formulario y exige nueva confirmación',
  async (estado) => {
    preparar({
      responder: (ruta, init) =>
        Promise.resolve(
          init?.method === 'PATCH'
            ? json({}, estado)
            : ruta === '/api/carreras'
              ? json(CARRERAS)
              : ruta === '/api/periodos'
                ? json(PERIODOS)
                : ruta.endsWith('/historial')
                  ? json([])
                  : json(CURSO),
        ),
    })
    await modificar()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      estado === 409
        ? 'Ya existe un curso'
        : estado === 404
          ? 'ya no están disponibles'
          : 'No pudimos guardar',
    )
    expect(screen.getByLabelText('Código')).toHaveValue(' icc202 ')
    expect(
      screen.queryByRole('button', { name: 'Confirmar y guardar' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument()
  },
)

test('muestra responsable, fecha y valores anteriores del historial', async () => {
  preparar({ historial: [CAMBIO] })
  const historial = await screen.findByRole('region', {
    name: 'Historial de cambios',
  })
  expect(
    await within(historial).findByText(/Anterior: ICC101 → Nuevo: ICC202/),
  ).toBeInTheDocument()
  expect(
    within(historial).getByText(
      /Anterior: Ingeniería Informática → Nuevo: Ingeniería Civil/,
    ),
  ).toBeInTheDocument()
  expect(
    within(historial).getByText(/Anterior: 2026-2 → Nuevo: 2027-1/),
  ).toBeInTheDocument()
  expect(
    within(historial).getByText(/Administrativo Ingeniería Norte/),
  ).toBeInTheDocument()
  expect(historial.querySelector('time')).toHaveAttribute(
    'datetime',
    CAMBIO.fecha,
  )
})

test('mientras guarda no permite confirmar dos veces ni volver a editar', async () => {
  let terminar!: (res: Response) => void
  const fetch = preparar({
    responder: (ruta, init) =>
      init?.method === 'PATCH'
        ? new Promise((resolve) => {
            terminar = resolve
          })
        : Promise.resolve(
            ruta === '/api/carreras'
              ? json(CARRERAS)
              : ruta === '/api/periodos'
                ? json(PERIODOS)
                : ruta.endsWith('/historial')
                  ? json([])
                  : json(CURSO),
          ),
  })
  await modificar()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() => expect(terminar).toBeDefined())
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeDisabled()
  await act(async () => terminar(json(NUEVO)))
  expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(1)
})

test.each<Rol>(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s no accede al formulario por URL directa',
  async (rol) => {
    const fetch = preparar({ rol })
    await screen.findByRole('navigation', { name: 'Navegación principal' })
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Datos del curso' }),
      ).not.toBeInTheDocument(),
    )
    if (rol === 'ALUMNO') {
      await screen.findByText('No tienes inscripciones en el período activo.')
    }
    expect(
      fetch.mock.calls.some(
        ([ruta]) => ruta.endsWith('/edicion') || ruta.endsWith('/historial'),
      ),
    ).toBe(false)
  },
)
