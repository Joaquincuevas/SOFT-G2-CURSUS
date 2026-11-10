import {
  type ErrorNotasFaltantes,
  type ErrorNotasInvalidas,
  type EvaluacionesSeccion,
  MENSAJES_NOTA_INVALIDA,
  type NotasEvaluacion,
  type Rol,
  type SeccionResumen,
} from '@cursus/shared'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { json, renderConSesion, simularBackend } from '../test/sesion'
import { PestanaNotas } from './PestanaNotas'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'
const NOTAS = '/api/espacio/secciones/seccion-1/evaluaciones/e1/notas'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'AYUDANTE',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

const EVALUACION = {
  id: 'e1',
  nombre: 'Control 1',
  fecha: '2026-09-01',
  ponderacion: 20,
}

const LISTA: EvaluacionesSeccion = {
  evaluaciones: [EVALUACION],
  sumaPonderaciones: 20,
}

const SIN_NOTAS: NotasEvaluacion = {
  evaluacion: EVALUACION,
  estado: 'BORRADOR',
  alumnos: [
    { id: 'a1', nombre: 'Ana Ávila', nota: null, estado: null },
    { id: 'a2', nombre: 'Bruno Díaz', nota: 5.5, estado: 'PROPUESTA' },
    { id: 'a3', nombre: 'Zoe Ruiz', nota: null, estado: null },
  ],
}

// Abre la pestaña Notas con el rol dado y las notas de la evaluación e1.
async function abrirNotas(
  rol: Rol,
  notas: (init?: RequestInit) => unknown = () => SIN_NOTAS,
  envio?: (init?: RequestInit) => unknown,
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: () => LISTA,
    [NOTAS]: notas,
    ...(envio && { [`${NOTAS}/envio`]: envio }),
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  const panel = within(screen.getByRole('tabpanel', { name: 'Notas' }))
  await panel.findByRole('table')
  return panel
}

async function abrirEvaluacion(panel: ReturnType<typeof within>) {
  fireEvent.click(panel.getByRole('button', { name: 'Notas de Control 1' }))
  return panel.findByRole('form', { name: 'Ingresar notas' })
}

const escribir = (
  panel: ReturnType<typeof within>,
  alumno: string,
  valor: string,
) =>
  fireEvent.change(panel.getByLabelText(`Nota de ${alumno}`), {
    target: { value: valor },
  })

