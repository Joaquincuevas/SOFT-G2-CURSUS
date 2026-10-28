import {
  MAX_ANUNCIOS_LECTURA,
  type Anuncio,
  type Rol,
  type SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'
import { fechaAnuncio } from './anuncios'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const ANUNCIOS = '/api/espacio/secciones/seccion-1/anuncios'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

// La API los entrega del más nuevo al más antiguo.
const LISTA: Anuncio[] = [
  {
    id: 'a2',
    seccion: null,
    titulo: 'Prueba 1',
    cuerpo: 'Es el lunes 9.\nTraigan calculadora.',
    autor: { id: 'profesor-2', nombre: 'Matías Muñoz' },
    publicadoEn: '2026-10-20T15:30:00.000Z',
  },
  {
    id: 'a1',
    seccion: null,
    titulo: 'Cambio de sala',
    cuerpo: 'El jueves es en la B-201.',
    autor: { id: 'profesor-1', nombre: 'Camila Rojas' },
    publicadoEn: '2026-10-19T12:00:00.000Z',
  },
]

// Abre la vista de la sección con el rol dado y entra a la pestaña Anuncios.
async function abrirAnuncios(
  rol: Rol,
  anuncios: (init?: RequestInit) => unknown = () => LISTA,
  lecturas: (init?: RequestInit) => unknown = () =>
    new Response(null, { status: 204 }),
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ANUNCIOS]: anuncios,
    [`${ANUNCIOS}/lecturas`]: lecturas,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Anuncios' }))
  expect(screen.getByRole('tab', { name: 'Anuncios' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return { panel: within(screen.getByRole('tabpanel', { name: 'Anuncios' })) }
}

const tarjetas = (panel: ReturnType<typeof within>) =>
  panel.getAllByRole('article').map((tarjeta: HTMLElement) => ({
    titulo: within(tarjeta).getByRole('heading').textContent,
    texto: tarjeta.textContent,
  }))

describe('ANU-04: marca los anuncios nuevos al abrirlos', () => {
  test('conserva Nuevo durante la lectura y solo registra los IDs nuevos recibidos', async () => {
    const enviados: unknown[] = []
    const { panel } = await abrirAnuncios(
      'ALUMNO',
      () => [
        { ...LISTA[0], nuevo: true },
        { ...LISTA[1], nuevo: false },
      ],
      (init) => {
        enviados.push(JSON.parse(init?.body as string))
        return new Response(null, { status: 204 })
      },
    )
    await panel.findByText('Nuevo')
    await waitFor(() => expect(enviados).toEqual([{ anuncioIds: ['a2'] }]))
    expect(panel.getAllByText('Nuevo')).toHaveLength(1)
    expect(panel.getAllByRole('article')[0]).toHaveTextContent('Nuevo')
    expect(panel.getAllByRole('article')[1]).not.toHaveTextContent('Nuevo')
  })

  test('si falla registrar, conserva la lista y permite reintentar sin volver a pedirla', async () => {
    let fallo = true,
      listas = 0
    const envios: unknown[] = []
    const { panel } = await abrirAnuncios(
      'ALUMNO',
      () => {
        listas++
        return [{ ...LISTA[0], nuevo: true }]
      },
      (init) => {
        envios.push(JSON.parse(init?.body as string))
        return new Response(null, { status: fallo ? 500 : 204 })
      },
    )
    await panel.findByText('No pudimos actualizar los anuncios leídos.')
    expect(panel.getByText('Prueba 1')).toBeInTheDocument()
    expect(panel.getByText('Nuevo')).toBeInTheDocument()
    fallo = false
    fireEvent.click(
      panel.getByRole('button', { name: 'Reintentar actualización' }),
    )
    await waitFor(() => expect(panel.queryByRole('alert')).toBeNull())
    expect(envios).toEqual([{ anuncioIds: ['a2'] }, { anuncioIds: ['a2'] }])
    expect(listas).toBe(1)
  })

  test('un GET fallido no registra lectura; al recuperarlo registra solo la respuesta correcta', async () => {
    let fallo = true,
      marcas = 0
    const { panel } = await abrirAnuncios(
      'ALUMNO',
      () => (fallo ? json({}, 500) : [{ ...LISTA[0], nuevo: true }]),
      () => {
        marcas++
        return new Response(null, { status: 204 })
      },
    )
    await panel.findByRole('alert')
    expect(marcas).toBe(0)
    fallo = false
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    await panel.findByText('Nuevo')
    await waitFor(() => expect(marcas).toBe(1))
  })

  test.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    '%s no envía lecturas ni muestra Nuevo',
    async (rol) => {
      let marcas = 0
      const { panel } = await abrirAnuncios(
        rol,
        () => [{ ...LISTA[0], nuevo: true }],
        () => {
          marcas++
          return new Response(null, { status: 204 })
        },
      )
      await panel.findByText('Prueba 1')
      expect(panel.queryByText('Nuevo')).toBeNull()
      expect(marcas).toBe(0)
    },
  )

  test('una lista grande registra lotes acotados sin perder anuncios', async () => {
    const lista = Array.from({ length: MAX_ANUNCIOS_LECTURA + 1 }, (_, i) => ({
      ...LISTA[0],
      id: `anuncio-${i}`,
      titulo: `Anuncio ${i}`,
      nuevo: true,
    }))
    const enviados: { anuncioIds: string[] }[] = []
    const { panel } = await abrirAnuncios(
      'ALUMNO',
      () => lista,
      (init) => {
        enviados.push(
          JSON.parse(init?.body as string) as { anuncioIds: string[] },
        )
        return new Response(null, { status: 204 })
      },
    )
    await panel.findByText('Anuncio 0')
    await waitFor(() => expect(enviados).toHaveLength(2))
    expect(enviados.map((lote) => lote.anuncioIds.length)).toEqual([
      MAX_ANUNCIOS_LECTURA,
      1,
    ])
    expect(enviados.flatMap((lote) => lote.anuncioIds)).toEqual(
      lista.map((a) => a.id),
    )
  })
})

describe('ANU-03: el alumno lee anuncios del curso', () => {
  test('muestra generales y propios en una lista cronológica con todos sus datos', async () => {
    const privado: Anuncio = {
      ...LISTA[0],
      seccion: { id: 'seccion-1', numero: 1 },
    }
    const lista = [privado, LISTA[1]]
    const { panel } = await abrirAnuncios('ALUMNO', () => lista)
    const publicada = await panel.findByRole('list', {
      name: 'Anuncios publicados',
    })
    expect(publicada.tagName).toBe('OL')
    expect(
      panel.getByText(/del más reciente al más antiguo/),
    ).toHaveTextContent(
      'Anuncios de todo el curso y de tu sección, del más reciente al más antiguo.',
    )
    const articulos = within(publicada).getAllByRole('article')
    expect(articulos).toHaveLength(lista.length)
    lista.forEach((anuncio, indice) => {
      const articulo = within(articulos[indice])
      expect(articulo.getByRole('heading')).toHaveTextContent(anuncio.titulo)
      expect(
        articulo.getByText(anuncio.autor.nombre, { exact: false }),
      ).toBeInTheDocument()
      expect(
        articulo.getByText(anuncio.cuerpo, { normalizer: (texto) => texto }),
      ).toHaveTextContent(anuncio.cuerpo, { normalizeWhitespace: false })
      const fecha = articulo.getByText(fechaAnuncio(anuncio.publicadoEn))
      expect(fecha.tagName).toBe('TIME')
      expect(fecha).toHaveAttribute('datetime', anuncio.publicadoEn)
      expect(
        articulo.getByText(indice === 0 ? 'Sección 1' : 'Todo el curso'),
      ).toBeInTheDocument()
    })
    expect(panel.queryByRole('form')).toBeNull()
  })

  test('espera la respuesta antes de mostrar la lista al alumno', async () => {
    let responder: (r: Anuncio[]) => void = () => {}
    const pendiente = new Promise<Anuncio[]>((resolve) => {
      responder = resolve
    })
    const { panel } = await abrirAnuncios('ALUMNO', () => pendiente)
    expect(panel.getByText('Cargando anuncios…')).toBeInTheDocument()
    expect(panel.queryByRole('article')).toBeNull()
    responder(LISTA)
    await panel.findByText('Prueba 1')
    expect(panel.queryByText('Cargando anuncios…')).toBeNull()
  })

  test('el título y el cuerpo se leen como texto, conservando saltos de línea', async () => {
    const anuncio: Anuncio = {
      ...LISTA[0],
      titulo: '<b>Prueba</b>',
      cuerpo:
        '<img src=x onerror=alert(1)>\nRevisar <script>alert(1)</script>.',
    }
    const { panel } = await abrirAnuncios('ALUMNO', () => [anuncio])
    const articulo = await panel.findByRole('article')
    expect(within(articulo).getByRole('heading')).toHaveTextContent(
      anuncio.titulo,
    )
    expect(articulo).toHaveTextContent(anuncio.cuerpo, {
      normalizeWhitespace: false,
    })
    expect(articulo.querySelector('img, script, b')).toBeNull()
  })
})

describe('pestaña Anuncios (ANU-01/02)', () => {
  test.each<Rol>(['ALUMNO', 'AYUDANTE'])(
    '%s ve la sección destinataria sin formulario de publicación',
    async (rol) => {
      const privado: Anuncio = {
        ...LISTA[0],
        seccion: { id: 'seccion-1', numero: 1 },
      }
      const { panel } = await abrirAnuncios(rol, () => [privado, LISTA[1]])
      await panel.findByText('Prueba 1')
      expect(tarjetas(panel)[0].texto).toContain('Sección 1')
      expect(tarjetas(panel)[1].texto).toContain('Todo el curso')
      expect(panel.queryByLabelText('Dirigido a')).toBeNull()
      expect(
        panel.queryByRole('button', { name: 'Publicar anuncio' }),
      ).toBeNull()
    },
  )

  test('durante el envío bloquea el destinatario y evita duplicados; un fallo conserva la edición', async () => {
    let responder: (r: Response) => void = () => {}
    let pedidos = 0
    const { panel } = await abrirAnuncios('PROFESOR', (init) => {
      if (init?.method !== 'POST') return LISTA
      pedidos++
      return new Promise<Response>((resolve) => {
        responder = resolve
      })
    })
    await panel.findByText('Cambio de sala')
    fireEvent.change(panel.getByLabelText('Dirigido a'), {
      target: { value: 'seccion-1' },
    })
    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Solo este grupo' },
    })
    fireEvent.change(panel.getByLabelText('Mensaje'), {
      target: { value: 'Aviso privado' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Publicar anuncio' }))
    expect(panel.getByLabelText('Dirigido a')).toBeDisabled()
    expect(panel.getByLabelText('Título')).toBeDisabled()
    expect(panel.getByLabelText('Mensaje')).toBeDisabled()
    fireEvent.submit(panel.getByRole('form', { name: 'Nuevo anuncio' }))
    expect(pedidos).toBe(1)
    responder(json({}, 500))
    await panel.findByRole('alert')
    expect(panel.getByLabelText('Dirigido a')).toHaveValue('seccion-1')
    expect(panel.getByLabelText('Título')).toHaveValue('Solo este grupo')
    expect(panel.getByLabelText('Mensaje')).toHaveValue('Aviso privado')
    expect(
      panel.getByRole('button', { name: 'Publicar anuncio' }),
    ).toBeEnabled()
  })

  test('publica solo para la sección elegida y muestra su destinatario', async () => {
    const enviados: unknown[] = []
    const nuevo: Anuncio = {
      ...LISTA[0],
      id: 'privado',
      titulo: 'Solo sección 1',
      seccion: { id: 'seccion-1', numero: 1 },
    }
    let publicado = false
    const { panel } = await abrirAnuncios('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        publicado = true
        return json(nuevo, 201)
      }
      return publicado ? [nuevo, ...LISTA] : LISTA
    })
    await panel.findByText('Cambio de sala')
    expect(panel.getByLabelText('Dirigido a')).toHaveValue('')
    fireEvent.change(panel.getByLabelText('Dirigido a'), {
      target: { value: 'seccion-1' },
    })
    expect(
      panel.getByText('Lo verán solo los integrantes de esta sección.'),
    ).toBeInTheDocument()
    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Solo sección 1' },
    })
    fireEvent.change(panel.getByLabelText('Mensaje'), {
      target: { value: 'Cambio de horario' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Publicar anuncio' }))
    expect(await panel.findByRole('status')).toHaveTextContent(
      'Anuncio publicado para la sección 1',
    )
    expect(enviados).toEqual([
      {
        titulo: 'Solo sección 1',
        cuerpo: 'Cambio de horario',
        seccionId: 'seccion-1',
      },
    ])
    await panel.findByText('Solo sección 1')
    const [tarjeta] = tarjetas(panel)
    expect(tarjeta.texto).toContain('Sección 1')
    expect(tarjetas(panel)[1].texto).toContain('Todo el curso')
    expect(panel.getByLabelText('Dirigido a')).toHaveValue('')
  })

  test('muestra cada anuncio con título, autor, fecha y cuerpo, el más nuevo primero', async () => {
    const { panel } = await abrirAnuncios('ALUMNO')

    await panel.findByText('Prueba 1')
    const [primero, segundo] = tarjetas(panel)
    expect(primero.titulo).toBe('Prueba 1')
    expect(primero.texto).toContain('Matías Muñoz')
    expect(primero.texto).toContain(fechaAnuncio(LISTA[0].publicadoEn))
    expect(segundo.titulo).toBe('Cambio de sala')
    expect(segundo.texto).toContain('Camila Rojas')
    // El cuerpo conserva su salto de línea.
    expect(panel.getByText(/Es el lunes 9\./)).toHaveTextContent(
      'Es el lunes 9.\nTraigan calculadora.',
      { normalizeWhitespace: false },
    )
  })

  // El Director no entra por Mis cursos; su lectura la prueba el backend.
  test.each<Rol>(['ALUMNO', 'AYUDANTE'])(
    '%s ve la lista pero no el formulario',
    async (rol) => {
      const { panel } = await abrirAnuncios(rol)

      expect(await panel.findByText('Cambio de sala')).toBeInTheDocument()
      expect(panel.queryByRole('form', { name: 'Nuevo anuncio' })).toBeNull()
    },
  )

  test('sin anuncios muestra el estado vacío', async () => {
    const { panel } = await abrirAnuncios('ALUMNO', () => [])

    expect(await panel.findByText('Aún no hay anuncios')).toBeInTheDocument()
  })

  test('el profesor publica: envía título y cuerpo, avisa y vuelve a pedir la lista', async () => {
    const enviados: unknown[] = []
    let publicado = false
    const nuevo: Anuncio = {
      id: 'a3',
      seccion: null,
      titulo: 'Bienvenidos',
      cuerpo: 'Revisen el programa.',
      autor: { id: 'profesor-1', nombre: 'Camila Rojas' },
      publicadoEn: '2026-10-21T10:00:00.000Z',
    }
    const { panel } = await abrirAnuncios('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        publicado = true
        return json(nuevo, 201)
      }
      return publicado ? [nuevo, ...LISTA] : LISTA
    })
    await panel.findByText('Cambio de sala')

    // Título y mensaje son obligatorios en el formulario.
    expect(panel.getByLabelText('Título')).toBeRequired()
    expect(panel.getByLabelText('Mensaje')).toBeRequired()
    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Bienvenidos' },
    })
    fireEvent.change(panel.getByLabelText('Mensaje'), {
      target: { value: 'Revisen el programa.' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Publicar anuncio' }))

    expect(
      await panel.findByText(
        'Anuncio publicado para todas las secciones del curso',
      ),
    ).toBeInTheDocument()
    expect(enviados).toEqual([
      { titulo: 'Bienvenidos', cuerpo: 'Revisen el programa.' },
    ])
    expect(await panel.findByText('Bienvenidos')).toBeInTheDocument()
    expect(tarjetas(panel)[0].titulo).toBe('Bienvenidos')
    expect(panel.getByLabelText('Título')).toHaveValue('')
    expect(panel.getByLabelText('Mensaje')).toHaveValue('')

    // Al empezar el siguiente anuncio se borra el aviso.
    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Otro' },
    })
    expect(
      panel.queryByText('Anuncio publicado para todas las secciones del curso'),
    ).toBeNull()
  })

  test('muestra el primer mensaje del 400 y conserva lo escrito', async () => {
    const { panel } = await abrirAnuncios('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json(
            {
              statusCode: 400,
              message: ['Ingresa el cuerpo del anuncio', 'otro'],
            },
            400,
          )
        : LISTA,
    )
    await panel.findByText('Cambio de sala')

    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Solo título' },
    })
    fireEvent.change(panel.getByLabelText('Mensaje'), {
      target: { value: '   ' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Publicar anuncio' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Ingresa el cuerpo del anuncio',
    )
    expect(panel.getByLabelText('Título')).toHaveValue('Solo título')
  })

  test('un 403 muestra un mensaje genérico', async () => {
    const { panel } = await abrirAnuncios('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 403, message: 'Forbidden' }, 403)
        : LISTA,
    )
    await panel.findByText('Cambio de sala')

    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'T' },
    })
    fireEvent.change(panel.getByLabelText('Mensaje'), {
      target: { value: 'C' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Publicar anuncio' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos publicar el anuncio. Inténtalo nuevamente.',
    )
  })

  test('si la lista no carga, muestra el error y reintenta', async () => {
    let fallar = true
    const { panel } = await abrirAnuncios('ALUMNO', () =>
      fallar ? new Response(null, { status: 500 }) : LISTA,
    )

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los anuncios.',
    )
    fallar = false
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Cambio de sala')).toBeInTheDocument()
  })
})
