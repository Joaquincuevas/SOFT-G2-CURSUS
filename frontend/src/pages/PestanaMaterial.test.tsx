import type {
  Material,
  Rol,
  SeccionResumen,
  SubidaArchivo,
} from '@cursus/shared'
import { TAMANO_MAXIMO_ARCHIVO } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const BASE = '/api/espacio/secciones/seccion-1'
const ARCHIVOS = `${BASE}/archivos`
const CONFIRMAR = `${ARCHIVOS}/archivo-1/confirmar`
const MATERIALES = `${BASE}/materiales`

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  profesores: ['Camila Rojas'],
  ayudantes: [],
}

const EXISTENTE: Material = {
  id: 'material-0',
  categoria: 'PRUEBA_ANTERIOR',
  titulo: 'Solemne 2025',
  descripcion: 'Con pauta.',
  archivo: {
    id: 'archivo-0',
    nombre: 'solemne.pdf',
    tipo: 'application/pdf',
    tamano: 2048,
    subidoEn: '2026-09-01T12:00:00.000Z',
  },
  creadoEn: '2026-09-01T12:00:00.000Z',
}

const SUBIDA: SubidaArchivo = {
  archivo: {
    id: 'archivo-1',
    nombre: 'guia.pdf',
    tipo: 'application/pdf',
    tamano: 5,
    subidoEn: null,
  },
  subida: {
    url: 'https://s3.test/cursus-archivos',
    campos: {
      key: 'u/s/archivo-1',
      'Content-Type': 'application/pdf',
      policy: 'p',
    },
    expiraEn: '2026-11-10T12:10:00.000Z',
  },
}

// XMLHttpRequest controlado por el test: no responde solo. El test informa el
// progreso y cómo termina la subida a S3.
class XhrFalso {
  static enviadas: XhrFalso[] = []
  metodo = ''
  url = ''
  cuerpo: FormData | null = null
  status = 0
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null

  open(metodo: string, url: string) {
    this.metodo = metodo
    this.url = url
  }
  send(cuerpo: FormData) {
    this.cuerpo = cuerpo
    XhrFalso.enviadas.push(this)
  }
  progreso(cargado: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: cargado, total })
  }
  terminar(status: number) {
    this.status = status
    this.onload?.()
  }
  fallar() {
    this.onerror?.()
  }
}

beforeEach(() => {
  XhrFalso.enviadas = []
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

interface Escenario {
  rol?: Rol
  materiales?: Material[]
  // Respuestas simuladas; por defecto, las del flujo exitoso.
  pedir?: () => unknown
  confirmar?: () => unknown
  registrar?: (init?: RequestInit) => unknown
  // GET del listado; por defecto, materiales.
  listar?: () => unknown
}

// Abre la pestaña Material de la sección. `llamadas` anota cada petición a la
// API, en orden, como "MÉTODO ruta".
async function abrirMaterial({
  rol = 'PROFESOR',
  materiales = [],
  pedir = () => json(SUBIDA, 201),
  confirmar = () => SUBIDA.archivo,
  registrar = () => json({ ...EXISTENTE, id: 'material-1' }, 201),
  listar = () => materiales,
}: Escenario = {}) {
  const llamadas: string[] = []
  const bodies: Record<string, unknown> = {}
  const anotar =
    (ruta: string, respuesta: (init?: RequestInit) => unknown) =>
    (init?: RequestInit) => {
      llamadas.push(`${init?.method ?? 'GET'} ${ruta}`)
      if (typeof init?.body === 'string') {
        bodies[`${init.method} ${ruta}`] = JSON.parse(init.body)
      }
      return respuesta(init)
    }
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ARCHIVOS]: anotar(ARCHIVOS, pedir),
    [CONFIRMAR]: anotar(CONFIRMAR, confirmar),
    [MATERIALES]: anotar(MATERIALES, (init) =>
      init?.method === 'POST' ? registrar(init) : listar(),
    ),
  })
  const pestana = await screen.findByRole('tab', { name: 'Material' })
  if (!(pestana as HTMLButtonElement).disabled) fireEvent.click(pestana)
  return { llamadas, bodies }
}