describe('ingreso de notas del ayudante (NOT-05)', () => {
  test('muestra a todos los alumnos con un campo de nota y su estado', async () => {
    const panel = await abrirNotas('AYUDANTE')
    const formulario = within(await abrirEvaluacion(panel))

    expect(
      formulario.getAllByRole('row').map((fila) => fila.textContent),
    ).toEqual([
      'AlumnoNotaEstado',
      'Ana ÁvilaSin nota',
      'Bruno DíazPropuesta',
      'Zoe RuizSin nota',
    ])
    expect(formulario.getByLabelText('Nota de Ana Ávila')).toHaveValue('')
    expect(formulario.getByLabelText('Nota de Bruno Díaz')).toHaveValue('5.5')
    expect(
      formulario.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeDisabled()
  })

  test('guarda solo las notas que cambiaron y quedan como propuesta', async () => {
    const enviados: unknown[] = []
    let guardadas = false
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        enviados.push(JSON.parse(init.body as string))
        guardadas = true
        return json({
          ...SIN_NOTAS,
          alumnos: [
            { id: 'a1', nombre: 'Ana Ávila', nota: 6.1, estado: 'PROPUESTA' },
            SIN_NOTAS.alumnos[1],
            SIN_NOTAS.alumnos[2],
          ],
        })
      }
      return guardadas
        ? {
            ...SIN_NOTAS,
            alumnos: [
              { id: 'a1', nombre: 'Ana Ávila', nota: 6.1, estado: 'PROPUESTA' },
              SIN_NOTAS.alumnos[1],
              SIN_NOTAS.alumnos[2],
            ],
          }
        : SIN_NOTAS
    })
    await abrirEvaluacion(panel)

    escribir(panel, 'Ana Ávila', '6.1')
    const guardar = panel.getByRole('button', { name: 'Guardar borrador' })
    expect(guardar).toBeEnabled()
    fireEvent.click(guardar)

    expect(await panel.findByRole('status')).toHaveTextContent(
      'Borrador guardado.',
    )
    // Guardado parcial: Zoe sin nota y Bruno sin cambios no se envían.
    expect(enviados).toEqual([{ notas: [{ alumnoId: 'a1', nota: 6.1 }] }])
    await waitFor(() =>
      expect(
        panel
          .getAllByRole('row')
          .map((fila) => fila.textContent)
          .find((texto) => texto?.startsWith('Ana Ávila')),
      ).toBe('Ana ÁvilaPropuesta'),
    )
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeDisabled()
  })

  test('después de guardar, Guardar queda deshabilitado mientras recarga', async () => {
    let puts = 0
    let terminarRecarga!: (valor: unknown) => void
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        puts++
        return json(SIN_NOTAS)
      }
      return puts === 0
        ? SIN_NOTAS
        : new Promise((resolve) => {
            terminarRecarga = resolve
          })
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Zoe Ruiz', '4')
    const guardar = panel.getByRole('button', { name: 'Guardar borrador' })
    fireEvent.click(guardar)

    await waitFor(() => expect(puts).toBe(1))
    await waitFor(() => expect(guardar).toBeDisabled())
    fireEvent.click(guardar)
    expect(puts).toBe(1)

    terminarRecarga(SIN_NOTAS)
  })

  // Caso de la revisión: se guarda 6,0 para Bruno, pero otro ayudante
  // restaura su 5,5 antes de la recarga, que trae lo mismo que al abrir.
  test('si la recarga trae las mismas notas, el formulario se reinicia con ellas', async () => {
    let puts = 0
    let terminarRecarga: ((valor: unknown) => void) | undefined
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        puts++
        return json({
          ...SIN_NOTAS,
          alumnos: [
            SIN_NOTAS.alumnos[0],
            { ...SIN_NOTAS.alumnos[1], nota: 6 },
            SIN_NOTAS.alumnos[2],
          ],
        })
      }
      return puts === 0
        ? SIN_NOTAS
        : new Promise((resolve) => {
            terminarRecarga = resolve
          })
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Bruno Díaz', '6.0')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() => expect(terminarRecarga).toBeDefined())
    terminarRecarga!(SIN_NOTAS)

    const bruno = panel.getByLabelText('Nota de Bruno Díaz')
    await waitFor(() => expect(bruno).toBeEnabled())
    expect(bruno).toHaveValue('5.5')
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeDisabled()
  })

  test('si la recarga falla, se desbloquea con las notas del servidor y muestra el error', async () => {
    let puts = 0
    const panel = await abrirNotas('AYUDANTE', (init) => {
      // El PUT responde las notas como quedaron en el servidor: Bruno con
      // 5,5, no el 6,0 que se escribió.
      if (init?.method === 'PUT') {
        puts++
        return json(SIN_NOTAS)
      }
      return puts === 0 ? SIN_NOTAS : json({}, 500)
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Bruno Díaz', '6.0')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'no pudimos recargarlas',
    )
    const bruno = panel.getByLabelText('Nota de Bruno Díaz')
    expect(bruno).toBeEnabled()
    expect(bruno).toHaveValue('5.5')
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeDisabled()
  })

  test('mientras guarda no se puede escribir: la recarga borraría lo nuevo', async () => {
    let terminarPut!: (valor: unknown) => void
    const panel = await abrirNotas('AYUDANTE', (init) =>
      init?.method === 'PUT'
        ? new Promise((resolve) => {
            terminarPut = resolve
          })
        : SIN_NOTAS,
    )
    await abrirEvaluacion(panel)
    escribir(panel, 'Zoe Ruiz', '4')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() =>
      expect(panel.getByLabelText('Nota de Ana Ávila')).toBeDisabled(),
    )
    expect(panel.getByLabelText('Nota de Zoe Ruiz')).toBeDisabled()

    terminarPut(json({}, 500))
    // Si falla, se puede seguir editando.
    await waitFor(() =>
      expect(panel.getByLabelText('Nota de Ana Ávila')).toBeEnabled(),
    )
  })

  test('la misma nota escrita de otra forma no es un cambio', async () => {
    let puts = 0
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') puts++
      return SIN_NOTAS
    })
    await abrirEvaluacion(panel)
    const guardar = panel.getByRole('button', { name: 'Guardar borrador' })

    // Bruno ya tiene 5,5: guardarlo no cambiaría nada, así que no se envía.
    escribir(panel, 'Bruno Díaz', '5.50')
    expect(guardar).toBeDisabled()
    escribir(panel, 'Bruno Díaz', '5,5')
    expect(guardar).toBeDisabled()

    escribir(panel, 'Ana Ávila', '6')
    expect(guardar).toBeEnabled()
    expect(puts).toBe(0)
  })

  // NOT-06: validación al escribir.
  test.each([
    ['8', MENSAJES_NOTA_INVALIDA.rango],
    ['0,9', MENSAJES_NOTA_INVALIDA.rango],
    ['7.1', MENSAJES_NOTA_INVALIDA.rango],
    ['5,55', MENSAJES_NOTA_INVALIDA.formato],
    ['0,99999999999', MENSAJES_NOTA_INVALIDA.formato],
    ['7.00000000001', MENSAJES_NOTA_INVALIDA.formato],
    ['x', MENSAJES_NOTA_INVALIDA.formato],
  ])(
    'una nota %j se marca en rojo con su motivo y deshabilita Guardar',
    async (texto, motivo) => {
      const panel = await abrirNotas('AYUDANTE')
      await abrirEvaluacion(panel)
      const guardar = panel.getByRole('button', { name: 'Guardar borrador' })
      escribir(panel, 'Zoe Ruiz', '4')
      expect(guardar).toBeEnabled()

      escribir(panel, 'Ana Ávila', texto)
      const ana = panel.getByLabelText('Nota de Ana Ávila')
      expect(ana).toHaveAttribute('aria-invalid', 'true')
      expect(ana).toHaveClass('notas__nota--invalida')
      expect(ana).toHaveAccessibleDescription(motivo)
      // Un lector de pantalla lo anuncia mientras se escribe.
      expect(panel.getByText(motivo)).toHaveAttribute('aria-live', 'polite')
      // Aunque Zoe tenga una nota válida, no se guarda ninguna.
      expect(guardar).toBeDisabled()

      escribir(panel, 'Ana Ávila', '6')
      expect(ana).not.toHaveAttribute('aria-invalid')
      expect(panel.queryByText(motivo)).not.toBeInTheDocument()
      expect(guardar).toBeEnabled()
    },
  )

  test('un separador al final no se marca mientras se escribe "5,5"', async () => {
    const panel = await abrirNotas('AYUDANTE')
    await abrirEvaluacion(panel)
    const ana = panel.getByLabelText('Nota de Ana Ávila')

    for (const paso of ['5', '5,', '5,5']) {
      escribir(panel, 'Ana Ávila', paso)
      expect(ana).not.toHaveAttribute('aria-invalid')
    }
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeEnabled()
  })

  test('un 400 sin notas inválidas muestra el mensaje sin marcar campos', async () => {
    const panel = await abrirNotas('AYUDANTE', (init) =>
      init?.method === 'PUT'
        ? json(
            {
              statusCode: 400,
              message:
                'Solo se ingresan notas de alumnos inscritos, una por alumno',
              sobrantes: ['a1'],
              repetidos: [],
            },
            400,
          )
        : SIN_NOTAS,
    )
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '6')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Solo se ingresan notas de alumnos inscritos, una por alumno.',
    )
    expect(panel.getByLabelText('Nota de Ana Ávila')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeEnabled()
  })

  test('acepta coma y punto como separador decimal', async () => {
    const enviados: unknown[] = []
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        enviados.push(JSON.parse(init.body as string))
        return json(SIN_NOTAS)
      }
      return SIN_NOTAS
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '5,5')
    escribir(panel, 'Zoe Ruiz', '6.5')
    expect(panel.getByLabelText('Nota de Ana Ávila')).not.toHaveAttribute(
      'aria-invalid',
    )
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() =>
      expect(enviados).toEqual([
        {
          notas: [
            { alumnoId: 'a1', nota: 5.5 },
            { alumnoId: 'a3', nota: 6.5 },
          ],
        },
      ]),
    )
  })

  test('si el 400 trae notas inválidas, marca esos campos con su motivo', async () => {
    const panel = await abrirNotas('AYUDANTE', (init) =>
      init?.method === 'PUT'
        ? json(
            {
              statusCode: 400,
              message: 'Nota inválida',
              invalidas: [
                { alumnoId: 'a1', motivo: MENSAJES_NOTA_INVALIDA.rango },
              ],
            } satisfies ErrorNotasInvalidas,
            400,
          )
        : SIN_NOTAS,
    )
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '6')
    escribir(panel, 'Zoe Ruiz', '4')
    const guardar = panel.getByRole('button', { name: 'Guardar borrador' })
    fireEvent.click(guardar)

    expect(await panel.findByRole('alert')).toHaveTextContent('Nota inválida.')
    const ana = panel.getByLabelText('Nota de Ana Ávila')
    await waitFor(() => expect(ana).toHaveAttribute('aria-invalid', 'true'))
    expect(ana).toHaveAccessibleDescription(MENSAJES_NOTA_INVALIDA.rango)
    expect(panel.getByLabelText('Nota de Zoe Ruiz')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(guardar).toBeDisabled()

    // Al corregir el campo se quita la marca del servidor.
    escribir(panel, 'Ana Ávila', '6.5')
    expect(ana).not.toHaveAttribute('aria-invalid')
    expect(guardar).toBeEnabled()
  })

  test('una nota publicada se muestra sin poder editarla', async () => {
    const panel = await abrirNotas('AYUDANTE', () => ({
      ...SIN_NOTAS,
      alumnos: [
        { id: 'a1', nombre: 'Ana Ávila', nota: 6, estado: 'PUBLICADA' },
      ],
    }))
    await abrirEvaluacion(panel)

    expect(panel.getByLabelText('Nota de Ana Ávila')).toBeDisabled()
    expect(panel.getByText('Publicada')).toBeInTheDocument()
  })

  test('una sección sin alumnos lo indica', async () => {
    const panel = await abrirNotas('AYUDANTE', () => ({
      ...SIN_NOTAS,
      alumnos: [],
    }))
    fireEvent.click(panel.getByRole('button', { name: 'Notas de Control 1' }))

    expect(
      await panel.findByText('La sección no tiene alumnos inscritos'),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Ingresar notas' }),
    ).not.toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const panel = await abrirNotas('AYUDANTE', () =>
      ++intentos === 1 ? json({}, 500) : SIN_NOTAS,
    )
    fireEvent.click(panel.getByRole('button', { name: 'Notas de Control 1' }))

    expect(
      await panel.findByText('No pudimos cargar las notas de la evaluación.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(
      await panel.findByRole('form', { name: 'Ingresar notas' }),
    ).toBeInTheDocument()
  })

  test.each<Rol>(['ALUMNO'])(
    '%s no ve el botón ni campos de nota',
    async (rol) => {
      const panel = await abrirNotas(rol)
      sinIngresoDeNotas(panel)
    },
  )

  // El Director no tiene ruta a esta vista (/mis-cursos no está en su menú),
  // así que se renderiza la pestaña directamente.
  test('DIRECTOR no ve el botón ni campos de nota', async () => {
    simularBackend('DIRECTOR', { [EVALUACIONES]: () => LISTA })
    render(
      <MemoryRouter>
        <AuthProvider initialToken="jwt-de-prueba">
          <PestanaNotas seccionId="seccion-1" rol="DIRECTOR" />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Control 1')).toBeInTheDocument()
    sinIngresoDeNotas(
      within(screen.getByRole('region', { name: 'Evaluaciones' })),
    )
  })
})

