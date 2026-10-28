import type { Actividad, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const ACTIVIDADES = '/api/espacio/secciones/seccion-1/actividades'

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

// Plazos en UTC: 2026-10-01T02:59Z es el 30-09-2026 a las 23:59 en Chile
// (UTC-3); 2026-11-15T02:59Z, el 14-11-2026 a las 23:59.
const LISTA: Actividad[] = [
  {
    id: 'a1',
    titulo: 'Informe 1',
    instrucciones: 'Entregar en PDF.\nMáximo 5 páginas.',
    plazo: '2026-10-01T02:59:00.000Z',
    cerrada: true,
  },
  {
    id: 'a2',
    titulo: 'Informe 2',
    instrucciones: 'Incluir anexos.',
    plazo: '2026-11-15T02:59:00.000Z',
    cerrada: false,
  },
]

// Abre la vista de la sección con el rol dado y entra a la pestaña Entregas.
async function abrirEntregas(
  rol: Rol,
  actividades: (init?: RequestInit) => unknown = () => LISTA,
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ACTIVIDADES]: actividades,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Entregas' }))
  expect(screen.getByRole('tab', { name: 'Entregas' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return { panel: within(screen.getByRole('tabpanel', { name: 'Entregas' })) }
}

// Rellena el formulario de una actividad nueva.
function completar(
  panel: ReturnType<typeof within>,
  campos: {
    titulo: string
    instrucciones: string
    fecha: string
    hora: string
  },
) {
  fireEvent.change(panel.getByLabelText('Título'), {
    target: { value: campos.titulo },
  })
  fireEvent.change(panel.getByLabelText('Instrucciones'), {
    target: { value: campos.instrucciones },
  })
  fireEvent.change(panel.getByLabelText('Fecha límite'), {
    target: { value: campos.fecha },
  })
  fireEvent.change(panel.getByLabelText('Hora límite'), {
    target: { value: campos.hora },
  })
}

describe('pestaña Entregas (MAT-08)', () => {
  test('lista las actividades con su plazo en hora de Chile y su estado', async () => {
    const { panel } = await abrirEntregas('ALUMNO')

    const informe1 = within(
      await panel.findByRole('article', { name: 'Informe 1' }),
    )
    expect(informe1.getByText('Cerrada')).toBeInTheDocument()
    expect(informe1.getByText('Plazo: 30-09-2026, 23:59')).toBeInTheDocument()
    expect(
      informe1.getByText(/Entregar en PDF\.\s+Máximo 5 páginas\./),
    ).toBeInTheDocument()

    const informe2 = within(panel.getByRole('article', { name: 'Informe 2' }))
    expect(informe2.getByText('Abierta')).toBeInTheDocument()
    expect(informe2.getByText('Plazo: 14-11-2026, 23:59')).toBeInTheDocument()
  })

  test('el profesor crea una actividad: envía los cuatro campos y vuelve a pedir la lista', async () => {
    const enviados: unknown[] = []
    let creada = false
    const nueva: Actividad = {
      id: 'a3',
      titulo: 'Informe final',
      instrucciones: 'Proyecto completo.',
      plazo: '2026-12-10T21:00:00.000Z',
      cerrada: false,
    }
    const { panel } = await abrirEntregas('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        creada = true
        return json(nueva, 201)
      }
      return creada ? [...LISTA, nueva] : LISTA
    })
    await panel.findByText('Informe 1')

    completar(panel, {
      titulo: 'Informe final',
      instrucciones: 'Proyecto completo.',
      fecha: '2026-12-10',
      hora: '18:00',
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear actividad' }))

    expect(await panel.findByText('Actividad creada')).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        titulo: 'Informe final',
        instrucciones: 'Proyecto completo.',
        fecha: '2026-12-10',
        hora: '18:00',
      },
    ])
    expect(
      await panel.findByRole('article', { name: 'Informe final' }),
    ).toBeInTheDocument()
    expect(panel.getByLabelText('Título')).toHaveValue('')

    // Al empezar la siguiente actividad se borra el aviso.
    fireEvent.change(panel.getByLabelText('Título'), {
      target: { value: 'Otra' },
    })
    expect(panel.queryByText('Actividad creada')).not.toBeInTheDocument()
  })

  test('un 400 del backend muestra su mensaje', async () => {
    const mensaje =
      'La fecha y hora límite deben ser posteriores a la hora actual'
    const { panel } = await abrirEntregas('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 400, message: mensaje }, 400)
        : LISTA,
    )
    await panel.findByText('Informe 1')
    completar(panel, {
      titulo: 'Tarde',
      instrucciones: 'Fuera de plazo',
      fecha: '2026-09-01',
      hora: '10:00',
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear actividad' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(mensaje)
  })

  // El Director lee por la API (db-spec), pero no tiene ruta a esta vista:
  // /mis-cursos no está en su menú.
  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s ve la lista pero no el formulario',
    async (rol) => {
      const { panel } = await abrirEntregas(rol)

      expect(await panel.findByText('Informe 1')).toBeInTheDocument()
      expect(
        panel.queryByRole('form', { name: 'Nueva actividad' }),
      ).not.toBeInTheDocument()
      expect(panel.queryByRole('button')).not.toBeInTheDocument()
    },
  )

  test('sin actividades muestra el estado vacío', async () => {
    const { panel } = await abrirEntregas('AYUDANTE', () => [])

    expect(
      await panel.findByText('Aún no hay actividades de entrega'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirEntregas('ALUMNO', () =>
      ++intentos === 1 ? json({}, 500) : LISTA,
    )

    expect(
      await panel.findByText('No pudimos cargar las actividades.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Informe 1')).toBeInTheDocument()
  })
})