const panel = () => within(screen.getByRole('tabpanel', { name: 'Material' }))

const archivoDe = (nombre = 'guia.pdf', contenido = 'hola!') =>
  new File([contenido], nombre, { type: 'application/pdf' })

// Rellena el formulario. Cada campo es opcional.
function completar(
  campos: {
    archivo?: File
    categoria?: string
    titulo?: string
    descripcion?: string
  } = {},
) {
  const {
    archivo = archivoDe(),
    categoria = 'GUIA',
    titulo = 'Guía 1',
  } = campos
  const p = panel()
  fireEvent.change(p.getByLabelText('Archivo'), {
    target: { files: [archivo] },
  })
  fireEvent.change(p.getByLabelText('Categoría'), {
    target: { value: categoria },
  })
  fireEvent.change(p.getByLabelText('Título'), { target: { value: titulo } })
  if (campos.descripcion !== undefined) {
    fireEvent.change(p.getByLabelText('Descripción (opcional)'), {
      target: { value: campos.descripcion },
    })
  }
}

const enviar = () =>
  fireEvent.click(panel().getByRole('button', { name: 'Subir material' }))

// Espera la subida a S3 que arma el flujo después de pedirla.
const subidaEnCurso = async () => {
  await waitFor(() => expect(XhrFalso.enviadas).toHaveLength(1))
  return XhrFalso.enviadas[0]
}

