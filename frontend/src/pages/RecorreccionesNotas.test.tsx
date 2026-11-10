import type { NotasEvaluacion, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const BASE = '/api/espacio/secciones/seccion-1'
const NOTAS = `${BASE}/evaluaciones/e1/notas`
const RECORREGIR = `${NOTAS}/a1/recorreccion`
const EVALUACION = {
  id: 'e1',
  nombre: 'Control 1',
  fecha: '2026-09-01',
  ponderacion: 100,
}
const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'c1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'p1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'p1', nombre: 'Camila Rojas' },
  ayudantes: [],
}
const PUBLICADAS: NotasEvaluacion = {
  evaluacion: EVALUACION,
  estado: 'APROBADA',
  comentarioDevolucion: null,
  alumnos: [
    {
      id: 'a1',
      nombre: 'Ana Ávila',
      nota: 5.5,
      estado: 'PUBLICADA',
      recorregida: false,
    },
    {
      id: 'a2',
      nombre: 'Bruno Díaz',
      nota: null,
      estado: null,
      recorregida: false,
    },
  ],
}
const CORREGIDAS: NotasEvaluacion = {
  ...PUBLICADAS,
  alumnos: [
    { ...PUBLICADAS.alumnos[0], nota: 6.2, recorregida: true },
    PUBLICADAS.alumnos[1],
  ],
}

async function abrir(
  rol: Rol = 'PROFESOR',
  rutas: Record<string, (init?: RequestInit) => unknown> = {},
  datos = PUBLICADAS,
) {
  await renderConSesion(rol, VISTA, {
    [`${BASE}/resumen`]: () => ({ ...RESUMEN, rol }),
    [`${BASE}/evaluaciones`]: () => ({
      evaluaciones: [EVALUACION],
      sumaPonderaciones: 100,
    }),
    [NOTAS]: () => datos,
    ...rutas,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Notas de Control 1' }),
  )
  await screen.findByRole('region', { name: 'Notas de Control 1' })
  return within(screen.getByRole('region', { name: 'Notas de Control 1' }))
}
function completar(
  nota = '6,2',
  motivo = '  Se reconoció el procedimiento.  ',
) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota nueva' }), {
    target: { value: nota },
  })
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Motivo de la recorrección' }),
    { target: { value: motivo } },
  )
}
async function abrirFormulario() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Recorregir nota de Ana Ávila' }),
  )
  return screen.getByRole('form', { name: 'Recorregir nota de Ana Ávila' })
}

