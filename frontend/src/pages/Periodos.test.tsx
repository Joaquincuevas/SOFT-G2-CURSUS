import type { Periodo, Rol } from '@cursus/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  json,
  renderApp,
  simularBackend,
  usuarioDePrueba,
} from '../test/sesion'

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

// Backend simulado con el listado en memoria: tras guardar, el listado que se
// vuelve a pedir ya trae el cambio. `escribir` responde a POST y PATCH.
function preparar(
  inicial: Periodo[],
  escribir: (
    ruta: string,
    init: RequestInit,
    lista: Periodo[],
  ) => Promise<Response> | Response = (ruta, init, lista) => {
    const activo = init.body ? JSON.parse(init.body as string).activo : true
    const creado: Periodo = ruta.endsWith('/activar')
      ? { ...NUEVO, activo: true }
      : { ...NUEVO, activo }
    lista.splice(
      0,
      lista.length,
      ...lista
        .filter((p) => p.id !== creado.id)
        .map((p) => (creado.activo ? { ...p, activo: false } : p)),
      creado,
    )
    return json(creado, ruta.endsWith('/activar') ? 200 : 201)
  },
  rol: Rol = 'ADMINISTRATIVO',
) {
  const lista = [...inicial]
  const fetch = vi.fn((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/auth/yo')
      return Promise.resolve(json(usuarioDePrueba(rol)))
    if (init?.method) return Promise.resolve(escribir(ruta, init, lista))
    return Promise.resolve(json(lista))
  })
  vi.stubGlobal('fetch', fetch)
  renderApp('/periodos', 'jwt-de-prueba')
  return fetch
}

const abrirNuevo = async () => {
  const boton = await screen.findByRole('button', { name: 'Nuevo período' })
  // Deshabilitado hasta que llega el listado: un clic antes no abre nada.
  await waitFor(() => expect(boton).toBeEnabled())
  fireEvent.click(boton)
  return within(await screen.findByRole('dialog', { name: 'Nuevo período' }))
}
const llenar = (d: ReturnType<typeof within>) => {
  fireEvent.change(d.getByLabelText(/^Año/), { target: { value: '2027' } })
  fireEvent.change(d.getByLabelText(/^Semestre/), { target: { value: '1' } })
  fireEvent.change(d.getByLabelText(/^Fecha de inicio/), {
    target: { value: NUEVO.fechaInicio },
  })
  fireEvent.change(d.getByLabelText(/^Fecha de término/), {
    target: { value: NUEVO.fechaTermino },
  })
}
const sinDialogo = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

test('muestra carga y estado vacío; «Nuevo período» espera al listado', async () => {
  let terminar!: (res: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn((ruta: string) =>
      ruta === '/api/auth/yo'
        ? Promise.resolve(json(usuarioDePrueba('ADMINISTRATIVO')))
        : new Promise<Response>((resolve) => {
            terminar = resolve
          }),
    ),
  )
  renderApp('/periodos', 'jwt-de-prueba')
  expect(await screen.findByText('Cargando períodos…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nuevo período' })).toBeDisabled()
  await waitFor(() => expect(terminar).toBeDefined())
  await act(async () => terminar(json([])))
  expect(
    await screen.findByText('Aún no hay períodos en tu universidad.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nuevo período' })).toBeEnabled()
})

test('lista las fechas sin desfase y el formulario no está en la página', async () => {
  preparar([INICIAL])
  expect(await screen.findByText('01/08/2026')).toBeInTheDocument()
  expect(screen.getByText('20/12/2026')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/^Año/)).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Actualizar listado' }),
  ).toBeNull()
})

test.each([
  ['Inicio', '01/08/2026'],
  ['Término', '20/12/2026'],
  ['Estado', 'Inactivo'],
])('ordena el listado por %s', async (columna, primera) => {
  preparar([NUEVO, INICIAL])
  await screen.findByText('01/08/2026')
  fireEvent.click(screen.getByRole('button', { name: columna }))
  expect(screen.getByRole('columnheader', { name: columna })).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  const filas = within(screen.getByRole('table')).getAllByRole('row')
  expect(filas[1]).toHaveTextContent(primera)
})