function sinIngresoDeNotas(panel: ReturnType<typeof within>) {
  expect(
    panel.queryByRole('button', { name: 'Notas de Control 1' }),
  ).not.toBeInTheDocument()
  expect(
    panel.queryByRole('columnheader', { name: 'Notas' }),
  ).not.toBeInTheDocument()
  expect(panel.queryAllByLabelText(/^Nota de /)).toHaveLength(0)
  expect(
    panel.queryByRole('form', { name: 'Ingresar notas' }),
  ).not.toBeInTheDocument()
}

describe('borrador de notas (NOT-07)', () => {
  test('Guardar borrador guarda aunque falten alumnos y al volver se recuperan', async () => {
    // Backend simulado: el GET devuelve lo último que guardó el PUT.
    let actuales = SIN_NOTAS
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        const { notas } = JSON.parse(init.body as string) as {
          notas: { alumnoId: string; nota: number }[]
        }
        actuales = {
          ...actuales,
          alumnos: actuales.alumnos.map((a) => {
            const nueva = notas.find((n) => n.alumnoId === a.id)
            return nueva ? { ...a, nota: nueva.nota, estado: 'PROPUESTA' } : a
          }),
        }
        return json(actuales)
      }
      return actuales
    })
    await abrirEvaluacion(panel)
    expect(panel.getByText('Estado: Borrador')).toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Guardar notas' }),
    ).not.toBeInTheDocument()

    // Solo Ana: Zoe queda sin nota.
    escribir(panel, 'Ana Ávila', '6,1')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))
    expect(await panel.findByRole('status')).toHaveTextContent(
      'Borrador guardado.',
    )

    // Cerrar y volver a abrir la evaluación pide las notas de nuevo.
    fireEvent.click(panel.getByRole('button', { name: 'Notas de Control 1' }))
    expect(
      panel.queryByRole('form', { name: 'Ingresar notas' }),
    ).not.toBeInTheDocument()
    await abrirEvaluacion(panel)
    expect(await panel.findByLabelText('Nota de Ana Ávila')).toHaveValue('6.1')
    expect(panel.getByLabelText('Nota de Bruno Díaz')).toHaveValue('5.5')
    expect(panel.getByLabelText('Nota de Zoe Ruiz')).toHaveValue('')
    expect(panel.getByText('Estado: Borrador')).toBeInTheDocument()
  })

  test('el profesor no ve la evaluación en borrador como pendiente de revisión', async () => {
    const panel = await abrirNotas('PROFESOR')
    expect(panel.getByText('Control 1')).toBeInTheDocument()
    expect(panel.queryByText(/pendiente/i)).not.toBeInTheDocument()
    expect(panel.queryByText(/borrador/i)).not.toBeInTheDocument()
    expect(panel.queryByText(/en revisión/i)).not.toBeInTheDocument()
  })
})

