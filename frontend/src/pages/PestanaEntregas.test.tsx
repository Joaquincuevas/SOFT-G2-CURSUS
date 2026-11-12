import type {
  Actividad,
  EntregaDeAlumno,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
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
  profesores: ['Camila Rojas'],
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
  otras: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ACTIVIDADES]: actividades,
    ...otras,
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
      expect(
        panel.queryByRole('button', { name: 'Crear actividad' }),
      ).not.toBeInTheDocument()
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

const ENTREGAS = `${ACTIVIDADES}/a2/entregas`
// 2026-11-10T18:05Z es el 10-11-2026 a las 15:05 en Chile.
const ENTREGADAS: EntregaDeAlumno[] = [
  {
    alumno: { id: 'al1', nombre: 'Ana Pérez', correo: 'ana@x' },
    entrega: {
      id: 'e1',
      entregadaEn: '2026-11-10T18:05:00.000Z',
      versiones: 2,
      archivo: {
        id: 'f1',
        nombre: 'Informe.pdf',
        tipo: 'application/pdf',
        tamano: 10,
        subidoEn: '2026-11-10T18:04:00.000Z',
      },
    },
  },
  {
    alumno: { id: 'al2', nombre: 'Bruno Soto', correo: 'bruno@x' },
    entrega: null,
  },
]
const SOLO_A2 = () => [LISTA[1]]

describe('entregas de una actividad para el equipo docente (MAT-10)', () => {
  test.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    '%s ve la tabla de alumnos con estado, fecha y hora',
    async (rol) => {
      const { panel } = await abrirEntregas(rol, SOLO_A2, {
        [ENTREGAS]: () => ENTREGADAS,
      })
      const tabla = await panel.findByRole('table', {
        name: 'Entregas de Informe 2',
      })
      const filas = within(tabla).getAllByRole('row')
      expect(within(filas[1]).getByText('Ana Pérez')).toBeInTheDocument()
      expect(within(filas[1]).getByText('Entregado')).toBeInTheDocument()
      expect(
        within(filas[1]).getByText('10-11-2026, 15:05'),
      ).toBeInTheDocument()
      expect(
        within(filas[1]).getByText('2 versiones; se descarga la última'),
      ).toBeInTheDocument()
      expect(within(filas[2]).getByText('Sin entrega')).toBeInTheDocument()
      expect(within(filas[2]).queryByRole('button')).toBeNull()
      expect(panel.getByText('1 de 2 alumnos entregaron')).toBeInTheDocument()
    },
  )

  test('el alumno no ve la tabla ni pide las entregas', async () => {
    const pedidas = vi.fn(() => ENTREGADAS)
    const { panel } = await abrirEntregas('ALUMNO', SOLO_A2, {
      [ENTREGAS]: pedidas,
    })
    await panel.findByText('Informe 2')
    expect(panel.queryByRole('table')).toBeNull()
    expect(pedidas).not.toHaveBeenCalled()
  })

  test('sin alumnos inscritos muestra el estado vacío', async () => {
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => [],
    })
    expect(
      await panel.findByText('No hay alumnos inscritos en la sección'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intento = 0
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => (++intento === 1 ? json({}, 500) : ENTREGADAS),
    })
    expect(
      await panel.findByText('No pudimos cargar las entregas.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByRole('table')).toBeInTheDocument()
  })

  test('descarga el informe con la URL firmada de esa entrega', async () => {
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const descarga = vi.fn(() => ({
      url: 'https://s3.test/informe?firma',
      expiraEn: '2026-11-11T00:00:00.000Z',
    }))
    const { panel } = await abrirEntregas('AYUDANTE', SOLO_A2, {
      [ENTREGAS]: () => ENTREGADAS,
      [`${ENTREGAS}/e1/descarga`]: descarga,
    })
    fireEvent.click(
      await panel.findByRole('button', {
        name: 'Descargar el informe de Ana Pérez',
      }),
    )
    await waitFor(() => expect(clic).toHaveBeenCalledTimes(1))
    expect(descarga).toHaveBeenCalledTimes(1)
    expect((clic.mock.contexts[0] as HTMLAnchorElement).href).toBe(
      'https://s3.test/informe?firma',
    )
    clic.mockRestore()
  })

  test('si la descarga falla muestra el error y desbloquea el botón', async () => {
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => ENTREGADAS,
      [`${ENTREGAS}/e1/descarga`]: () => json({}, 503),
    })
    const boton = await panel.findByRole('button', {
      name: 'Descargar el informe de Ana Pérez',
    })
    fireEvent.click(boton)
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos descargar el informe. Inténtalo nuevamente.',
    )
    expect(boton).toBeEnabled()
    expect(boton).toHaveTextContent('Descargar')
  })
})
