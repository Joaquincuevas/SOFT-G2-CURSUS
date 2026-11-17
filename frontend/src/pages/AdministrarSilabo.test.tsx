import type { VersionSilabo } from '@cursus/shared'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AdministrarSilabo } from './AdministrarSilabo'

// MAT-02 y MAT-03, aislado de la página: la sesión y la subida a S3 son
// simuladas, y cada test define qué responde cada ruta.
const { fetchConSesion, subirAS3 } = vi.hoisted(() => ({
  fetchConSesion: vi.fn(),
  subirAS3: vi.fn(),
}))
vi.mock('../auth/auth', () => ({ useAuth: () => ({ fetchConSesion }) }))
vi.mock('./subirArchivo', () => ({ subirAS3 }))

const RUTA = '/api/espacio/secciones/seccion-1'
const SILABO = `${RUTA}/silabo`
const ARCHIVOS = `${RUTA}/archivos`
const CONFIRMAR = `${ARCHIVOS}/archivo-1/confirmar`
const V1: VersionSilabo = {
  version: 1,
  responsable: 'Camila Rojas',
  subidoEn: '2026-08-03T12:00:00Z',
}
const V2: VersionSilabo = {
  version: 2,
  responsable: 'Camila Rojas',
  subidoEn: '2026-09-01T12:00:00Z',
}
const SUBIDA = {
  archivo: { id: 'archivo-1', nombre: 'programa.pdf' },
  subida: { url: 'https://s3.test/cursus-archivos', campos: {} },
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status })

type Respuesta = (init?: RequestInit) => Response

// Rutas por "MÉTODO url". Una ruta sin simular responde 404.
function simular(rutas: Record<string, Respuesta>) {
  fetchConSesion.mockImplementation((url: string, init?: RequestInit) => {
    const ruta = rutas[`${init?.method ?? 'GET'} ${url}`]
    return Promise.resolve(ruta ? ruta(init) : json({}, 404))
  })
}

let click: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  subirAS3.mockResolvedValue(undefined)
  // La descarga abre la URL firmada con un enlace; jsdom no navega.
  click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  fetchConSesion.mockReset()
  subirAS3.mockReset()
})

function elegirPdf() {
  const dialogo = within(screen.getByRole('dialog'))
  fireEvent.change(dialogo.getByLabelText('Sílabo (PDF, hasta 10 MiB)'), {
    target: {
      files: [
        new File(['%PDF-1.7'], 'programa.pdf', { type: 'application/pdf' }),
      ],
    },
  })
  return dialogo
}

test('el alumno descarga una versión del sílabo y ve el error si la descarga falla', async () => {
  simular({
    [`GET ${SILABO}`]: () => json([V2, V1]),
    [`GET ${SILABO}/2`]: () => json({ url: 'https://s3.test/silabo-v2' }),
    [`GET ${SILABO}/1`]: () => json({}, 500),
  })
  render(<AdministrarSilabo ruta={RUTA} puedePublicar={false} vistaAlumno />)

  fireEvent.click(
    await screen.findByRole('button', { name: 'Descargar versión 2' }),
  )
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  expect(fetchConSesion).toHaveBeenCalledWith(`${SILABO}/2`)

  fireEvent.click(screen.getByRole('button', { name: 'Descargar versión 1' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No pudimos descargar esa versión del sílabo.',
  )
  expect(click).toHaveBeenCalledTimes(1)
})

test('el profesor descarga la versión vigente y una anterior del historial', async () => {
  simular({
    [`GET ${SILABO}`]: () => json([V2, V1]),
    [`GET ${SILABO}/2`]: () => json({ url: 'https://s3.test/silabo-v2' }),
    [`GET ${SILABO}/1`]: () => json({ url: 'https://s3.test/silabo-v1' }),
  })
  render(<AdministrarSilabo ruta={RUTA} puedePublicar />)

  fireEvent.click(
    await screen.findByRole('button', { name: 'Descargar versión 2' }),
  )
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1))

  fireEvent.click(
    screen.getByRole('button', {
      name: /Historial de versiones \(1 anterior\)/,
    }),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Descargar versión 1' }),
  )
  await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
  expect(fetchConSesion).toHaveBeenCalledWith(`${SILABO}/1`)
})

test('al publicar muestra el error de cada paso y conserva el PDF ya confirmado', async () => {
  let preparar = json({}, 500)
  let confirmar = json({}, 500)
  let publicar: Response = json({}, 400)
  let historial = [V1]
  simular({
    [`GET ${SILABO}`]: () => json(historial),
    [`POST ${ARCHIVOS}`]: () => preparar,
    [`POST ${CONFIRMAR}`]: () => confirmar,
    [`POST ${SILABO}`]: () => publicar,
  })
  const alPublicar = vi.fn()
  render(
    <AdministrarSilabo ruta={RUTA} puedePublicar alPublicar={alPublicar} />,
  )

  fireEvent.click(
    await screen.findByRole('button', { name: 'Subir nueva versión' }),
  )
  const dialogo = elegirPdf()
  const enviar = () =>
    fireEvent.click(dialogo.getByRole('button', { name: 'Publicar sílabo' }))

  enviar()
  expect(
    await dialogo.findByText('No pudimos preparar la subida.'),
  ).toBeInTheDocument()

  preparar = json(SUBIDA, 201)
  enviar()
  expect(
    await dialogo.findByText('No pudimos confirmar el PDF.'),
  ).toBeInTheDocument()

  preparar = json(SUBIDA, 201)
  confirmar = json(SUBIDA.archivo)
  enviar()
  expect(
    await dialogo.findByText('El archivo confirmado no es un PDF válido.'),
  ).toBeInTheDocument()
  // El PDF ya está confirmado: el reintento no lo vuelve a subir.
  expect(subirAS3).toHaveBeenCalledTimes(2)

  publicar = json({}, 500)
  enviar()
  expect(
    await dialogo.findByText(
      'No pudimos publicar el sílabo. Inténtalo nuevamente.',
    ),
  ).toBeInTheDocument()
  expect(subirAS3).toHaveBeenCalledTimes(2)

  publicar = json(V2, 201)
  historial = [V2, V1]
  enviar()
  await waitFor(() => expect(alPublicar).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(await screen.findByText(/Versión 2 vigente/)).toBeInTheDocument()
})

test('si la subida a S3 falla sin un error, muestra un mensaje genérico', async () => {
  subirAS3.mockRejectedValue('sin conexión')
  simular({
    [`GET ${SILABO}`]: () => json([]),
    [`POST ${ARCHIVOS}`]: () => json(SUBIDA, 201),
  })
  render(<AdministrarSilabo ruta={RUTA} puedePublicar />)

  fireEvent.click(await screen.findByRole('button', { name: 'Subir sílabo' }))
  const dialogo = elegirPdf()
  fireEvent.click(dialogo.getByRole('button', { name: 'Publicar sílabo' }))
  expect(
    await dialogo.findByText('No pudimos subir el PDF.'),
  ).toBeInTheDocument()
})

test('Cancelar y Escape cierran el diálogo sin publicar', async () => {
  simular({ [`GET ${SILABO}`]: () => json([]) })
  render(<AdministrarSilabo ruta={RUTA} puedePublicar />)

  fireEvent.click(await screen.findByRole('button', { name: 'Subir sílabo' }))
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Cancelar',
    }),
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  fireEvent.click(screen.getByRole('button', { name: 'Subir sílabo' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fetchConSesion).toHaveBeenCalledTimes(1)
})
