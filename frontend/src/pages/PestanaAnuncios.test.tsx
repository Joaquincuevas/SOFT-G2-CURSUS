import type { Anuncio, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
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
    titulo: 'Prueba 1',
    cuerpo: 'Es el lunes 9.\nTraigan calculadora.',
    autor: { id: 'profesor-2', nombre: 'Matías Muñoz' },
    publicadoEn: '2026-10-20T15:30:00.000Z',
  },
  {
    id: 'a1',
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
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ANUNCIOS]: anuncios,
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

describe('pestaña Anuncios (ANU-01)', () => {
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
