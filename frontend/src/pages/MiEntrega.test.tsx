import type {
  Actividad,
  MiEntregaActividad,
  Rol,
  SeccionResumen,
  SubidaArchivo,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const BASE = '/api/espacio/secciones/seccion-1'
const ENTREGA = `${BASE}/actividades/a1/mi-entrega`
const ARCHIVOS = `${BASE}/archivos`
const CONFIRMAR = `${ARCHIVOS}/f1/confirmar`
const S3 = 'https://s3.test/bucket'
const ACTIVIDAD: Actividad = {
  id: 'a1',
  titulo: 'Informe 1',
  instrucciones: 'Entregar informe',
  plazo: '2030-11-15T02:59:00.000Z',
  cerrada: false,
}
const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'c1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'p1', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [],
  profesor: { id: 'p1', nombre: 'Profesora' },
  profesores: ['Profesora'],
  ayudantes: [],
}
const ARCHIVO = {
  id: 'f1',
  nombre: 'Informe.pdf',
  tipo: 'application/pdf',
  tamano: 7,
  subidoEn: '2026-11-11T15:00:00.000Z',
}
const SUBIDA: SubidaArchivo = {
  archivo: { ...ARCHIVO, subidoEn: null },
  subida: {
    url: S3,
    campos: {
      key: 'u/s/f1',
      'Content-Type': 'application/pdf',
      policy: 'firmada',
    },
    expiraEn: '2030-11-15T02:59:00.000Z',
  },
}
const CONFIRMADA: MiEntregaActividad = {
  cerrada: false,
  entrega: {
    id: 'entrega-1',
    archivo: ARCHIVO,
    entregadaEn: '2026-11-11T15:01:42.000Z',
  },
}
async function abrir(
  rutas: Record<string, RutaSimulada> = {},
  actividad = ACTIVIDAD,
  rol: Rol = 'ALUMNO',
) {
  await renderConSesion(rol, VISTA, {
    [`${BASE}/resumen`]: () => ({ ...RESUMEN, rol }),
    [`${BASE}/actividades`]: () => [actividad],
    [ENTREGA]: (init) =>
      init?.method === 'PUT' ? CONFIRMADA : { entrega: null, cerrada: false },
    [ARCHIVOS]: () => json(SUBIDA, 201),
    [CONFIRMAR]: () => ARCHIVO,
    [S3]: () => new Response(null, { status: 204 }),
    ...rutas,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Entregas' }))
  const panel = within(
    await screen.findByRole('article', { name: 'Informe 1' }),
  )
  if (rol === 'ALUMNO')
    await waitFor(() =>
      expect(panel.queryByText('Cargando mi entrega…')).not.toBeInTheDocument(),
    )
  return panel
}
function elegir(
  panel: ReturnType<typeof within>,
  archivo = new File(['informe'], 'Informe.pdf', { type: 'application/pdf' }),
) {
  fireEvent.change(
    panel.getByLabelText(/Archivo del informe|Archivo de reemplazo/),
    { target: { files: [archivo] } },
  )
}
const peticiones = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) =>
      [ARCHIVOS, S3, CONFIRMAR, ENTREGA].includes(url as string),
    )

