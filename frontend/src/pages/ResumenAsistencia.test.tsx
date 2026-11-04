import type {
  AsistenciaClase,
  ResumenAsistenciaSeccion,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'
import { avisarAsistenciaGuardada } from './asistencia-eventos'

const SECCION = '/api/espacio/secciones/seccion-1'
const URL = `${SECCION}/asistencia/resumen`
const MARCAS = `${SECCION}/clases/c1/asistencia`
const VISTA = '/mis-cursos/secciones/seccion-1'
const seccion: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'p1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}
const clase = {
  id: 'c1',
  fecha: '2026-09-14',
  inicio: '08:30',
  termino: '09:20',
  sala: 'ING-101',
}
const pendiente: AsistenciaClase = {
  clase,
  registrada: null,
  alumnos: [
    { id: 'a1', nombre: 'Ana', presente: null },
    { id: 'a2', nombre: 'Bruno', presente: null },
  ],
}
const guardada: AsistenciaClase = {
  clase,
  registrada: {
    por: { id: 'profesor-1', nombre: 'Camila Rojas' },
    en: '2026-09-14T12:00:00Z',
  },
  alumnos: [
    { id: 'a1', nombre: 'Ana', presente: true },
    { id: 'a2', nombre: 'Bruno', presente: false },
  ],
}
const sinRegistro: ResumenAsistenciaSeccion = {
  clasesRegistradas: 0,
  alumnos: pendiente.alumnos.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    asistidas: 0,
    sinMarca: 0,
    porcentaje: null,
  })),
}
const conRegistro: ResumenAsistenciaSeccion = {
  clasesRegistradas: 1,
  alumnos: [
    { id: 'a1', nombre: 'Ana', asistidas: 1, sinMarca: 0, porcentaje: 100 },
    { id: 'a2', nombre: 'Bruno', asistidas: 0, sinMarca: 0, porcentaje: 0 },
  ],
}

