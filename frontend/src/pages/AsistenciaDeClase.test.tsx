import type {
  AsistenciaClase,
  Clase,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const CLASES = '/api/espacio/secciones/seccion-1/clases'
const ASISTENCIA = '/api/espacio/secciones/seccion-1/clases/c1/asistencia'

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

const CLASE: Clase = {
  id: 'c1',
  fecha: '2026-09-14',
  inicio: '08:30',
  termino: '10:00',
  sala: 'Sala A-101',
}

const PENDIENTE: AsistenciaClase = {
  clase: CLASE,
  registrada: null,
  alumnos: [
    { id: 'a1', nombre: 'Ana Ávila', presente: null },
    { id: 'a2', nombre: 'Bruno Díaz', presente: null },
    { id: 'a3', nombre: 'Zoe Ruiz', presente: null },
  ],
}

const REGISTRADA: AsistenciaClase = {
  clase: CLASE,
  registrada: {
    por: { id: 'profesor-1', nombre: 'Camila Rojas' },
    en: '2026-09-14T12:00:00.000Z',
  },
  alumnos: [
    { id: 'a1', nombre: 'Ana Ávila', presente: true },
    { id: 'a2', nombre: 'Bruno Díaz', presente: false },
    { id: 'a3', nombre: 'Zoe Ruiz', presente: true },
  ],
}

// Abre la pestaña Asistencia con el rol dado y la asistencia de la clase c1.
async function abrir(rol: Rol, asistencia: (init?: RequestInit) => unknown) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [CLASES]: () => [CLASE],
    [ASISTENCIA]: asistencia,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
  const panel = within(screen.getByRole('tabpanel', { name: 'Asistencia' }))
  fireEvent.click(
    await panel.findByRole('button', {
      name: 'Asistencia del 2026-09-14 a las 08:30',
    }),
  )
  return panel
}

const marcar = (
  panel: ReturnType<typeof within>,
  alumno: string,
  opcion: 'Presente' | 'Ausente',
) =>
  fireEvent.click(
    within(panel.getByRole('group', { name: alumno })).getByLabelText(opcion),
  )

