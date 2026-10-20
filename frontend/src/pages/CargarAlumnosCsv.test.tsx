import type { ResultadoCargaAlumnos, Rol } from '@cursus/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { json, renderApp, usuarioDePrueba } from '../test/sesion'

const CURSO = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraNombre: 'Informática',
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  secciones: [
    {
      id: 's1',
      numero: 1,
      horario: null,
      profesor: null,
      ayudantes: [],
      alumnos: 0,
    },
  ],
}
const RESULTADO: ResultadoCargaAlumnos = {
  total: 3,
  cargados: 2,
  errores: 1,
  filas: [
    {
      fila: 2,
      correo: 'ana@u.cl',
      estado: 'cargado',
      cuentaCreada: true,
      passwordProvisoria: 'password-solo-test',
      alumno: { id: 'a1', nombre: 'Ana', correo: 'ana@u.cl' },
    },
    {
      fila: 3,
      correo: 'beto@u.cl',
      estado: 'cargado',
      cuentaCreada: false,
      alumno: { id: 'a2', nombre: 'Beto', correo: 'beto@u.cl' },
    },
    { fila: 4, correo: 'mal', estado: 'error', mensaje: 'Correo inválido' },
  ],
}
async function abrir(
  responder: (init?: RequestInit) => Promise<Response> = () =>
    Promise.resolve(json(RESULTADO)),
  rol: Rol = 'ADMINISTRATIVO',
) {
  const fetch = vi.fn((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/auth/yo')
      return Promise.resolve(json(usuarioDePrueba(rol)))
    if (ruta === '/api/cursos/curso-1') return Promise.resolve(json(CURSO))
    if (ruta === '/api/secciones/s1/alumnos/csv') return responder(init)
    return Promise.resolve(json([]))
  })
  vi.stubGlobal('fetch', fetch)
  renderApp('/cursos/curso-1', 'jwt-de-prueba')
  await screen.findByRole('navigation', { name: 'Navegación principal' })
  if (rol === 'ADMINISTRATIVO')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cargar CSV en la sección 1' }),
    )
  return fetch
}
function seleccionar(
  texto = 'correo,nombre\nana@u.cl,Ana',
  lectura?: () => Promise<ArrayBuffer>,
) {
  const file = new File([texto], 'alumnos.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', {
    value:
      lectura ??
      (() => Promise.resolve(new TextEncoder().encode(texto).buffer)),
  })
  fireEvent.change(screen.getByLabelText('Archivo CSV'), {
    target: { files: [file] },
  })
}

test('ofrece plantilla y formato; cancelar no envía ninguna carga', async () => {
  const fetch = await abrir()
  expect(
    screen.getByRole('link', { name: 'Descargar plantilla CSV' }),
  ).toHaveAttribute('href', '/plantilla-alumnos.csv')
  expect(
    screen.getByRole('link', { name: 'Descargar plantilla CSV' }),
  ).toHaveAttribute('download')
  expect(screen.getByText(/CSV UTF-8/)).toBeInTheDocument()
  expect(screen.getByLabelText('Archivo CSV')).toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  )
})

test('envía el CSV con sesión, muestra resumen y errores y actualiza el conteo de la sección', async () => {
  const fetch = await abrir()
  seleccionar()
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  expect(
    await screen.findByText('Se cargaron 2 de 3 alumnos. Filas con error: 1.'),
  ).toBeInTheDocument()
  expect(screen.getByText('Correo inválido')).toBeInTheDocument()
  expect(screen.getByText('password-solo-test')).toBeInTheDocument()
  expect(screen.getByText('Cuenta vinculada a la sección.')).toBeInTheDocument()
  const pedido = fetch.mock.calls.find(([ruta]) => ruta.endsWith('/csv'))!
  expect(pedido[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ csv: 'correo,nombre\nana@u.cl,Ana' }),
  })
  expect(new Headers(pedido[1]?.headers).get('Authorization')).toBe(
    'Bearer jwt-de-prueba',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(
    screen.getByRole('link', { name: 'Ver los 2 alumnos de la sección 1' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('password-solo-test')).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar CSV en la sección 1' }),
  )
  expect(screen.queryByText('password-solo-test')).not.toBeInTheDocument()
})

test('copia la contraseña sin persistirla', async () => {
  const copiar = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copiar },
  })
  await abrir()
  seleccionar()
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Copiar contraseña de ana@u.cl',
    }),
  )
  expect(await screen.findByText('Contraseña copiada.')).toBeInTheDocument()
  expect(copiar).toHaveBeenCalledWith('password-solo-test')
  expect(localStorage.length).toBe(0)
})

test.each([400, 404, 413, 500])(
  'un error HTTP %s no muestra éxito ni aumenta el conteo',
  async (status) => {
    await abrir(() =>
      Promise.resolve(json({ message: 'CSV rechazado' }, status)),
    )
    seleccionar()
    fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      status < 500 ? 'CSV rechazado' : 'No se pudo iniciar',
    )
    expect(screen.queryByText(/Se cargaron/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar alumnos' })).toBeEnabled()
  },
)

test('un error de red explica que puede haber filas cargadas', async () => {
  await abrir(() => Promise.reject(new Error('red')))
  seleccionar()
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Algunas filas podrían haberse cargado',
  )
})

test('rechaza archivo grande y UTF-8 inválido antes de enviar', async () => {
  const fetch = await abrir()
  seleccionar('a'.repeat(48 * 1024 + 1))
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('48 KiB')
  seleccionar('a', () => Promise.resolve(new Uint8Array([255]).buffer))
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('CSV UTF-8')
  expect(fetch.mock.calls.some(([ruta]) => ruta.endsWith('/csv'))).toBe(false)
})

test('no permite otra carga ni cerrar el diálogo mientras espera el resultado', async () => {
  let terminar!: (respuesta: Response) => void
  await abrir(
    () =>
      new Promise((resolve) => {
        terminar = resolve
      }),
  )
  seleccionar()
  fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
  await waitFor(() => expect(terminar).toBeDefined())
  expect(screen.getByRole('button', { name: 'Cargar alumnos' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  const cancel = new Event('cancel', { cancelable: true })
  fireEvent(screen.getByRole('dialog'), cancel)
  expect(cancel.defaultPrevented).toBe(true)
  await act(async () =>
    terminar(
      json({ total: 1, cargados: 0, errores: 1, filas: [RESULTADO.filas[2]] }),
    ),
  )
  expect(
    await screen.findByText('Se cargaron 0 de 1 alumnos. Filas con error: 1.'),
  ).toBeInTheDocument()
})

test('el Director no ve el botón CSV en el detalle', async () => {
  await abrir(undefined, 'DIRECTOR')
  const secciones = await screen.findByRole('table', { name: 'Secciones' })
  expect(
    within(secciones).queryByRole('button', { name: /Cargar CSV/ }),
  ).not.toBeInTheDocument()
})