async function abrir(
  resumen: RutaSimulada,
  extras: Record<string, RutaSimulada> = {},
  rol: Rol = 'PROFESOR',
) {
  await renderConSesion(rol, VISTA, {
    [`${SECCION}/resumen`]: () => ({ ...seccion, rol }),
    [URL]: resumen,
    [`${SECCION}/clases`]: () => [clase],
    [MARCAS]: () => pendiente,
    ...extras,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
  return within(screen.getByRole('tabpanel', { name: 'Asistencia' }))
}
const nombresDe = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((f) => within(f).getByRole('rowheader').textContent)

describe('ASI-05: resumen de asistencia', () => {
  test('muestra el porcentaje recibido, las fracciones y sin marca; ordena en ambos sentidos con desempate por nombre', async () => {
    const panel = await abrir(() => ({
      clasesRegistradas: 3,
      alumnos: [
        { id: 'z', nombre: 'Zoe', asistidas: 0, sinMarca: 1, porcentaje: 0 },
        {
          id: 'l',
          nombre: 'Luis',
          asistidas: 2,
          sinMarca: 0,
          porcentaje: 66.67,
        },
        { id: 'a', nombre: 'Ana', asistidas: 3, sinMarca: 0, porcentaje: 100 },
        {
          id: 'b',
          nombre: 'Bruno',
          asistidas: 2,
          sinMarca: 0,
          porcentaje: 66.67,
        },
      ],
    }))
    const tabla = await panel.findByRole('table', {
      name: 'Porcentaje por alumno',
    })
    expect(nombresDe(tabla)).toEqual(['Zoe', 'Bruno', 'Luis', 'Ana'])
    expect(within(tabla).getAllByText('66,67 %')).toHaveLength(2)
    expect(within(tabla).getAllByText('2 / 3')).toHaveLength(2)
    expect(
      within(tabla).getByRole('columnheader', { name: 'Porcentaje' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.change(panel.getByLabelText('Ordenar por porcentaje'), {
      target: { value: 'desc' },
    })
    expect(nombresDe(tabla)).toEqual(['Ana', 'Bruno', 'Luis', 'Zoe'])
    expect(
      within(tabla).getByRole('columnheader', { name: 'Porcentaje' }),
    ).toHaveAttribute('aria-sort', 'descending')
  })

  test('sin clases muestra Sin registros y no 0 %; una sección sin alumnos no ofrece tabla ni orden', async () => {
    let datos = sinRegistro
    const panel = await abrir(() => datos)
    const tabla = await panel.findByRole('table', {
      name: 'Porcentaje por alumno',
    })
    expect(within(tabla).getAllByText('Sin registros')).toHaveLength(2)
    expect(within(tabla).queryByText('0 %')).not.toBeInTheDocument()
    datos = { clasesRegistradas: 0, alumnos: [] }
    avisarAsistenciaGuardada('seccion-1')
    expect(
      await panel.findByText('La sección no tiene alumnos inscritos.'),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('table', { name: 'Porcentaje por alumno' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByLabelText('Ordenar por porcentaje'),
    ).not.toBeInTheDocument()
  })

  test('conserva los porcentajes entregados por el backend sin recalcularlos en el navegador', async () => {
    const panel = await abrir(() => ({
      clasesRegistradas: 3,
      alumnos: [
        {
          id: 'a',
          nombre: 'Ana',
          asistidas: 1,
          sinMarca: 0,
          porcentaje: 12.34,
        },
      ],
    }))
    expect(await panel.findByText('12,34 %')).toBeInTheDocument()
  })

  test('muestra error y permite reintentar; ignora cambios de otra sección', async () => {
    let llamadas = 0
    const panel = await abrir(() =>
      ++llamadas === 1 ? json({}, 500) : conRegistro,
    )
    expect(
      await panel.findByText(
        'No pudimos cargar los porcentajes de asistencia.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    await panel.findByRole('table', { name: 'Porcentaje por alumno' })
    expect(llamadas).toBe(2)
    avisarAsistenciaGuardada('otra-seccion')
    expect(llamadas).toBe(2)
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no ve ni pide el resumen de porcentajes',
    async (rol) => {
      let llamadas = 0
      const panel = await abrir(
        () => {
          llamadas++
          return conRegistro
        },
        {},
        rol,
      )
      await panel.findByText(
        rol === 'ALUMNO'
          ? 'Aún no tienes marcas de asistencia registradas.'
          : 'Clases',
      )
      expect(
        panel.queryByRole('region', { name: 'Porcentajes de asistencia' }),
      ).not.toBeInTheDocument()
      expect(llamadas).toBe(0)
    },
  )

  test('al guardar refresca el cálculo del servidor y conserva el orden elegido, sin pedir antes del 201', async () => {
    let guardo = false
    let terminar!: (r: Response) => void
    let lecturas = 0
    const panel = await abrir(
      () => {
        lecturas++
        return guardo ? conRegistro : sinRegistro
      },
      {
        [MARCAS]: (init) =>
          init?.method === 'POST'
            ? new Promise<Response>((r) => {
                terminar = r
              })
            : guardo
              ? guardada
              : pendiente,
      },
    )
    await panel.findByRole('table', { name: 'Porcentaje por alumno' })
    fireEvent.change(panel.getByLabelText('Ordenar por porcentaje'), {
      target: { value: 'desc' },
    })
    fireEvent.click(
      panel.getByRole('button', {
        name: 'Asistencia del 2026-09-14 a las 08:30',
      }),
    )
    fireEvent.click(
      await panel.findByRole('button', { name: 'Marcar todos presentes' }),
    )
    fireEvent.click(
      within(panel.getByRole('group', { name: 'Bruno' })).getByLabelText(
        'Ausente',
      ),
    )
    fireEvent.click(panel.getByRole('button', { name: 'Guardar asistencia' }))
    await waitFor(() => expect(terminar).toBeTypeOf('function'))
    expect(lecturas).toBe(1)
    guardo = true
    terminar(json(guardada, 201))
    expect(
      await within(
        panel.getByRole('table', { name: 'Porcentaje por alumno' }),
      ).findByText('100 %'),
    ).toBeInTheDocument()
    expect(lecturas).toBe(2)
    expect(panel.getByLabelText('Ordenar por porcentaje')).toHaveValue('desc')
    expect(
      nombresDe(panel.getByRole('table', { name: 'Porcentaje por alumno' })),
    ).toEqual(['Ana', 'Bruno'])
  })

  test.each([200, 409, 500])(
    'refresca al corregir solo si el servidor confirma el cambio (%s)',
    async (estado) => {
      let corregida = false
      let lecturas = 0
      const panel = await abrir(
        () => {
          lecturas++
          return corregida
            ? {
                ...conRegistro,
                alumnos: conRegistro.alumnos.map((a) => ({
                  ...a,
                  asistidas: 1,
                  porcentaje: 100,
                })),
              }
            : conRegistro
        },
        {
          [MARCAS]: () => guardada,
          [`${MARCAS}/alumnos/a2`]: () => {
            corregida = estado === 200
            return json({ message: 'Conflicto de marca' }, estado)
          },
        },
      )
      await panel.findByRole('table', { name: 'Porcentaje por alumno' })
      fireEvent.click(
        panel.getByRole('button', {
          name: 'Asistencia del 2026-09-14 a las 08:30',
        }),
      )
      fireEvent.click(
        await panel.findByRole('button', {
          name: 'Corregir asistencia de Bruno',
        }),
      )
      fireEvent.change(panel.getByLabelText('Motivo de la corrección'), {
        target: { value: 'Lista revisada' },
      })
      fireEvent.click(panel.getByRole('button', { name: 'Guardar corrección' }))
      if (estado === 200) {
        await panel.findByText('Corrección guardada')
        await waitFor(() =>
          expect(
            within(
              panel.getByRole('table', { name: 'Porcentaje por alumno' }),
            ).getAllByText('100 %'),
          ).toHaveLength(2),
        )
        expect(lecturas).toBe(2)
      } else {
        await panel.findByRole('alert')
        expect(lecturas).toBe(1)
      }
    },
  )

  test('un guardado que termina después de cambiar de pestaña actualiza el resumen reabierto', async () => {
    let guardo = false
    let terminar!: (r: Response) => void
    const panel = await abrir(() => (guardo ? conRegistro : sinRegistro), {
      [MARCAS]: (init) =>
        init?.method === 'POST'
          ? new Promise<Response>((r) => {
              terminar = r
            })
          : pendiente,
    })
    await panel.findByRole('table', { name: 'Porcentaje por alumno' })
    fireEvent.click(
      panel.getByRole('button', {
        name: 'Asistencia del 2026-09-14 a las 08:30',
      }),
    )
    fireEvent.click(
      await panel.findByRole('button', { name: 'Marcar todos presentes' }),
    )
    fireEvent.click(panel.getByRole('button', { name: 'Guardar asistencia' }))
    await waitFor(() => expect(terminar).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('tab', { name: 'Anuncios' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Asistencia' }))
    const actual = within(screen.getByRole('tabpanel', { name: 'Asistencia' }))
    await actual.findByRole('table', { name: 'Porcentaje por alumno' })
    expect(actual.getAllByText('Sin registros')).toHaveLength(2)
    guardo = true
    terminar(json(guardada, 201))
    expect(await actual.findByText('100 %')).toBeInTheDocument()
  })
})