describe('MAT-09: entrega del alumno', () => {
  test('un fallo de conexión conserva el archivo y muestra un mensaje en español', async () => {
    const panel = await abrir({
      [S3]: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Comprueba tu conexión',
    )
    expect(
      panel.getByRole('button', { name: 'Entregar informe' }),
    ).toBeEnabled()
    expect(panel.queryByText('Entrega confirmada.')).not.toBeInTheDocument()
  })
  test('sube a S3, confirma, registra y muestra fecha y hora de Chile sin enviar el JWT al bucket', async () => {
    const panel = await abrir()
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    expect(await panel.findByText('Entrega confirmada.')).toBeInTheDocument()
    expect(panel.getByText(/Informe entregado/)).toBeInTheDocument()
    expect(panel.getByText('11-11-2026, 12:01:42')).toHaveAttribute(
      'datetime',
      CONFIRMADA.entrega!.entregadaEn,
    )
    expect(
      panel.getByRole('button', { name: 'Reemplazar entrega' }),
    ).toBeDisabled()
    const pasos = peticiones().filter(([, init]) => init?.method)
    expect(pasos.map(([url]) => url)).toEqual([
      ARCHIVOS,
      S3,
      CONFIRMAR,
      ENTREGA,
    ])
    expect(JSON.parse(pasos[0][1]!.body as string)).toEqual({
      nombre: 'Informe.pdf',
      tamano: 7,
    })
    const directo = pasos[1][1]!
    expect(directo.headers).toBeUndefined()
    expect(directo.credentials).toBeUndefined()
    const form = directo.body as FormData
    expect([...form.keys()]).toEqual(['key', 'Content-Type', 'policy', 'file'])
    expect((form.get('file') as File).name).toBe('Informe.pdf')
    expect(JSON.parse(pasos[3][1]!.body as string)).toEqual({ archivoId: 'f1' })
  })
  test('reemplaza y conserva la confirmación previa hasta que se acepta el nuevo informe', async () => {
    const anterior = {
      ...CONFIRMADA,
      entrega: {
        ...CONFIRMADA.entrega!,
        archivo: { ...ARCHIVO, id: 'viejo', nombre: 'Anterior.pdf' },
      },
    }
    const panel = await abrir({
      [ENTREGA]: (init) => (init?.method === 'PUT' ? CONFIRMADA : anterior),
    })
    expect(panel.getByText(/Anterior.pdf/)).toBeInTheDocument()
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Reemplazar entrega' }))
    expect(await panel.findByText('Entrega confirmada.')).toBeInTheDocument()
    expect(panel.queryByText(/Anterior.pdf/)).not.toBeInTheDocument()
    expect(panel.getByText(/Informe.pdf/)).toBeInTheDocument()
  })
  test.each(['tipo no permitido', 'vacío', 'sobre 20 MB'])(
    'rechaza un archivo %s antes de subir',
    async (caso) => {
      const panel = await abrir()
      const f = new File(
        caso === 'vacío' ? [] : ['informe'],
        caso === 'tipo no permitido' ? 'virus.exe' : 'Informe.pdf',
      )
      if (caso === 'sobre 20 MB')
        Object.defineProperty(f, 'size', { value: 20 * 1024 * 1024 + 1 })
      elegir(panel, f)
      fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
      expect(await panel.findByRole('alert')).toHaveTextContent('hasta 20 MB')
      expect(peticiones().filter(([, init]) => init?.method)).toHaveLength(0)
    },
  )
  test('una actividad cerrada conserva el comprobante y no ofrece subir ni reemplazar', async () => {
    const panel = await abrir(
      { [ENTREGA]: () => ({ ...CONFIRMADA, cerrada: true }) },
      { ...ACTIVIDAD, cerrada: true },
    )
    expect(panel.getByText(/Informe entregado/)).toBeInTheDocument()
    expect(
      panel.getByText(/No se aceptan nuevas entregas ni reemplazos/),
    ).toBeInTheDocument()
    expect(panel.queryByRole('form')).not.toBeInTheDocument()
  })
  test('si el plazo vence durante la subida no anuncia éxito y conserva la entrega anterior', async () => {
    let cerrada = false
    const panel = await abrir({
      [ENTREGA]: (init) => {
        if (init?.method === 'PUT') {
          cerrada = true
          return json(
            {
              message:
                'La actividad está cerrada. No se aceptan nuevas entregas ni reemplazos.',
            },
            409,
          )
        }
        return { ...CONFIRMADA, cerrada }
      },
    })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Reemplazar entrega' }))
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'La actividad está cerrada',
    )
    expect(panel.queryByText('Entrega confirmada.')).not.toBeInTheDocument()
    expect(panel.getByText('11-11-2026, 12:01:42')).toBeInTheDocument()
    expect(panel.queryByRole('form')).not.toBeInTheDocument()
  })
  test('reintenta una confirmación fallida sin volver a subir a S3', async () => {
    let confirmaciones = 0
    const panel = await abrir({
      [CONFIRMAR]: () => (++confirmaciones === 1 ? json({}, 500) : ARCHIVO),
    })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    await panel.findByRole('alert')
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    expect(await panel.findByText('Entrega confirmada.')).toBeInTheDocument()
    expect(peticiones().filter(([url]) => url === S3)).toHaveLength(1)
    expect(confirmaciones).toBe(2)
  })
  test('reintenta el registro fallido conservando los pasos ya completados', async () => {
    let registros = 0
    const panel = await abrir({
      [ENTREGA]: (init) =>
        init?.method === 'PUT'
          ? ++registros === 1
            ? json({}, 500)
            : CONFIRMADA
          : { entrega: null, cerrada: false },
    })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    await panel.findByRole('alert')
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    expect(await panel.findByText('Entrega confirmada.')).toBeInTheDocument()
    expect(peticiones().filter(([url]) => url === S3)).toHaveLength(1)
    expect(peticiones().filter(([url]) => url === CONFIRMAR)).toHaveLength(1)
    expect(registros).toBe(2)
  })
  test('una firma rechazada pide una nueva al reintentar', async () => {
    let subidas = 0
    const panel = await abrir({
      [S3]: () => new Response(null, { status: ++subidas === 1 ? 403 : 204 }),
    })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos subir',
    )
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    await panel.findByText('Entrega confirmada.')
    expect(peticiones().filter(([url]) => url === ARCHIVOS)).toHaveLength(2)
  })
  test('bloquea archivo y botón durante la subida y no acredita una entrega anticipadamente', async () => {
    let completar!: () => void
    const pendiente = new Promise<Response>((resolve) => {
      completar = () => resolve(new Response(null, { status: 204 }))
    })
    const panel = await abrir({ [S3]: () => pendiente })
    elegir(panel)
    fireEvent.click(panel.getByRole('button', { name: 'Entregar informe' }))
    await waitFor(() =>
      expect(
        panel.getByRole('button', { name: 'Subiendo archivo…' }),
      ).toBeDisabled(),
    )
    expect(panel.getByLabelText('Archivo del informe')).toBeDisabled()
    expect(panel.queryByText('Entrega confirmada.')).not.toBeInTheDocument()
    expect(
      peticiones().filter(
        ([url, init]) => url === ENTREGA && init?.method === 'PUT',
      ),
    ).toHaveLength(0)
    completar()
    await panel.findByText('Entrega confirmada.')
  })
  test('permite reintentar la consulta del comprobante', async () => {
    let intentos = 0
    const panel = await abrir({
      [ENTREGA]: () => (++intentos === 1 ? json({}, 500) : CONFIRMADA),
    })
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText(/Informe entregado/)).toBeInTheDocument()
  })
  test.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    '%s conserva las actividades sin consultar entregas propias',
    async (rol) => {
      const panel = await abrir({}, ACTIVIDAD, rol)
      expect(
        panel.queryByLabelText('Archivo del informe'),
      ).not.toBeInTheDocument()
      expect(peticiones().filter(([url]) => url === ENTREGA)).toHaveLength(0)
    },
  )
})