describe('envío a revisión (NOT-08)', () => {
  // Todos con nota guardada: se puede enviar.
  const COMPLETAS: NotasEvaluacion = {
    ...SIN_NOTAS,
    alumnos: SIN_NOTAS.alumnos.map((a) => ({
      ...a,
      nota: a.nota ?? 6,
      estado: 'PROPUESTA',
    })),
  }
  const enviarARevision = (panel: ReturnType<typeof within>) =>
    panel.getByRole('button', { name: 'Enviar a revisión' })

  test('con notas faltantes el botón queda deshabilitado y lo explica', async () => {
    const panel = await abrirNotas('AYUDANTE')
    await abrirEvaluacion(panel)

    expect(enviarARevision(panel)).toBeDisabled()
    expect(
      panel.getByText(
        'Para enviar a revisión, todos los alumnos deben tener una nota guardada.',
      ),
    ).toBeInTheDocument()
    // Escribir las que faltan no basta: hay que guardarlas antes.
    escribir(panel, 'Ana Ávila', '5')
    escribir(panel, 'Zoe Ruiz', '4')
    expect(enviarARevision(panel)).toBeDisabled()
  })

  test('pide confirmación; al enviar queda en revisión y en solo lectura', async () => {
    let enviada = false
    const envios: (RequestInit | undefined)[] = []
    const panel = await abrirNotas(
      'AYUDANTE',
      () => (enviada ? { ...COMPLETAS, estado: 'EN_REVISION' } : COMPLETAS),
      (init) => {
        envios.push(init)
        enviada = true
        return { ...COMPLETAS, estado: 'EN_REVISION' }
      },
    )
    await abrirEvaluacion(panel)

    // Cancelar no envía.
    fireEvent.click(enviarARevision(panel))
    const confirmar = within(
      panel.getByRole('region', { name: 'Confirmar envío' }),
    )
    expect(
      confirmar.getByText(
        '¿Enviar las notas a revisión? No podrás editarlas hasta que el profesor responda.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(confirmar.getByRole('button', { name: 'Cancelar' }))
    expect(
      panel.queryByRole('region', { name: 'Confirmar envío' }),
    ).not.toBeInTheDocument()
    expect(envios).toEqual([])

    fireEvent.click(enviarARevision(panel))
    fireEvent.click(
      within(panel.getByRole('region', { name: 'Confirmar envío' })).getByRole(
        'button',
        { name: 'Enviar' },
      ),
    )

    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(envios).toHaveLength(1)
    expect(envios[0]?.method).toBe('POST')
    expect(panel.getByRole('status')).toHaveTextContent(
      'Notas enviadas a revisión.',
    )
    for (const campo of panel.getAllByLabelText(/^Nota de /)) {
      expect(campo).toHaveAttribute('readonly')
    }
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Enviar a revisión' }),
    ).not.toBeInTheDocument()
  })

  test.each(['EN_REVISION', 'APROBADA'] as const)(
    'una evaluación %s se abre en solo lectura',
    async (estado) => {
      const panel = await abrirNotas('AYUDANTE', () => ({
        ...COMPLETAS,
        estado,
      }))
      await abrirEvaluacion(panel)
      expect(panel.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
        'readonly',
      )
      expect(
        panel.queryByRole('button', { name: 'Enviar a revisión' }),
      ).not.toBeInTheDocument()
    },
  )

  test('una evaluación devuelta se edita y se vuelve a enviar', async () => {
    const panel = await abrirNotas('AYUDANTE', () => ({
      ...COMPLETAS,
      estado: 'DEVUELTA',
    }))
    await abrirEvaluacion(panel)
    expect(panel.getByText('Estado: Devuelta')).toBeInTheDocument()
    expect(panel.getByLabelText('Nota de Ana Ávila')).not.toHaveAttribute(
      'readonly',
    )
    expect(enviarARevision(panel)).toBeEnabled()
  })

  test('si el envío falla muestra el error y permite reintentar', async () => {
    let intentos = 0
    let enviada = false
    const panel = await abrirNotas(
      'AYUDANTE',
      () => (enviada ? { ...COMPLETAS, estado: 'EN_REVISION' } : COMPLETAS),
      () => {
        if (++intentos === 1) return json({}, 500)
        enviada = true
        return { ...COMPLETAS, estado: 'EN_REVISION' }
      },
    )
    await abrirEvaluacion(panel)
    const confirmarYEnviar = () => {
      fireEvent.click(
        within(
          panel.getByRole('region', { name: 'Confirmar envío' }),
        ).getByRole('button', { name: 'Enviar' }),
      )
    }

    fireEvent.click(enviarARevision(panel))
    confirmarYEnviar()
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos enviar las notas. Inténtalo nuevamente.',
    )
    expect(panel.getByText('Estado: Borrador')).toBeInTheDocument()

    // La confirmación sigue abierta: Enviar reintenta.
    confirmarYEnviar()
    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(intentos).toBe(2)
  })

  test('un 400 con faltantes nombra a los alumnos sin nota', async () => {
    const panel = await abrirNotas(
      'AYUDANTE',
      () => COMPLETAS,
      () =>
        json(
          {
            statusCode: 400,
            message: 'Faltan notas',
            faltantes: ['a3'],
          } satisfies ErrorNotasFaltantes,
          400,
        ),
    )
    await abrirEvaluacion(panel)
    fireEvent.click(enviarARevision(panel))
    fireEvent.click(
      within(panel.getByRole('region', { name: 'Confirmar envío' })).getByRole(
        'button',
        { name: 'Enviar' },
      ),
    )
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Faltan notas de: Zoe Ruiz.',
    )
  })

  test('un 409 del envío lo avisa y recarga en solo lectura', async () => {
    let enviadaPorOtro = false
    const panel = await abrirNotas(
      'AYUDANTE',
      () =>
        enviadaPorOtro ? { ...COMPLETAS, estado: 'EN_REVISION' } : COMPLETAS,
      () => {
        enviadaPorOtro = true
        return json(
          { statusCode: 409, message: 'Las notas están en revisión' },
          409,
        )
      },
    )
    await abrirEvaluacion(panel)
    fireEvent.click(enviarARevision(panel))
    fireEvent.click(
      within(panel.getByRole('region', { name: 'Confirmar envío' })).getByRole(
        'button',
        { name: 'Enviar' },
      ),
    )
    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(panel.getByRole('status')).toHaveTextContent(
      'Las notas están en revisión.',
    )
    expect(panel.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
      'readonly',
    )
  })

  test('un 409 del PUT (enviada por otro ayudante) lo avisa y recarga en solo lectura', async () => {
    let enviadaPorOtro = false
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        enviadaPorOtro = true
        return json(
          { statusCode: 409, message: 'Las notas están en revisión' },
          409,
        )
      }
      return enviadaPorOtro
        ? { ...COMPLETAS, estado: 'EN_REVISION' }
        : COMPLETAS
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '7')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(panel.getByRole('status')).toHaveTextContent(
      'Las notas están en revisión.',
    )
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
  })

  // Caso de la revisión: con la recarga demorada, los campos volvían a
  // editarse y lo escrito se perdía al llegar.
  test('al confirmar el envío queda en solo lectura sin esperar la recarga', async () => {
    let enviada = false
    const panel = await abrirNotas(
      'AYUDANTE',
      () => (enviada ? new Promise(() => {}) : COMPLETAS),
      () => {
        enviada = true
        return { ...COMPLETAS, estado: 'EN_REVISION' }
      },
    )
    await abrirEvaluacion(panel)
    fireEvent.click(enviarARevision(panel))
    fireEvent.click(
      within(panel.getByRole('region', { name: 'Confirmar envío' })).getByRole(
        'button',
        { name: 'Enviar' },
      ),
    )

    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    for (const campo of panel.getAllByLabelText(/^Nota de /)) {
      expect(campo).toHaveAttribute('readonly')
    }
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
  })

  // Caso de la revisión: otro ayudante envía entre nuestro PUT y la recarga.
  test('si la recarga después de guardar trae EN_REVISION, queda en solo lectura', async () => {
    let puts = 0
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        puts++
        return json(COMPLETAS)
      }
      return puts === 0 ? COMPLETAS : { ...COMPLETAS, estado: 'EN_REVISION' }
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '7')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    expect(await panel.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(panel.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
      'readonly',
    )
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
  })

  // Caso de la revisión: tras un 409, con la recarga demorada, los campos
  // seguían editables y lo escrito se perdía al llegar.
  test('un 409 del envío bloquea los campos sin esperar la recarga', async () => {
    let enviadaPorOtro = false
    const panel = await abrirNotas(
      'AYUDANTE',
      () => (enviadaPorOtro ? new Promise(() => {}) : COMPLETAS),
      () => {
        enviadaPorOtro = true
        return json(
          { statusCode: 409, message: 'Las notas están en revisión' },
          409,
        )
      },
    )
    await abrirEvaluacion(panel)
    fireEvent.click(enviarARevision(panel))
    fireEvent.click(
      within(panel.getByRole('region', { name: 'Confirmar envío' })).getByRole(
        'button',
        { name: 'Enviar' },
      ),
    )

    expect(await panel.findByRole('status')).toHaveTextContent(
      'Las notas están en revisión.',
    )
    for (const campo of panel.getAllByLabelText(/^Nota de /)) {
      expect(campo).toHaveAttribute('readonly')
    }
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Enviar a revisión' }),
    ).not.toBeInTheDocument()
  })

  test('un 409 del PUT bloquea los campos sin esperar la recarga', async () => {
    let enviadaPorOtro = false
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') {
        enviadaPorOtro = true
        return json(
          { statusCode: 409, message: 'Las notas están en revisión' },
          409,
        )
      }
      return enviadaPorOtro ? new Promise(() => {}) : COMPLETAS
    })
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '7')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar borrador' }))

    expect(await panel.findByRole('status')).toHaveTextContent(
      'Las notas están en revisión.',
    )
    for (const campo of panel.getAllByLabelText(/^Nota de /)) {
      expect(campo).toHaveAttribute('readonly')
    }
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
  })

  test('mientras se confirma el envío no se editan ni se guardan notas', async () => {
    const panel = await abrirNotas(
      'AYUDANTE',
      () => COMPLETAS,
      () => ({
        ...COMPLETAS,
        estado: 'EN_REVISION',
      }),
    )
    await abrirEvaluacion(panel)
    fireEvent.click(enviarARevision(panel))

    expect(panel.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
      'readonly',
    )
    expect(
      panel.getByRole('button', { name: 'Guardar borrador' }),
    ).toBeDisabled()
    // Al cancelar se vuelve a editar.
    fireEvent.click(panel.getByRole('button', { name: 'Cancelar' }))
    expect(panel.getByLabelText('Nota de Ana Ávila')).not.toHaveAttribute(
      'readonly',
    )
  })
})