test('crea un período inactivo en el diálogo, que se cierra, refresca el listado y avisa', async () => {
  const fetch = preparar([INICIAL])
  await screen.findByText('2026-2')
  const dialogo = await abrirNuevo()
  expect(dialogo.getByLabelText(/^Año/)).toHaveFocus()
  llenar(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
  expect(await screen.findByText('Período creado')).toBeInTheDocument()
  await sinDialogo()
  const listado = await screen.findByRole('table')
  expect(await within(listado).findByText('2027-1')).toBeInTheDocument()
  expect(within(listado).getAllByText('Activo')).toHaveLength(1)
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
    const fetch = preparar([INICIAL, NUEVO])
    await screen.findByText('2027-1')
    if (accion === 'crear') {
      const dialogo = await abrirNuevo()
      llenar(dialogo)
      fireEvent.click(dialogo.getByLabelText('Marcar como activo'))
      fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
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
      within(screen.getByRole('banner')).getByText('Semestre 2027-1'),
    ).toBeInTheDocument()
    await waitFor(() => {
      const filas = within(screen.getByRole('table')).getAllByRole('row')
      expect(within(filas[1]).getByText('2027-1')).toBeInTheDocument()
      expect(within(filas[1]).getByText('Activo')).toBeInTheDocument()
      expect(within(filas[2]).getByText('Inactivo')).toBeInTheDocument()
    })
    if (accion === 'activar')
      expect(fetch).toHaveBeenCalledWith(
        '/api/periodos/nuevo/activar',
        expect.objectContaining({ method: 'PATCH' }),
      )
  },
)

test.each(['2027-03-01', '2027-02-28'])(
  'rechaza fecha final %s dentro del diálogo, sin enviar POST',
  async (fin) => {
    const fetch = preparar([INICIAL])
    await screen.findByText('2026-2')
    const dialogo = await abrirNuevo()
    llenar(dialogo)
    fireEvent.change(dialogo.getByLabelText(/^Fecha de término/), {
      target: { value: fin },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'La fecha de término debe ser posterior a la de inicio',
    )
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
      false,
    )
  },
)

test.each([409, 400, 500])(
  'un %s al crear se avisa dentro del diálogo, que sigue abierto con lo escrito',
  async (status) => {
    preparar([INICIAL], () => json({}, status))
    await screen.findByText('2026-2')
    const dialogo = await abrirNuevo()
    llenar(dialogo)
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      status === 409 ? 'Ya existe un período' : 'No pudimos guardar el período',
    )
    expect(dialogo.getByLabelText(/^Año/)).toHaveValue(2027)
    expect(dialogo.getByLabelText(/^Fecha de término/)).toHaveValue(
      NUEVO.fechaTermino,
    )
    expect(screen.queryByText('Período creado')).not.toBeInTheDocument()
    // El diálogo deja el resto de la página oculta para los lectores.
    expect(
      within(screen.getByRole('table', { hidden: true })).getAllByText(
        'Activo',
      ),
    ).toHaveLength(1)
  },
)

test('un fallo de activación conserva el activo anterior y permite reintentar', async () => {
  preparar([INICIAL, NUEVO], () => json({}, 500))
  await screen.findByText('2027-1')
  fireEvent.click(
    screen.getByRole('button', { name: 'Activar período 2027-1' }),
  )
  expect(
    await screen.findByText(
      'No pudimos activar el período. Inténtalo nuevamente.',
    ),
  ).toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByText('Activo')).toHaveLength(
    1,
  )
  expect(
    screen.getByRole('button', { name: 'Activar período 2027-1' }),
  ).toBeEnabled()
})

test('mientras se activa un período, «Nuevo período» queda deshabilitado', async () => {
  let terminar!: (res: Response) => void
  preparar(
    [INICIAL, NUEVO],
    () =>
      new Promise<Response>((resolve) => {
        terminar = resolve
      }),
  )
  await screen.findByText('2027-1')
  const nuevo = screen.getByRole('button', { name: 'Nuevo período' })
  expect(nuevo).toBeEnabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Activar período 2027-1' }),
  )
  await waitFor(() => expect(terminar).toBeDefined())
  expect(nuevo).toBeDisabled()
  fireEvent.click(nuevo)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => terminar(json({ ...NUEVO, activo: true })))
  expect(
    await screen.findByText('Período activo actualizado'),
  ).toBeInTheDocument()
  await waitFor(() => expect(nuevo).toBeEnabled())
})

test('reintenta una carga fallida y avisa el error de conexión al guardar en el diálogo', async () => {
  let intento = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((ruta: string, init?: RequestInit) => {
      if (ruta === '/api/auth/yo')
        return Promise.resolve(json(usuarioDePrueba('ADMINISTRATIVO')))
      if (init?.method) return Promise.reject(new TypeError('offline'))
      return ++intento === 1
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(json([INICIAL]))
    }),
  )
  renderApp('/periodos', 'jwt-de-prueba')
  expect(
    await screen.findByText('No pudimos cargar los períodos.'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await screen.findByText('2026-2')
  const dialogo = await abrirNuevo()
  llenar(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent(
    'Comprueba tu conexión',
  )
  expect(dialogo.getByLabelText(/^Año/)).toHaveValue(2027)
})

test('mientras guarda deshabilita el botón y no deja cerrar', async () => {
  let terminar!: (res: Response) => void
  preparar(
    [INICIAL],
    () =>
      new Promise<Response>((resolve) => {
        terminar = resolve
      }),
  )
  await screen.findByText('2026-2')
  const dialogo = await abrirNuevo()
  llenar(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: 'Crear período' }))
  await waitFor(() => expect(terminar).toBeDefined())
  expect(dialogo.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
  expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  await act(async () => terminar(json({ ...NUEVO }, 201)))
  expect(await screen.findByText('Período creado')).toBeInTheDocument()
})

test('con datos escritos, cerrar pide confirmar; sin ellos cierra directo', async () => {
  preparar([INICIAL])
  await screen.findByText('2026-2')
  let dialogo = await abrirNuevo()
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await sinDialogo()
  dialogo = await abrirNuevo()
  fireEvent.change(dialogo.getByLabelText(/^Año/), {
    target: { value: '2030' },
  })
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Descartar',
    }),
  )
  await sinDialogo()
})

test.each<Rol>(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s no ve la sección ni puede abrirla directamente',
  async (rol) => {
    const fetch = simularBackend(rol)
    renderApp('/periodos', 'jwt-de-prueba')
    await screen.findByRole('navigation', { name: 'Navegación principal' })
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
        'Períodos académicos',
      ),
    )
    expect(
      screen.queryByRole('link', { name: 'Períodos' }),
    ).not.toBeInTheDocument()
    if (rol === 'DIRECTOR') {
      expect(
        await screen.findByRole('list', { name: 'Indicadores' }),
      ).toBeInTheDocument()
    }
    expect(fetch.mock.calls.some(([ruta]) => ruta === '/api/periodos')).toBe(
      false,
    )
  },
)
