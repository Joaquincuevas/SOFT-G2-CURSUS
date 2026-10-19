import type { Carrera, Rol } from '@cursus/shared'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp, usuarioDePrueba } from '../test/sesion'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })
const INICIAL = { id: 'carrera-inicial', nombre: 'Ingeniería de Sistemas' }

function preparar(
  responder: (ruta: string, init?: RequestInit) => Promise<Response>,
  rol: Rol = 'ADMINISTRATIVO',
) {
  const fetch = vi.fn((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/auth/yo')
      return Promise.resolve(json(usuarioDePrueba(rol)))
    if (ruta === '/api/auth/logout')
      return Promise.resolve(new Response(null, { status: 204 }))
    return responder(ruta, init)
  })
  vi.stubGlobal('fetch', fetch)
  renderApp('/carreras', 'jwt-de-prueba')
  return fetch
}

test('muestra carga y luego estado vacío sin habilitar una creación prematura', async () => {
  let terminar!: (res: Response) => void
  preparar(
    () =>
      new Promise<Response>((resolve) => {
        terminar = resolve
      }),
  )
  expect(await screen.findByText('Cargando carreras…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Crear carrera' })).toBeDisabled()
  await act(async () => terminar(json([])))
  expect(
    await screen.findByText(
      'Aún no hay carreras en tu facultad. Crea la primera.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Crear carrera' })).toBeEnabled()
})

test('lista y crea enviando únicamente el nombre normalizado y el token de sesión', async () => {
  const fetch = preparar((_ruta, init) =>
    Promise.resolve(
      init?.method === 'POST'
        ? json({ id: 'nueva', nombre: 'Nueva Carrera' }, 201)
        : json([INICIAL]),
    ),
  )
  expect(await screen.findByText(INICIAL.nombre)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: '  Nueva   Carrera  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))
  expect(await screen.findByText('Carrera creada')).toBeInTheDocument()
  expect(screen.getByText('Nueva Carrera')).toBeInTheDocument()
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveValue('')
  expect(fetch).toHaveBeenCalledWith(
    '/api/carreras',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nombre: 'Nueva Carrera' }),
    }),
  )
  const peticion = fetch.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  )?.[1]
  const headers = new Headers(peticion?.headers)
  expect(headers.get('Content-Type')).toBe('application/json')
  expect(headers.get('Authorization')).toBe('Bearer jwt-de-prueba')
})

test('edita la carrera seleccionada y actualiza el listado', async () => {
  const fetch = preparar((_ruta, init) =>
    Promise.resolve(
      init?.method === 'PATCH'
        ? json({ ...INICIAL, nombre: 'Ingeniería Actualizada' })
        : json([INICIAL]),
    ),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: `Editar ${INICIAL.nombre}` }),
  )
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveValue(
    INICIAL.nombre,
  )
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: 'Ingeniería Actualizada' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  expect(screen.queryByText(INICIAL.nombre)).not.toBeInTheDocument()
  expect(screen.getByText('Ingeniería Actualizada')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    `/api/carreras/${INICIAL.id}`,
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ nombre: 'Ingeniería Actualizada' }),
    }),
  )
})

test('un duplicado no borra el nombre escrito ni modifica el listado', async () => {
  preparar((_ruta, init) =>
    Promise.resolve(init?.method === 'POST' ? json({}, 409) : json([INICIAL])),
  )
  await screen.findByText(INICIAL.nombre)
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: INICIAL.nombre },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Ya existe una carrera con ese nombre en tu facultad',
  )
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveValue(
    INICIAL.nombre,
  )
  expect(
    screen.getByLabelText('Nombre de la carrera'),
  ).toHaveAccessibleDescription(
    'Ya existe una carrera con ese nombre en tu facultad',
  )
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.queryByText('Carrera creada')).not.toBeInTheDocument()
})

test('puede reintentar una carga que falla por conexión', async () => {
  let intento = 0
  preparar(() =>
    ++intento === 1
      ? Promise.reject(new TypeError('offline'))
      : Promise.resolve(json([INICIAL])),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No pudimos cargar las carreras',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText(INICIAL.nombre)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('no informa éxito ni pierde el formulario al fallar el guardado por conexión', async () => {
  preparar((_ruta, init) =>
    init?.method === 'POST'
      ? Promise.reject(new TypeError('offline'))
      : Promise.resolve(json([])),
  )
  await screen.findByText(
    'Aún no hay carreras en tu facultad. Crea la primera.',
  )
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: 'Nueva sin conexión' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Comprueba tu conexión',
  )
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveValue(
    'Nueva sin conexión',
  )
  expect(screen.getByRole('button', { name: 'Crear carrera' })).toBeEnabled()
})

test('cancelar edición vuelve al formulario de creación sin enviar cambios', async () => {
  const fetch = preparar(() => Promise.resolve(json([INICIAL])))
  fireEvent.click(
    await screen.findByRole('button', { name: `Editar ${INICIAL.nombre}` }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }))
  expect(
    screen.getByRole('form', { name: 'Nueva carrera' }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Nombre de la carrera')).toHaveValue('')
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
    false,
  )
})

test('rechaza espacios vacíos antes de enviar una creación', async () => {
  const fetch = preparar(() => Promise.resolve(json([])))
  await screen.findByText(
    'Aún no hay carreras en tu facultad. Crea la primera.',
  )
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: '   ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Ingresa el nombre',
  )
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  )
})

test.each<Rol>(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s no ve ni consulta la gestión de carreras',
  async (rol) => {
    const fetch = preparar(() => Promise.resolve(json([])), rol)
    expect(
      await screen.findByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Carreras' }),
    ).not.toBeInTheDocument()
    expect(
      fetch.mock.calls.some(([ruta]) => ruta.startsWith('/api/carreras')),
    ).toBe(false)
  },
)

test('deshabilita el guardado mientras una creación está pendiente', async () => {
  let terminar!: (res: Response) => void
  preparar((_ruta, init) =>
    init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          terminar = resolve
        })
      : Promise.resolve(json([])),
  )
  await screen.findByText(
    'Aún no hay carreras en tu facultad. Crea la primera.',
  )
  fireEvent.change(screen.getByLabelText('Nombre de la carrera'), {
    target: { value: 'Pendiente' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))
  await waitFor(() => expect(terminar).toBeDefined())
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  await act(async () =>
    terminar(
      json({ id: 'pendiente', nombre: 'Pendiente' } satisfies Carrera, 201),
    ),
  )
  expect(await screen.findByText('Carrera creada')).toBeInTheDocument()
})
