import type {
  EvaluacionesSeccion,
  NotasEvaluacion,
  Rol,
  SeccionResumen,
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
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: () => LISTA,
    [NOTAS]: notas,
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
    expect(formulario.getByLabelText('Nota de Ana Ávila')).toHaveValue(null)
    expect(formulario.getByLabelText('Nota de Bruno Díaz')).toHaveValue(5.5)
    expect(
      formulario.getByRole('button', { name: 'Guardar notas' }),
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
    const guardar = panel.getByRole('button', { name: 'Guardar notas' })
    expect(guardar).toBeEnabled()
    fireEvent.click(guardar)

    expect(await panel.findByRole('status')).toHaveTextContent(
      'Notas guardadas como propuesta.',
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
    expect(panel.getByRole('button', { name: 'Guardar notas' })).toBeDisabled()
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
    const guardar = panel.getByRole('button', { name: 'Guardar notas' })
    fireEvent.click(guardar)

    await waitFor(() => expect(puts).toBe(1))
    await waitFor(() => expect(guardar).toBeDisabled())
    fireEvent.click(guardar)
    expect(puts).toBe(1)

    terminarRecarga(SIN_NOTAS)
  })

  test('la misma nota escrita de otra forma no es un cambio', async () => {
    let puts = 0
    const panel = await abrirNotas('AYUDANTE', (init) => {
      if (init?.method === 'PUT') puts++
      return SIN_NOTAS
    })
    await abrirEvaluacion(panel)
    const guardar = panel.getByRole('button', { name: 'Guardar notas' })

    // Bruno ya tiene 5,5: guardarlo no cambiaría nada, y la recarga traería
    // las mismas notas, así que Guardar quedaría deshabilitado sin salida.
    escribir(panel, 'Bruno Díaz', '5.50')
    expect(guardar).toBeDisabled()

    escribir(panel, 'Ana Ávila', '6')
    expect(guardar).toBeEnabled()
    expect(puts).toBe(0)
  })

  test('un 400 "Nota inválida" muestra el mensaje', async () => {
    const panel = await abrirNotas('AYUDANTE', (init) =>
      init?.method === 'PUT'
        ? json({ statusCode: 400, message: 'Nota inválida' }, 400)
        : SIN_NOTAS,
    )
    await abrirEvaluacion(panel)
    escribir(panel, 'Ana Ávila', '8')
    fireEvent.click(panel.getByRole('button', { name: 'Guardar notas' }))

    expect(await panel.findByRole('alert')).toHaveTextContent('Nota inválida.')
    expect(panel.getByRole('button', { name: 'Guardar notas' })).toBeEnabled()
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

  test.each<Rol>(['PROFESOR', 'ALUMNO'])(
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
  expect(
    panel.queryAllByRole('spinbutton', { name: /^Nota de / }),
  ).toHaveLength(0)
  expect(
    panel.queryByRole('form', { name: 'Ingresar notas' }),
  ).not.toBeInTheDocument()
}