describe('NOT-15: el profesor registra una recorrección', () => {
  test('corrige con coma decimal, envía la nota vista y el motivo, y muestra el valor y la marca nuevos', async () => {
    const enviados: unknown[] = []
    const panel = await abrir('PROFESOR', {
      [RECORREGIR]: (init) => {
        enviados.push(JSON.parse(init?.body as string))
        return CORREGIDAS
      },
    })
    expect(
      panel.queryByRole('button', { name: 'Recorregir nota de Bruno Díaz' }),
    ).not.toBeInTheDocument()
    await abrirFormulario()
    expect(screen.getByText('5,5', { selector: 'strong' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    ).toBeDisabled()
    completar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    )
    expect(await panel.findByRole('status')).toHaveTextContent(
      'Recorrección guardada para Ana Ávila',
    )
    expect(enviados).toEqual([
      {
        notaAnterior: 5.5,
        notaNueva: 6.2,
        motivo: 'Se reconoció el procedimiento.',
      },
    ])
    const fila = panel
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Ana Ávila')) as HTMLElement
    expect(fila).toHaveTextContent('6,2')
    expect(fila).toHaveTextContent('Recorregida')
    expect(
      panel.queryByRole('form', { name: 'Recorregir nota de Ana Ávila' }),
    ).not.toBeInTheDocument()
  })
  test.each(['0,9', '7,1', '5,55', 'texto', '5,5'])(
    'rechaza %s antes de guardar',
    async (nota) => {
      await abrir()
      await abrirFormulario()
      completar(nota)
      expect(
        screen.getByRole('button', { name: 'Guardar recorrección' }),
      ).toBeDisabled()
    },
  )
  test('el motivo es obligatorio y el límite Unicode cuenta los mismos caracteres que PostgreSQL', async () => {
    await abrir()
    await abrirFormulario()
    completar('6,2', ' \n\t ')
    expect(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    ).toBeDisabled()
    completar('6,2', '😀'.repeat(500))
    expect(screen.getByText('500/500 caracteres')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    ).toBeEnabled()
    completar('6,2', '😀'.repeat(501))
    expect(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    ).toBeDisabled()
  })
  test.each(['Cancelar', 'Escape'])(
    '%s cierra sin enviar una recorrección',
    async (accion) => {
      let llamadas = 0
      await abrir('PROFESOR', {
        [RECORREGIR]: () => {
          llamadas++
          return CORREGIDAS
        },
      })
      const form = await abrirFormulario()
      completar()
      if (accion === 'Cancelar')
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      else fireEvent.keyDown(form, { key: 'Escape' })
      expect(
        screen.queryByRole('form', { name: 'Recorregir nota de Ana Ávila' }),
      ).not.toBeInTheDocument()
      expect(llamadas).toBe(0)
    },
  )
  test('mientras guarda impide Cancelar, Escape y un segundo envío', async () => {
    let resolver!: (r: Response) => void
    let llamadas = 0
    await abrir('PROFESOR', {
      [RECORREGIR]: () => {
        llamadas++
        return new Promise<Response>((r) => {
          resolver = r
        })
      },
    })
    const form = await abrirFormulario()
    completar()
    fireEvent.submit(form)
    await waitFor(() => expect(llamadas).toBe(1))
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    fireEvent.keyDown(form, { key: 'Escape' })
    expect(form).toBeInTheDocument()
    fireEvent.submit(form)
    expect(llamadas).toBe(1)
    resolver(json(CORREGIDAS))
    await screen.findByText(/Recorrección guardada para Ana Ávila/)
  })
  test('un error conserva nota y motivo para reintentar', async () => {
    let llamadas = 0
    await abrir('PROFESOR', {
      [RECORREGIR]: () => (++llamadas === 1 ? json({}, 500) : CORREGIDAS),
    })
    await abrirFormulario()
    completar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar la recorrección',
    )
    expect(screen.getByRole('textbox', { name: 'Nota nueva' })).toHaveValue(
      '6,2',
    )
    expect(
      screen.getByRole('textbox', { name: 'Motivo de la recorrección' }),
    ).toHaveValue('  Se reconoció el procedimiento.  ')
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    )
    await screen.findByText(/Recorrección guardada para Ana Ávila/)
    expect(llamadas).toBe(2)
  })
  test('un conflicto exige recargar la nota actual antes de un nuevo intento', async () => {
    let recargar = false
    await abrir('PROFESOR', {
      [RECORREGIR]: () => {
        recargar = true
        return json(
          { message: 'La nota cambió. Recarga las notas.', notaActual: 6.2 },
          409,
        )
      },
      [NOTAS]: () => (recargar ? CORREGIDAS : PUBLICADAS),
    })
    await abrirFormulario()
    completar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('La nota cambió')
    expect(
      screen.getByRole('button', { name: 'Guardar recorrección' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Recargar notas' }))
    await screen.findByText('6,2')
    await abrirFormulario()
    expect(screen.getByText('6,2', { selector: 'strong' })).toBeInTheDocument()
  })
  test('el ayudante consulta publicadas sin poder recorregir', async () => {
    const panel = await abrir('AYUDANTE')
    expect(
      panel.queryByRole('button', { name: /Recorregir/ }),
    ).not.toBeInTheDocument()
    expect(panel.getByLabelText('Nota de Ana Ávila')).toBeDisabled()
  })
  test('el profesor consulta un borrador sin poder ingresarlo ni recorregirlo', async () => {
    const panel = await abrir(
      'PROFESOR',
      {},
      {
        ...PUBLICADAS,
        estado: 'BORRADOR',
        alumnos: [{ ...PUBLICADAS.alumnos[0], estado: 'PROPUESTA' }],
      },
    )
    expect(
      panel.queryByRole('button', { name: /Recorregir/ }),
    ).not.toBeInTheDocument()
    expect(panel.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
      'readonly',
    )
    expect(
      panel.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
  })
})