describe('pestaña Material (MAT-04)', () => {
  test('el profesor ve el formulario con archivo, categoría, título y descripción', async () => {
    await abrirMaterial()

    const p = panel()
    expect(p.getByLabelText('Archivo')).toBeInTheDocument()
    expect(p.getByLabelText('Descripción (opcional)')).toBeInTheDocument()
    const categorias = within(p.getByLabelText('Categoría'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(categorias).toEqual([
      'Elige una categoría',
      'Guía',
      'Presentación',
      'Prueba anterior',
      'Código',
    ])
    expect(p.getByRole('button', { name: 'Subir material' })).toBeEnabled()
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no ve el formulario: la pestaña está deshabilitada',
    async (rol) => {
      await abrirMaterial({ rol })

      expect(screen.getByRole('tab', { name: 'Material' })).toBeDisabled()
      expect(screen.queryByRole('form', { name: 'Subir material' })).toBeNull()
      expect(screen.queryByLabelText('Archivo')).toBeNull()
    },
  )

  test('muestra los materiales del curso, o que no hay', async () => {
    await abrirMaterial({ materiales: [EXISTENTE] })

    const lista = await panel().findByRole('list', { name: 'Materiales' })
    const item = within(lista).getByRole('article', { name: 'Solemne 2025' })
    expect(item).toHaveTextContent('Prueba anterior')
    expect(item).toHaveTextContent('Con pauta.')
    expect(item).toHaveTextContent('solemne.pdf · 2 KB')
  })

  test('sin materiales lo indica', async () => {
    await abrirMaterial()

    expect(
      await panel().findByText('Aún no hay materiales del curso'),
    ).toBeInTheDocument()
  })

  test('si no carga el listado, ofrece reintentar', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      [RESUMEN_RUTA]: () => RESUMEN,
      [MATERIALES]: () => json({}, 500),
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Material' }))

    expect(
      await panel().findByText('No pudimos cargar los materiales.'),
    ).toBeInTheDocument()
    expect(panel().getByLabelText('Archivo')).toBeInTheDocument()
  })

  describe('el flujo: pedir subida → subir a S3 → confirmar → registrar', () => {
    test('sube el archivo, muestra el progreso y registra el material', async () => {
      const { llamadas, bodies } = await abrirMaterial({ materiales: [] })
      completar({ descripcion: 'Funciones y listas.' })

      enviar()
      // Pidiendo la subida: el botón se bloquea.
      expect(
        await panel().findByText('Preparando la subida…'),
      ).toBeInTheDocument()
      expect(
        panel().getByRole('button', { name: 'Subir material' }),
      ).toBeDisabled()
      expect(bodies[`POST ${ARCHIVOS}`]).toEqual({
        nombre: 'guia.pdf',
        tamano: 5,
      })

      // Subiendo a S3: los campos firmados en orden y el archivo al final.
      const xhr = await subidaEnCurso()
      expect(xhr.metodo).toBe('POST')
      expect(xhr.url).toBe(SUBIDA.subida.url)
      expect([...(xhr.cuerpo as FormData).keys()]).toEqual([
        'key',
        'Content-Type',
        'policy',
        'file',
      ])
      expect((xhr.cuerpo as FormData).get('key')).toBe('u/s/archivo-1')
      expect(((xhr.cuerpo as FormData).get('file') as File).name).toBe(
        'guia.pdf',
      )

      xhr.progreso(2, 5)
      expect(
        await panel().findByText('Subiendo archivo… 40 %'),
      ).toBeInTheDocument()
      expect(
        panel().getByRole('progressbar', { name: 'Progreso de la subida' }),
      ).toHaveAttribute('value', '40')

      xhr.progreso(5, 5)
      xhr.terminar(204)

      // Confirma y registra.
      await waitFor(() =>
        expect(panel().getByText('Material subido')).toBeInTheDocument(),
      )
      expect(llamadas.filter((l) => !l.startsWith('GET'))).toEqual([
        `POST ${ARCHIVOS}`,
        `POST ${CONFIRMAR}`,
        `POST ${MATERIALES}`,
      ])
      expect(bodies[`POST ${MATERIALES}`]).toEqual({
        archivoId: 'archivo-1',
        categoria: 'GUIA',
        titulo: 'Guía 1',
        descripcion: 'Funciones y listas.',
      })

      // Éxito: el formulario queda listo para otro material y el listado se
      // vuelve a pedir.
      expect(
        panel().getByRole('button', { name: 'Subir material' }),
      ).toBeEnabled()
      expect(panel().getByLabelText('Título')).toHaveValue('')
      expect(panel().getByLabelText('Categoría')).toHaveValue('')
      expect(
        llamadas.filter((l) => l === `GET ${MATERIALES}`).length,
      ).toBeGreaterThan(1)
    })

    test('sin descripción no la envía', async () => {
      const { bodies } = await abrirMaterial()
      completar({ descripcion: '   ' })

      enviar()
      ;(await subidaEnCurso()).terminar(204)

      await waitFor(() => expect(bodies[`POST ${MATERIALES}`]).toBeDefined())
      expect(bodies[`POST ${MATERIALES}`]).toEqual({
        archivoId: 'archivo-1',
        categoria: 'GUIA',
        titulo: 'Guía 1',
      })
    })

    test('una vez registrado, muestra el material nuevo en la lista', async () => {
      let registrado = false
      await renderConSesion('PROFESOR', VISTA, {
        [RESUMEN_RUTA]: () => RESUMEN,
        [ARCHIVOS]: () => json(SUBIDA, 201),
        [CONFIRMAR]: () => SUBIDA.archivo,
        [MATERIALES]: (init) => {
          if (init?.method === 'POST') {
            registrado = true
            return json({ ...EXISTENTE, id: 'material-1' }, 201)
          }
          return registrado ? [EXISTENTE] : []
        },
      })
      fireEvent.click(await screen.findByRole('tab', { name: 'Material' }))
      await panel().findByText('Aún no hay materiales del curso')
      completar()

      enviar()
      ;(await subidaEnCurso()).terminar(204)

      expect(
        await panel().findByRole('article', { name: 'Solemne 2025' }),
      ).toBeInTheDocument()
    })
  })

  describe('si el flujo falla a mitad, muestra el error y desbloquea el botón', () => {
    const desbloqueado = () =>
      expect(
        panel().getByRole('button', { name: 'Subir material' }),
      ).toBeEnabled()

    test('al pedir la subida, con el motivo del 400', async () => {
      const { llamadas } = await abrirMaterial({
        pedir: () => json({ message: 'Tipo de archivo no permitido' }, 400),
      })
      completar()

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Tipo de archivo no permitido',
      )
      desbloqueado()
      expect(XhrFalso.enviadas).toHaveLength(0)
      expect(llamadas.filter((l) => l.startsWith('POST'))).toEqual([
        `POST ${ARCHIVOS}`,
      ])
    })

    test('al pedir la subida sin almacenamiento (503)', async () => {
      await abrirMaterial({ pedir: () => json({}, 503) })
      completar()

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'El almacenamiento de archivos no está disponible por ahora',
      )
      desbloqueado()
    })

    test('al pedir la subida, sin conexión', async () => {
      await abrirMaterial({
        pedir: () => Promise.reject(new TypeError('Failed to fetch')),
      })
      completar()

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Comprueba tu conexión',
      )
      desbloqueado()
    })

    test.each([
      ['S3 rechaza la firma (403)', (xhr: XhrFalso) => xhr.terminar(403)],
      ['se corta la conexión', (xhr: XhrFalso) => xhr.fallar()],
    ])('al subir a S3: %s', async (_caso, fallar) => {
      const { llamadas } = await abrirMaterial()
      completar()

      enviar()
      fallar(await subidaEnCurso())

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'No pudimos subir el archivo',
      )
      desbloqueado()
      // No confirma ni registra algo que no subió.
      expect(llamadas.filter((l) => l.startsWith('POST'))).toEqual([
        `POST ${ARCHIVOS}`,
      ])
    })

    test('al confirmar', async () => {
      const { llamadas } = await abrirMaterial({
        confirmar: () => json({ message: 'todavía no' }, 409),
      })
      completar()

      enviar()
      ;(await subidaEnCurso()).terminar(204)

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'No pudimos confirmar el archivo subido',
      )
      desbloqueado()
      expect(llamadas).not.toContain(`POST ${MATERIALES}`)
    })

    test('al registrar: reintentar registra el mismo archivo, sin subirlo otra vez', async () => {
      let intento = 0
      const { llamadas, bodies } = await abrirMaterial({
        registrar: () =>
          ++intento === 1
            ? json({}, 500)
            : json({ ...EXISTENTE, id: 'material-1' }, 201),
      })
      completar()

      enviar()
      ;(await subidaEnCurso()).terminar(204)
      expect(await panel().findByRole('alert')).toHaveTextContent(
        'No pudimos registrar el material',
      )
      desbloqueado()
      // El formulario conserva lo escrito.
      expect(panel().getByLabelText('Título')).toHaveValue('Guía 1')

      enviar()

      await waitFor(() =>
        expect(panel().getByText('Material subido')).toBeInTheDocument(),
      )
      expect(panel().queryByRole('alert')).toBeNull()
      expect(XhrFalso.enviadas).toHaveLength(1)
      expect(llamadas.filter((l) => l === `POST ${ARCHIVOS}`)).toHaveLength(1)
      expect(llamadas.filter((l) => l === `POST ${MATERIALES}`)).toHaveLength(2)
      expect(bodies[`POST ${MATERIALES}`]).toMatchObject({
        archivoId: 'archivo-1',
      })
    })

    test('si el registro se guardó pero se perdió la respuesta, el reintento con 409 lo da por subido sin subir de nuevo', async () => {
      // El servidor guarda el material en el primer intento, pero la
      // respuesta no llega (falla la red).
      const guardados: Material[] = []
      let intento = 0
      const { llamadas } = await abrirMaterial({
        materiales: guardados,
        registrar: () => {
          if (++intento === 1) {
            guardados.push({
              ...EXISTENTE,
              id: 'material-1',
              titulo: 'Guía 1',
              archivo: {
                ...SUBIDA.archivo,
                subidoEn: '2026-11-10T12:00:00.000Z',
              },
            })
            return Promise.reject(new TypeError('Failed to fetch'))
          }
          return json(
            {
              statusCode: 409,
              message: 'Ese archivo ya está registrado como material',
            },
            409,
          )
        },
      })
      completar()
      enviar()
      ;(await subidaEnCurso()).terminar(204)
      expect(await panel().findByRole('alert')).toBeInTheDocument()
      desbloqueado()

      enviar()

      await waitFor(() =>
        expect(panel().getByText('Material subido')).toBeInTheDocument(),
      )
      expect(panel().queryByRole('alert')).toBeNull()
      expect(await panel().findByText('Guía 1')).toBeInTheDocument()
      // Una sola subida a S3, un solo archivo pedido y un solo material.
      expect(XhrFalso.enviadas).toHaveLength(1)
      expect(llamadas.filter((l) => l === `POST ${ARCHIVOS}`)).toHaveLength(1)
      expect(guardados).toHaveLength(1)
    })

    test('si el listado no responde al verificar el 409, conserva el archivo y el siguiente intento verifica sin subir de nuevo', async () => {
      const guardados: Material[] = []
      let intento = 0
      let listadoCaido = false
      const { llamadas } = await abrirMaterial({
        listar: () => {
          if (!listadoCaido) return guardados
          listadoCaido = false
          return json({}, 503)
        },
        registrar: () => {
          if (++intento === 1) {
            guardados.push({
              ...EXISTENTE,
              id: 'material-1',
              titulo: 'Guía 1',
              archivo: {
                ...SUBIDA.archivo,
                subidoEn: '2026-11-10T12:00:00.000Z',
              },
            })
            return Promise.reject(new TypeError('Failed to fetch'))
          }
          // El segundo intento verifica con el listado caído.
          if (intento === 2) listadoCaido = true
          return json(
            {
              statusCode: 409,
              message: 'Ese archivo ya está registrado como material',
            },
            409,
          )
        },
      })
      completar()
      enviar()
      ;(await subidaEnCurso()).terminar(204)
      expect(await panel().findByRole('alert')).toBeInTheDocument()
      desbloqueado()

      enviar()
      await waitFor(() =>
        expect(panel().getByRole('alert')).toHaveTextContent(
          'No pudimos comprobar si el material quedó registrado. Inténtalo nuevamente.',
        ),
      )
      desbloqueado()

      enviar()
      await waitFor(() =>
        expect(panel().getByText('Material subido')).toBeInTheDocument(),
      )
      expect(await panel().findByText('Guía 1')).toBeInTheDocument()
      // Una sola subida a S3 y un solo archivo pedido en los tres intentos.
      expect(XhrFalso.enviadas).toHaveLength(1)
      expect(llamadas.filter((l) => l === `POST ${ARCHIVOS}`)).toHaveLength(1)
      expect(llamadas.filter((l) => l === `POST ${MATERIALES}`)).toHaveLength(3)
      expect(guardados).toHaveLength(1)
    })

    test('un 409 por otro registro del mismo archivo sigue siendo un error', async () => {
      await abrirMaterial({
        registrar: () =>
          json(
            {
              statusCode: 409,
              message: 'Ese archivo ya está registrado como material',
            },
            409,
          ),
      })
      completar()
      enviar()
      ;(await subidaEnCurso()).terminar(204)
      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Ese archivo ya está registrado como material.',
      )
    })

    test('al registrar con otro archivo, sube el nuevo', async () => {
      let intento = 0
      await abrirMaterial({
        registrar: () =>
          ++intento === 1
            ? json({}, 500)
            : json({ ...EXISTENTE, id: 'material-1' }, 201),
      })
      completar()
      enviar()
      ;(await subidaEnCurso()).terminar(204)
      await panel().findByRole('alert')

      fireEvent.change(panel().getByLabelText('Archivo'), {
        target: { files: [archivoDe('otra.pdf')] },
      })
      enviar()

      await waitFor(() => expect(XhrFalso.enviadas).toHaveLength(2))
    })

    test.each([
      [409, 'Ese archivo ya está registrado como material.'],
      [403, 'Ya no eres profesor de esta sección.'],
      [400, 'El archivo todavía no está confirmado'],
    ])('al registrar responde %s', async (status, mensaje) => {
      await abrirMaterial({
        registrar: () =>
          json(
            {
              message:
                status === 400 ? 'El archivo todavía no está confirmado' : 'x',
            },
            status,
          ),
      })
      completar()

      enviar()
      ;(await subidaEnCurso()).terminar(204)

      expect(await panel().findByRole('alert')).toHaveTextContent(mensaje)
      desbloqueado()
    })

    test('el error desaparece al reintentar con éxito', async () => {
      let intento = 0
      await abrirMaterial({
        pedir: () => (++intento === 1 ? json({}, 503) : json(SUBIDA, 201)),
      })
      completar()
      enviar()
      await panel().findByRole('alert')

      enviar()
      ;(await subidaEnCurso()).terminar(204)

      await waitFor(() =>
        expect(panel().getByText('Material subido')).toBeInTheDocument(),
      )
      expect(panel().queryByRole('alert')).toBeNull()
    })
  })

  describe('validaciones antes de subir', () => {
    const sinPeticiones = (llamadas: string[]) => {
      expect(llamadas.filter((l) => l.startsWith('POST'))).toEqual([])
      expect(XhrFalso.enviadas).toHaveLength(0)
    }

    test('sin archivo', async () => {
      const { llamadas } = await abrirMaterial()
      const p = panel()
      fireEvent.change(p.getByLabelText('Categoría'), {
        target: { value: 'GUIA' },
      })
      fireEvent.change(p.getByLabelText('Título'), {
        target: { value: 'Guía' },
      })

      enviar()

      expect(await p.findByRole('alert')).toHaveTextContent('Elige un archivo')
      sinPeticiones(llamadas)
    })

    test('un tipo de archivo no permitido', async () => {
      const { llamadas } = await abrirMaterial()
      completar({ archivo: archivoDe('virus.exe') })

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'El archivo debe ser de uno de estos tipos: pdf, png, jpg, jpeg, docx, xlsx, pptx, zip, txt, ipynb',
      )
      sinPeticiones(llamadas)
    })

    test('un archivo vacío', async () => {
      const { llamadas } = await abrirMaterial()
      completar({ archivo: archivoDe('vacio.pdf', '') })

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'El archivo está vacío',
      )
      sinPeticiones(llamadas)
    })

    test('un archivo de más de 20 MB', async () => {
      const { llamadas } = await abrirMaterial()
      const grande = archivoDe('grande.pdf')
      Object.defineProperty(grande, 'size', {
        value: TAMANO_MAXIMO_ARCHIVO + 1,
      })
      completar({ archivo: grande })

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'El archivo pesa más de 20 MB',
      )
      sinPeticiones(llamadas)
    })

    test('sin categoría', async () => {
      const { llamadas } = await abrirMaterial()
      completar({ categoria: '' })

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Elige una categoría',
      )
      sinPeticiones(llamadas)
    })

    test.each(['', '    '])('con título vacío (%j)', async (titulo) => {
      const { llamadas } = await abrirMaterial()
      completar({ titulo })

      enviar()

      expect(await panel().findByRole('alert')).toHaveTextContent(
        'Ingresa el título del material',
      )
      sinPeticiones(llamadas)
    })

    test('el título y la descripción tienen largo máximo', async () => {
      await abrirMaterial()

      expect(panel().getByLabelText('Título')).toHaveAttribute(
        'maxlength',
        '100',
      )
      expect(panel().getByLabelText('Descripción (opcional)')).toHaveAttribute(
        'maxlength',
        '1000',
      )
    })

    test('el input solo ofrece los tipos permitidos', async () => {
      await abrirMaterial()

      expect(panel().getByLabelText('Archivo')).toHaveAttribute(
        'accept',
        '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.zip,.txt,.ipynb',
      )
    })
  })
})
