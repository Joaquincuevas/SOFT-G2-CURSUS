import type { Carrera, Rol } from '@cursus/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

const abrirNueva = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Nueva carrera' }))
  return within(await screen.findByRole('dialog', { name: 'Nueva carrera' }))
}
const abrirEditar = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: `Editar ${INICIAL.nombre}` }),
  )
  return within(await screen.findByRole('dialog', { name: 'Editar carrera' }))
}
const sinDialogo = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

test('muestra carga y luego estado vacío; «Nueva carrera» espera al listado', async () => {
  let terminar!: (res: Response) => void
  preparar(
    () =>
      new Promise<Response>((resolve) => {
        terminar = resolve
      }),
  )
  expect(await screen.findByText('Cargando carreras…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nueva carrera' })).toBeDisabled()
  await waitFor(() => expect(terminar).toBeDefined())
  await act(async () => terminar(json([])))
  expect(
    await screen.findByText('Aún no hay carreras en tu facultad.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nueva carrera' })).toBeEnabled()
})

test('el formulario no está en la página: la tabla ocupa todo el ancho y no hay «Actualizar listado»', async () => {
  preparar(() => Promise.resolve(json([INICIAL])))
  expect(await screen.findByText(INICIAL.nombre)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Nombre de la carrera')).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Actualizar listado' }),
  ).toBeNull()
})

test('crea en un diálogo con el foco en el nombre, lo cierra, refresca el listado y avisa', async () => {
  let creada = false
  const fetch = preparar((_ruta, init) => {
    if (init?.method === 'POST') {
      creada = true
      return Promise.resolve(
        json({ id: 'nueva', nombre: 'Nueva Carrera' }, 201),
      )
    }
    return Promise.resolve(
      json(
        creada
          ? [INICIAL, { id: 'nueva', nombre: 'Nueva Carrera' }]
          : [INICIAL],
      ),
    )
  })
  const dialogo = await abrirNueva()
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveFocus()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: '  Nueva   Carrera  ' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear carrera' }))
  expect(await screen.findByText('Carrera creada')).toBeInTheDocument()
  await sinDialogo()
  expect(await screen.findByText('Nueva Carrera')).toBeInTheDocument()
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

test('edita con los datos precargados y actualiza el listado', async () => {
  let editada = false
  const fetch = preparar((_ruta, init) => {
    if (init?.method === 'PATCH') {
      editada = true
      return Promise.resolve(
        json({ ...INICIAL, nombre: 'Ingeniería Actualizada' }),
      )
    }
    return Promise.resolve(
      json([
        editada ? { ...INICIAL, nombre: 'Ingeniería Actualizada' } : INICIAL,
      ]),
    )
  })
  const dialogo = await abrirEditar()
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveValue(
    INICIAL.nombre,
  )
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveFocus()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: 'Ingeniería Actualizada' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Guardar cambios' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  await sinDialogo()
  expect(await screen.findByText('Ingeniería Actualizada')).toBeInTheDocument()
  expect(screen.queryByText(INICIAL.nombre)).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    `/api/carreras/${INICIAL.id}`,
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ nombre: 'Ingeniería Actualizada' }),
    }),
  )
})

test('un duplicado se avisa dentro del diálogo, que sigue abierto con lo escrito', async () => {
  preparar((_ruta, init) =>
    Promise.resolve(init?.method === 'POST' ? json({}, 409) : json([INICIAL])),
  )
  const dialogo = await abrirNueva()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: INICIAL.nombre },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear carrera' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent(
    'Ya existe una carrera con ese nombre en tu facultad',
  )
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveValue(
    INICIAL.nombre,
  )
  expect(screen.queryByText('Carrera creada')).not.toBeInTheDocument()
})

test('un fallo de conexión al guardar no informa éxito ni cierra el diálogo', async () => {
  preparar((_ruta, init) =>
    init?.method === 'POST'
      ? Promise.reject(new TypeError('offline'))
      : Promise.resolve(json([])),
  )
  const dialogo = await abrirNueva()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: 'Nueva sin conexión' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear carrera' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent(
    'Comprueba tu conexión',
  )
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveValue(
    'Nueva sin conexión',
  )
  expect(dialogo.getByRole('button', { name: 'Crear carrera' })).toBeEnabled()
})

test('puede reintentar una carga que falla por conexión', async () => {
  let intento = 0
  preparar(() =>
    ++intento === 1
      ? Promise.reject(new TypeError('offline'))
      : Promise.resolve(json([INICIAL])),
  )
  expect(
    await screen.findByText('No pudimos cargar las carreras.'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText(INICIAL.nombre)).toBeInTheDocument()
})

test('cancelar, Escape y la X cierran sin enviar nada cuando no hay cambios', async () => {
  const fetch = preparar(() => Promise.resolve(json([INICIAL])))
  let dialogo = await abrirEditar()
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await sinDialogo()
  dialogo = await abrirEditar()
  fireEvent.keyDown(dialogo.getByLabelText(/Nombre de la carrera/), {
    key: 'Escape',
  })
  await sinDialogo()
  dialogo = await abrirEditar()
  fireEvent.click(dialogo.getByRole('button', { name: 'Cerrar' }))
  await sinDialogo()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
    false,
  )
})

test('con cambios sin guardar pide confirmar antes de cerrar', async () => {
  preparar(() => Promise.resolve(json([INICIAL])))
  const dialogo = await abrirEditar()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: 'Otro nombre' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  const confirmacion = within(await screen.findByRole('alertdialog'))
  fireEvent.click(confirmacion.getByRole('button', { name: 'Seguir editando' }))
  expect(
    screen.getByRole('dialog', { name: 'Editar carrera' }),
  ).toBeInTheDocument()
  expect(dialogo.getByLabelText(/Nombre de la carrera/)).toHaveValue(
    'Otro nombre',
  )
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Descartar',
    }),
  )
  await sinDialogo()
})

test('rechaza espacios vacíos antes de enviar una creación', async () => {
  const fetch = preparar(() => Promise.resolve(json([])))
  const dialogo = await abrirNueva()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: '   ' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear carrera' }))
  expect(
    (await dialogo.findAllByText(/Ingresa el nombre/)).length,
  ).toBeGreaterThan(0)
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

test('mientras guarda deshabilita el botón, muestra el progreso y no deja cerrar', async () => {
  let terminar!: (res: Response) => void
  preparar((_ruta, init) =>
    init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          terminar = resolve
        })
      : Promise.resolve(json([])),
  )
  const dialogo = await abrirNueva()
  fireEvent.change(dialogo.getByLabelText(/Nombre de la carrera/), {
    target: { value: 'Pendiente' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear carrera' }))
  await waitFor(() => expect(terminar).toBeDefined())
  expect(dialogo.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  fireEvent.keyDown(dialogo.getByLabelText(/Nombre de la carrera/), {
    key: 'Escape',
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () =>
    terminar(
      json({ id: 'pendiente', nombre: 'Pendiente' } satisfies Carrera, 201),
    ),
  )
  expect(await screen.findByText('Carrera creada')).toBeInTheDocument()
})
