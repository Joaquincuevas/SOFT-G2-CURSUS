import type { Periodo, Rol } from '@cursus/shared'
import { act, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { json, renderApp, usuarioDePrueba } from '../test/sesion'

const INICIAL: Periodo = {
  id: 'inicial',
  anio: 2026,
  semestre: 2,
  fechaInicio: '2026-08-01',
  fechaTermino: '2026-12-20',
  activo: true,
}
const NUEVO: Periodo = {
  id: 'nuevo',
  anio: 2027,
  semestre: 1,
  fechaInicio: '2027-03-01',
  fechaTermino: '2027-07-15',
  activo: false,
}
function preparar(
  responder: (ruta: string, init?: RequestInit) => Promise<Response>,
  rol: Rol = 'ADMINISTRATIVO',
) {
  const fetch = vi.fn((ruta: string, init?: RequestInit) =>
    ruta === '/api/auth/yo'
      ? Promise.resolve(json(usuarioDePrueba(rol)))
      : responder(ruta, init),
  )
  vi.stubGlobal('fetch', fetch)
  renderApp('/periodos', 'jwt-de-prueba')
  return fetch
}
function llenar() {
  fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2027' } })
  fireEvent.change(screen.getByLabelText('Semestre'), {
    target: { value: '1' },
  })
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
    target: { value: NUEVO.fechaInicio },
  })
  fireEvent.change(screen.getByLabelText('Fecha de término'), {
    target: { value: NUEVO.fechaTermino },
  })
}

test('muestra carga, estado vacío y campos obligatorios', async () => {
  let terminar!: (res: Response) => void
  preparar(
    () =>
      new Promise((resolve) => {
        terminar = resolve
      }),
  )
  expect(await screen.findByText('Cargando períodos…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Crear período' })).toBeDisabled()
  await waitFor(() => expect(terminar).toBeDefined())
  await act(async () => terminar(json([])))
  expect(
    await screen.findByText(
      'Aún no hay períodos en tu universidad. Crea el primero.',
    ),
  ).toBeInTheDocument()
  for (const campo of [
    'Año',
    'Semestre',
    'Fecha de inicio',
    'Fecha de término',
  ])
    expect(screen.getByLabelText(campo)).toBeRequired()
  expect(screen.getByRole('button', { name: 'Crear período' })).toBeEnabled()
})

test('lista fechas sin desfase y crea un período inactivo con el token de sesión', async () => {
  const fetch = preparar((_ruta, init) =>
    Promise.resolve(
      init?.method === 'POST' ? json(NUEVO, 201) : json([INICIAL]),
    ),
  )
  expect(await screen.findByText('01/08/2026')).toBeInTheDocument()
  llenar()
  fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
  expect(await screen.findByText('Período creado')).toBeInTheDocument()
  const listado = screen.getByRole('table')
  expect(within(listado).getByText('2027-1')).toBeInTheDocument()
  expect(within(listado).getAllByText('Activo')).toHaveLength(1)
  expect(screen.getByLabelText('Año')).toHaveValue(null)
  const peticion = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(peticion[1]!.body as string)).toEqual({
    anio: 2027,
    semestre: 1,
    fechaInicio: NUEVO.fechaInicio,
    fechaTermino: NUEVO.fechaTermino,
    activo: false,
  })
  expect(new Headers(peticion[1]!.headers).get('Authorization')).toBe(
    'Bearer jwt-de-prueba',
  )
})

test.each(['crear', 'activar'])(
  '%s activo desactiva el anterior y actualiza el semestre del encabezado',
  async (accion) => {
    const fetch = preparar((_ruta, init) =>
      Promise.resolve(
        init?.method
          ? json({ ...NUEVO, activo: true }, accion === 'crear' ? 201 : 200)
          : json([INICIAL, NUEVO]),
      ),
    )
    await screen.findByText('2027-1')
    if (accion === 'crear') {
      llenar()
      fireEvent.click(screen.getByLabelText('Marcar como activo'))
      fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
    } else
      fireEvent.click(
        screen.getByRole('button', { name: 'Activar período 2027-1' }),
      )
    expect(
      await screen.findByText(
        accion === 'crear' ? 'Período creado' : 'Período activo actualizado',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Universidad Demo Norte · Semestre 2027-1'),
    ).toBeInTheDocument()
    const filas = within(screen.getByRole('table')).getAllByRole('row')
    expect(within(filas[1]).getByText('2027-1')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Activo')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Inactivo')).toBeInTheDocument()
    if (accion === 'activar')
      expect(fetch).toHaveBeenCalledWith(
        '/api/periodos/nuevo/activar',
        expect.objectContaining({ method: 'PATCH' }),
      )
  },
)

