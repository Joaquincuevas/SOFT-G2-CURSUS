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
async function abrir(
  rol: Rol,
  asistencia: (init?: RequestInit) => unknown,
  extras: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [CLASES]: () => [CLASE],
    [ASISTENCIA]: asistencia,
    ...extras,
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
    expect(panel.getByText(/Faltan 3 por marcar\./)).toBeInTheDocument()

    marcar(panel, 'Ana Ávila', 'Presente')
    marcar(panel, 'Bruno Díaz', 'Ausente')
    expect(guardar).toBeDisabled()
    expect(panel.getByText(/Faltan 1 por marcar\./)).toBeInTheDocument()

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
    'una clase con asistencia muestra las marcas guardadas (%s)',
    async (rol) => {
      const panel = await abrir(rol, () => REGISTRADA)

      const tabla = await panel.findByRole('table', {
        name: 'Asistencia registrada',
      })
      expect(
        within(tabla)
          .getAllByRole('row')
          .map((f) =>
            Array.from(f.children)
              .slice(0, 2)
              .map((c) => c.textContent)
              .join(''),
          ),
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
        panel.queryByRole('button', { name: 'Marcar todos presentes' }),
      ).not.toBeInTheDocument()
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
    expect(
      panel.queryByRole('button', { name: 'Marcar todos presentes' }),
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
    expect(panel.getByText(/Faltan 1 por marcar\./)).toBeInTheDocument()
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

describe('marcado masivo y excepciones (ASI-03)', () => {
  test.each([false, true])(
    'una recarga pendiente libera los controles y conserva las excepciones (nuevo inscrito: %s)',
    async (nuevoInscrito) => {
      const enviados: unknown[] = []
      let terminarRecarga!: (valor: AsistenciaClase) => void
      const panel = await abrir('PROFESOR', (init) => {
        if (init?.method === 'POST') {
          enviados.push(JSON.parse(init.body as string))
          return json(REGISTRADA, 201)
        }
        if (enviados.length === 0) return PENDIENTE
        if (enviados.length > 1) return REGISTRADA
        return new Promise<AsistenciaClase>((resolve) => {
          terminarRecarga = resolve
        })
      })
      const todos = await panel.findByRole('button', {
        name: 'Marcar todos presentes',
      })
      fireEvent.click(todos)
      marcar(panel, 'Bruno Díaz', 'Ausente')
      const guardar = panel.getByRole('button', { name: 'Guardar asistencia' })
      fireEvent.click(guardar)
      await waitFor(() => expect(terminarRecarga).toBeTypeOf('function'))
      expect(todos).toBeDisabled()
      expect(guardar).toBeDisabled()
      for (const radio of panel.getAllByRole('radio'))
        expect(radio).toBeDisabled()
      fireEvent.click(guardar)
      expect(enviados).toHaveLength(1)

      // Incluso una respuesta idéntica debe terminar el bloqueo. Un nuevo
      // inscrito queda sin marcar y no se confunde con una ausencia.
      terminarRecarga(
        nuevoInscrito
          ? {
              ...PENDIENTE,
              alumnos: [
                ...PENDIENTE.alumnos,
                { id: 'a4', nombre: 'Nuevo Alumno', presente: null },
              ],
            }
          : PENDIENTE,
      )
      await waitFor(() => expect(todos).toBeEnabled())
      for (const radio of panel.getAllByRole('radio'))
        expect(radio).toBeEnabled()
      expect(
        within(panel.getByRole('group', { name: 'Bruno Díaz' })).getByLabelText(
          'Ausente',
        ),
      ).toBeChecked()
      expect(
        panel.getByText(
          new RegExp(
            `Presentes: 2 · Ausentes: 1 · Sin marcar: ${nuevoInscrito ? 1 : 0}\\.`,
          ),
        ),
      ).toBeInTheDocument()
      if (nuevoInscrito) {
        expect(guardar).toBeDisabled()
        marcar(panel, 'Nuevo Alumno', 'Presente')
      }
      expect(guardar).toBeEnabled()
      fireEvent.click(guardar)
      expect(
        await panel.findByRole('table', { name: 'Asistencia registrada' }),
      ).toBeInTheDocument()
      const marcas = [
        { alumnoId: 'a1', presente: true },
        { alumnoId: 'a2', presente: false },
        { alumnoId: 'a3', presente: true },
      ]
      expect(enviados).toEqual([
        { marcas },
        {
          marcas: nuevoInscrito
            ? [...marcas, { alumnoId: 'a4', presente: true }]
            : marcas,
        },
      ])
    },
  )

  test('marca toda la lista sin guardar y envía las excepciones solo al confirmar', async () => {
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
    const todos = await panel.findByRole('button', {
      name: 'Marcar todos presentes',
    })
    expect(
      panel.getByText(/Presentes: 0 · Ausentes: 0 · Sin marcar: 3\./),
    ).toBeInTheDocument()
    marcar(panel, 'Ana Ávila', 'Ausente')
    expect(
      panel.getByText(/Presentes: 0 · Ausentes: 1 · Sin marcar: 2\./),
    ).toBeInTheDocument()
    fireEvent.click(todos)
    expect(
      panel.getByText(/Presentes: 3 · Ausentes: 0 · Sin marcar: 0\./),
    ).toBeInTheDocument()
    for (const radio of panel.getAllByRole('radio', { name: 'Presente' })) {
      expect(radio).toBeChecked()
    }
    expect(enviados).toEqual([])
    marcar(panel, 'Bruno Díaz', 'Ausente')
    expect(
      panel.getByText(/Presentes: 2 · Ausentes: 1 · Sin marcar: 0\./),
    ).toBeInTheDocument()
    expect(enviados).toEqual([])
    fireEvent.click(panel.getByRole('button', { name: 'Guardar asistencia' }))
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
    expect(
      panel.queryByRole('button', { name: 'Marcar todos presentes' }),
    ).not.toBeInTheDocument()
  })

  test('repetir el marcado vuelve a todos presentes y permite ajustar nuevamente', async () => {
    const panel = await abrir('PROFESOR', () => PENDIENTE)
    const todos = await panel.findByRole('button', {
      name: 'Marcar todos presentes',
    })
    fireEvent.click(todos)
    for (const alumno of ['Ana Ávila', 'Bruno Díaz', 'Zoe Ruiz']) {
      marcar(panel, alumno, 'Ausente')
    }
    expect(
      panel.getByText(/Presentes: 0 · Ausentes: 3 · Sin marcar: 0\./),
    ).toBeInTheDocument()
    fireEvent.click(todos)
    expect(
      panel.getByText(/Presentes: 3 · Ausentes: 0 · Sin marcar: 0\./),
    ).toBeInTheDocument()
    marcar(panel, 'Zoe Ruiz', 'Ausente')
    marcar(panel, 'Zoe Ruiz', 'Presente')
    expect(
      panel.getByText(/Presentes: 3 · Ausentes: 0 · Sin marcar: 0\./),
    ).toBeInTheDocument()
  })

  test('bloquea las marcas durante el envío y conserva las excepciones si falla', async () => {
    let terminar!: (respuesta: Response) => void
    let envios = 0
    const panel = await abrir('PROFESOR', (init) => {
      if (init?.method !== 'POST') return PENDIENTE
      envios++
      return new Promise<Response>((resolve) => {
        terminar = resolve
      })
    })
    const todos = await panel.findByRole('button', {
      name: 'Marcar todos presentes',
    })
    fireEvent.click(todos)
    marcar(panel, 'Bruno Díaz', 'Ausente')
    const guardar = panel.getByRole('button', { name: 'Guardar asistencia' })
    fireEvent.click(guardar)
    await waitFor(() => expect(envios).toBe(1))
    expect(todos).toBeDisabled()
    expect(guardar).toBeDisabled()
    for (const radio of panel.getAllByRole('radio'))
      expect(radio).toBeDisabled()
    fireEvent.click(todos)
    fireEvent.click(guardar)
    expect(envios).toBe(1)
    terminar(json({}, 500))
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar la asistencia.',
    )
    expect(todos).toBeEnabled()
    expect(guardar).toBeEnabled()
    expect(
      within(panel.getByRole('group', { name: 'Bruno Díaz' })).getByLabelText(
        'Ausente',
      ),
    ).toBeChecked()
    expect(
      panel.getByText(/Presentes: 2 · Ausentes: 1 · Sin marcar: 0\./),
    ).toBeInTheDocument()
    // Se puede seguir ajustando tras el error.
    marcar(panel, 'Ana Ávila', 'Ausente')
    expect(
      panel.getByText(/Presentes: 1 · Ausentes: 2 · Sin marcar: 0\./),
    ).toBeInTheDocument()
  })
})

describe('ASI-04: corrección de marcas', () => {
  const correccion = `${ASISTENCIA}/alumnos/a2`
  test('recargar por la corrección de otra fila no desbloquea un envío pendiente', async () => {
    let terminarBruno!: (r: Response) => void
    let enviosBruno = 0
    let anaCorregida = false
    const panel = await abrir(
      'PROFESOR',
      () => ({
        ...REGISTRADA,
        alumnos: REGISTRADA.alumnos.map((a) =>
          a.id === 'a1' && anaCorregida ? { ...a, presente: false } : a,
        ),
      }),
      {
        [correccion]: () => {
          enviosBruno++
          return new Promise<Response>((resolve) => {
            terminarBruno = resolve
          })
        },
        [`${ASISTENCIA}/alumnos/a1`]: () => {
          anaCorregida = true
          return json(REGISTRADA)
        },
      },
    )
    fireEvent.click(
      await panel.findByRole('button', {
        name: 'Corregir asistencia de Bruno Díaz',
      }),
    )
    const bruno = within(
      panel.getByRole('form', { name: 'Corregir asistencia de Bruno Díaz' }),
    )
    fireEvent.change(bruno.getByLabelText('Motivo de la corrección'), {
      target: { value: 'Justificación' },
    })
    const guardarBruno = bruno.getByRole('button', {
      name: 'Guardar corrección',
    })
    fireEvent.click(guardarBruno)
    await waitFor(() => expect(enviosBruno).toBe(1))
    fireEvent.click(
      panel.getByRole('button', { name: 'Corregir asistencia de Ana Ávila' }),
    )
    const ana = within(
      panel.getByRole('form', { name: 'Corregir asistencia de Ana Ávila' }),
    )
    fireEvent.change(ana.getByLabelText('Motivo de la corrección'), {
      target: { value: 'Lista revisada' },
    })
    fireEvent.click(ana.getByRole('button', { name: 'Guardar corrección' }))
    await waitFor(() =>
      expect(
        within(
          panel
            .getByRole('button', { name: 'Corregir asistencia de Ana Ávila' })
            .closest('tr')!,
        ).getByText('Ausente'),
      ).toBeInTheDocument(),
    )
    expect(guardarBruno).toBeDisabled()
    expect(bruno.getByLabelText('Motivo de la corrección')).toBeDisabled()
    fireEvent.click(guardarBruno)
    expect(enviosBruno).toBe(1)
    terminarBruno(json(REGISTRADA))
    await waitFor(() =>
      expect(
        panel.queryByRole('form', {
          name: 'Corregir asistencia de Bruno Díaz',
        }),
      ).not.toBeInTheDocument(),
    )
  })
  test('el profesor corrige una ausencia con motivo y consulta el evento sin HTML ejecutable', async () => {
    let guardada = false
    let consultasHistorial = 0
    const enviados: unknown[] = []
    const panel = await abrir(
      'PROFESOR',
      () =>
        guardada
          ? {
              ...REGISTRADA,
              alumnos: REGISTRADA.alumnos.map((a) =>
                a.id === 'a2' ? { ...a, presente: true } : a,
              ),
            }
          : REGISTRADA,
      {
        [correccion]: (init) => {
          enviados.push(JSON.parse(init?.body as string))
          guardada = true
          return json(REGISTRADA)
        },
        [`${correccion}/historial`]: () => {
          consultasHistorial++
          return [
            {
              id: 'h1',
              anterior: false,
              nuevo: true,
              motivo: '<script>alert(1)</script> Justificante revisado',
              fecha: '2026-09-14T13:00:00.000Z',
              profesor: { id: 'p1', nombre: 'Camila Rojas' },
            },
          ]
        },
      },
    )
    fireEvent.click(
      await panel.findByRole('button', {
        name: 'Corregir asistencia de Bruno Díaz',
      }),
    )
    const form = within(
      panel.getByRole('form', { name: 'Corregir asistencia de Bruno Díaz' }),
    )
    expect(form.getByText('Marca actual: Ausente')).toBeInTheDocument()
    expect(form.getByLabelText('Nueva marca')).toHaveValue('true')
    expect(
      form.getByRole('button', { name: 'Guardar corrección' }),
    ).toBeDisabled()
    fireEvent.change(form.getByLabelText('Motivo de la corrección'), {
      target: { value: '  Justificante revisado  ' },
    })
    expect(enviados).toEqual([])
    expect(consultasHistorial).toBe(0)
    fireEvent.click(form.getByRole('button', { name: 'Guardar corrección' }))
    expect(await panel.findByText('Corrección guardada')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        panel.getByRole('button', {
          name: 'Corregir asistencia de Bruno Díaz',
        }),
      ).toBeEnabled(),
    )
    const fila = panel
      .getByRole('button', { name: 'Corregir asistencia de Bruno Díaz' })
      .closest('tr')!
    expect(within(fila).getByText('Presente')).toBeInTheDocument()
    expect(enviados).toEqual([
      { anterior: false, presente: true, motivo: 'Justificante revisado' },
    ])
    fireEvent.click(
      panel.getByRole('button', {
        name: 'Historial de asistencia de Bruno Díaz',
      }),
    )
    expect(await panel.findByText('Ausente → Presente')).toBeInTheDocument()
    expect(
      panel.getByText('<script>alert(1)</script> Justificante revisado'),
    ).toBeInTheDocument()
    expect(
      panel.getByText('Camila Rojas ·', { exact: false }),
    ).toBeInTheDocument()
    expect(
      panel
        .getByRole('list', { name: 'Correcciones de Bruno Díaz' })
        .querySelector('time'),
    ).toHaveAttribute('dateTime', '2026-09-14T13:00:00.000Z')
    expect(
      panel
        .getByRole('list', { name: 'Correcciones de Bruno Díaz' })
        .querySelector('script'),
    ).toBeNull()
  })

  test('cancela sin enviar y bloquea campos/doble envío; conserva el motivo ante conflicto y permite recargar', async () => {
    let terminar!: (r: Response) => void
    let envios = 0
    const panel = await abrir('PROFESOR', () => REGISTRADA, {
      [correccion]: () => {
        envios++
        return new Promise<Response>((r) => {
          terminar = r
        })
      },
    })
    const abrirBoton = await panel.findByRole('button', {
      name: 'Corregir asistencia de Bruno Díaz',
    })
    fireEvent.click(abrirBoton)
    fireEvent.click(panel.getByRole('button', { name: 'Cancelar corrección' }))
    expect(envios).toBe(0)
    fireEvent.click(
      panel.getByRole('button', { name: 'Corregir asistencia de Bruno Díaz' }),
    )
    const motivo = panel.getByLabelText('Motivo de la corrección')
    fireEvent.change(motivo, { target: { value: 'Se revisó la lista' } })
    const guardar = panel.getByRole('button', { name: 'Guardar corrección' })
    fireEvent.click(guardar)
    await waitFor(() => expect(envios).toBe(1))
    expect(guardar).toBeDisabled()
    expect(motivo).toBeDisabled()
    expect(panel.getByLabelText('Nueva marca')).toBeDisabled()
    expect(
      panel.getByRole('button', { name: 'Cancelar corrección' }),
    ).toBeDisabled()
    fireEvent.click(guardar)
    expect(envios).toBe(1)
    terminar(json({ message: 'La marca cambió mientras la editabas' }, 409))
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'La marca cambió mientras la editabas',
    )
    expect(motivo).toHaveValue('Se revisó la lista')
    expect(guardar).toBeEnabled()
    fireEvent.click(
      panel.getByRole('button', { name: 'Volver a cargar asistencia' }),
    )
    await waitFor(() =>
      expect(
        panel.queryByRole('form', {
          name: 'Corregir asistencia de Bruno Díaz',
        }),
      ).not.toBeInTheDocument(),
    )
  })

  test('el historial permite reintentar y muestra vacío sin correcciones', async () => {
    let intentos = 0
    const panel = await abrir('PROFESOR', () => REGISTRADA, {
      [`${correccion}/historial`]: () =>
        ++intentos === 1 ? json({}, 500) : [],
    })
    fireEvent.click(
      await panel.findByRole('button', {
        name: 'Historial de asistencia de Bruno Díaz',
      }),
    )
    expect(
      await panel.findByText('No pudimos cargar las correcciones.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(
      await panel.findByText('Sin correcciones registradas'),
    ).toBeInTheDocument()
  })

  test('el ayudante no recibe acciones de corrección ni historial', async () => {
    const panel = await abrir('AYUDANTE', () => REGISTRADA)
    await panel.findByRole('table', { name: 'Asistencia registrada' })
    expect(
      panel.queryByRole('button', { name: /Corregir asistencia/ }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: /Historial de asistencia/ }),
    ).not.toBeInTheDocument()
  })

  test('el alumno ve la marca vigente al reabrir Asistencia, sin acciones ni nombres de otros alumnos', async () => {
    let presente = true
    await renderConSesion('ALUMNO', VISTA, {
      [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol: 'ALUMNO' }),
      '/api/espacio/secciones/seccion-1/mi-asistencia': () => [
        { clase: CLASE, presente },
      ],
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
    const panel = within(screen.getByRole('tabpanel', { name: 'Asistencia' }))
    expect(await panel.findByText('Presente')).toBeInTheDocument()
    expect(panel.queryByText('Bruno Díaz')).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: /Corregir/ }),
    ).not.toBeInTheDocument()
    presente = false
    fireEvent.click(screen.getByRole('tab', { name: 'Anuncios' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Asistencia' }))
    expect(
      await within(
        screen.getByRole('tabpanel', { name: 'Asistencia' }),
      ).findByText('Ausente'),
    ).toBeInTheDocument()
  })

  test('la lectura del alumno muestra error y permite reintentar', async () => {
    let intento = 0
    await renderConSesion('ALUMNO', VISTA, {
      [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol: 'ALUMNO' }),
      '/api/espacio/secciones/seccion-1/mi-asistencia': () =>
        ++intento === 1 ? json({}, 500) : [],
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
    expect(
      await screen.findByText('No pudimos cargar tu asistencia.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByText(
        'Aún no tienes marcas de asistencia registradas.',
      ),
    ).toBeInTheDocument()
  })
})