describe('asistencia de una clase (ASI-02)', () => {
  test('el profesor marca a cada alumno: Guardar se habilita solo con todos marcados', async () => {
    const enviados: unknown[] = []
    let guardada = false
    const panel = await abrir('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        guardada = true
        return json(REGISTRADA, 201)
      }
      return guardada ? REGISTRADA : PENDIENTE
    })

    const guardar = await panel.findByRole('button', {
      name: 'Guardar asistencia',
    })
    expect(guardar).toBeDisabled()
    expect(panel.getByText('Faltan 3 por marcar.')).toBeInTheDocument()

    marcar(panel, 'Ana Ávila', 'Presente')
    marcar(panel, 'Bruno Díaz', 'Ausente')
    expect(guardar).toBeDisabled()
    expect(panel.getByText('Faltan 1 por marcar.')).toBeInTheDocument()

    marcar(panel, 'Zoe Ruiz', 'Presente')
    expect(guardar).toBeEnabled()
    fireEvent.click(guardar)

    // Tras guardar se muestra en solo lectura.
    expect(
      await panel.findByRole('table', { name: 'Asistencia registrada' }),
    ).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        marcas: [
          { alumnoId: 'a1', presente: true },
          { alumnoId: 'a2', presente: false },
          { alumnoId: 'a3', presente: true },
        ],
      },
    ])
  })

  test.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    'una clase con asistencia se muestra en solo lectura (%s)',
    async (rol) => {
      const panel = await abrir(rol, () => REGISTRADA)

      const tabla = await panel.findByRole('table', {
        name: 'Asistencia registrada',
      })
      expect(
        within(tabla)
          .getAllByRole('row')
          .map((f) => f.textContent),
      ).toEqual([
        'AlumnoAsistencia',
        'Ana ÁvilaPresente',
        'Bruno DíazAusente',
        'Zoe RuizPresente',
      ])
      expect(
        panel.getByText(/^Registrada por Camila Rojas el /),
      ).toBeInTheDocument()
      expect(panel.queryByRole('radio')).not.toBeInTheDocument()
      expect(
        panel.queryByRole('button', { name: 'Guardar asistencia' }),
      ).not.toBeInTheDocument()
    },
  )

  test('el ayudante no puede marcar una clase sin asistencia', async () => {
    const panel = await abrir('AYUDANTE', () => PENDIENTE)

    expect(
      await panel.findByText('Aún no se registra la asistencia de esta clase.'),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Marcar asistencia' }),
    ).not.toBeInTheDocument()
  })

  test('una sección sin alumnos lo indica', async () => {
    const panel = await abrir('PROFESOR', () => ({ ...PENDIENTE, alumnos: [] }))

    expect(
      await panel.findByText('La sección no tiene alumnos inscritos'),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Marcar asistencia' }),
    ).not.toBeInTheDocument()
  })

  test('si ya estaba registrada (409) muestra el mensaje', async () => {
    const mensaje =
      'La asistencia de esta clase ya está registrada; corregirla es otra acción'
    const panel = await abrir('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 409, message: mensaje }, 409)
        : PENDIENTE,
    )
    await panel.findByRole('form', { name: 'Marcar asistencia' })
    for (const alumno of ['Ana Ávila', 'Bruno Díaz', 'Zoe Ruiz']) {
      marcar(panel, alumno, 'Presente')
    }
    fireEvent.click(panel.getByRole('button', { name: 'Guardar asistencia' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(mensaje)
  })

  test('tras un 400 (la lista cambió) permite volver a cargarla', async () => {
    let cambio = false
    const panel = await abrir('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        cambio = true
        return json(
          {
            statusCode: 400,
            message:
              'La lista debe tener exactamente una marca por cada alumno inscrito',
            faltantes: ['a4'],
            sobrantes: [],
            repetidos: [],
          },
          400,
        )
      }
      // Después del 400 la sección tiene un alumno más.
      return cambio
        ? {
            ...PENDIENTE,
            alumnos: [
              ...PENDIENTE.alumnos,
              { id: 'a4', nombre: 'Nuevo Alumno', presente: null },
            ],
          }
        : PENDIENTE
    })
    await panel.findByRole('form', { name: 'Marcar asistencia' })
    for (const alumno of ['Ana Ávila', 'Bruno Díaz', 'Zoe Ruiz']) {
      marcar(panel, alumno, 'Presente')
    }
    fireEvent.click(panel.getByRole('button', { name: 'Guardar asistencia' }))
    const alerta = await panel.findByRole('alert')

    fireEvent.click(
      within(alerta).getByRole('button', { name: 'Volver a cargar' }),
    )
    expect(
      await panel.findByRole('group', { name: 'Nuevo Alumno' }),
    ).toBeInTheDocument()
    expect(panel.queryByRole('alert')).not.toBeInTheDocument()
    expect(panel.getByText('Faltan 1 por marcar.')).toBeInTheDocument()
  })

  test('después de guardar, Guardar queda deshabilitado mientras recarga', async () => {
    let puts = 0
    let terminarRecarga!: (valor: unknown) => void
    const panel = await abrir('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        puts++
        return json(REGISTRADA, 201)
      }
      // La recarga posterior al guardado queda pendiente.
      return puts === 0
        ? PENDIENTE
        : new Promise((resolve) => {
            terminarRecarga = resolve
          })
    })
    await panel.findByRole('form', { name: 'Marcar asistencia' })
    for (const alumno of ['Ana Ávila', 'Bruno Díaz', 'Zoe Ruiz']) {
      marcar(panel, alumno, 'Presente')
    }
    const guardar = panel.getByRole('button', { name: 'Guardar asistencia' })
    fireEvent.click(guardar)

    await waitFor(() => expect(puts).toBe(1))
    await waitFor(() => expect(guardar).toBeDisabled())
    fireEvent.click(guardar)
    expect(puts).toBe(1)

    terminarRecarga(REGISTRADA)
    expect(
      await panel.findByRole('table', { name: 'Asistencia registrada' }),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const panel = await abrir('AYUDANTE', () =>
      ++intentos === 1 ? json({}, 500) : REGISTRADA,
    )

    expect(
      await panel.findByText('No pudimos cargar la asistencia de la clase.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(
      await panel.findByRole('table', { name: 'Asistencia registrada' }),
    ).toBeInTheDocument()
  })
})