test.each(['2027-03-01', '2027-02-28'])(
  'rechaza fecha final %s sin enviar POST',
  async (fin) => {
    const fetch = preparar(() => Promise.resolve(json([INICIAL])))
    await screen.findByText('2026-2')
    llenar()
    fireEvent.change(screen.getByLabelText('Fecha de término'), {
      target: { value: fin },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha de término debe ser posterior a la de inicio',
    )
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
      false,
    )
  },
)

test.each([409, 400, 500])(
  'un error %s conserva el formulario y no altera el activo',
  async (estado) => {
    preparar((_ruta, init) =>
      Promise.resolve(
        init?.method === 'POST' ? json({}, estado) : json([INICIAL]),
      ),
    )
    await screen.findByText('2026-2')
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      estado === 409 ? 'Ya existe un período' : 'No pudimos guardar',
    )
    expect(screen.getByLabelText('Año')).toHaveValue(2027)
    expect(screen.getByLabelText('Fecha de término')).toHaveValue(
      NUEVO.fechaTermino,
    )
    expect(
      within(screen.getByRole('table')).getAllByText('Activo'),
    ).toHaveLength(1)
    expect(screen.queryByText('Período creado')).not.toBeInTheDocument()
  },
)

test('un fallo de activación conserva el activo anterior y permite reintentar', async () => {
  preparar((_ruta, init) =>
    Promise.resolve(
      init?.method === 'PATCH' ? json({}, 404) : json([INICIAL, NUEVO]),
    ),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Activar período 2027-1' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El período ya no está disponible',
  )
  expect(
    screen.getByRole('button', { name: 'Activar período 2027-1' }),
  ).toBeEnabled()
  expect(
    screen.queryByText('Período activo actualizado'),
  ).not.toBeInTheDocument()
})

test('reintenta una carga fallida y muestra error de conexión al guardar', async () => {
  let cargas = 0
  preparar((_ruta, init) =>
    init?.method
      ? Promise.reject(new Error('sin red'))
      : ++cargas === 1
        ? Promise.resolve(json({}, 503))
        : Promise.resolve(json([INICIAL])),
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  await screen.findByText('2026-2')
  llenar()
  fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Comprueba tu conexión',
  )
  expect(screen.getByLabelText('Año')).toHaveValue(2027)
})

test('impide envíos y activaciones adicionales mientras guarda', async () => {
  let terminar!: (res: Response) => void
  preparar((_ruta, init) =>
    init?.method
      ? new Promise((resolve) => {
          terminar = resolve
        })
      : Promise.resolve(json([INICIAL, NUEVO])),
  )
  await screen.findByText('2027-1')
  llenar()
  fireEvent.click(screen.getByRole('button', { name: 'Crear período' }))
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Activar período 2027-1' }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Actualizar listado' }),
  ).toBeDisabled()
  await act(async () => terminar(json(NUEVO, 201)))
  expect(await screen.findByText('Período creado')).toBeInTheDocument()
})

test.each<Rol>(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s no ve la sección ni puede abrirla directamente',
  async (rol) => {
    const fetch = preparar(() => Promise.resolve(json([])), rol)
    await screen.findByRole('navigation', { name: 'Navegación principal' })
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
        'Períodos académicos',
      ),
    )
    expect(
      screen.queryByRole('link', { name: 'Períodos' }),
    ).not.toBeInTheDocument()
    expect(fetch.mock.calls.some(([ruta]) => ruta === '/api/periodos')).toBe(
      false,
    )
  },
)
