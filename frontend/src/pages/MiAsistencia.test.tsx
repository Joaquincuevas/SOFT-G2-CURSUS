import type { ResumenAsistenciaPropia, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const SECCION = '/api/espacio/secciones/seccion-1'
const URL = `${SECCION}/mi-asistencia/resumen`
const seccion: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'p1', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [],
  profesor: { id: 'p1', nombre: 'Camila' },
  ayudantes: [],
}
const clase = {
  id: 'c1',
  fecha: '2026-09-14',
  inicio: '08:30',
  termino: '10:00',
  sala: 'A',
}
const resumen: ResumenAsistenciaPropia = {
  clases: [
    { clase, presente: false },
    { clase: { ...clase, id: 'c2', fecha: '2026-09-07' }, presente: true },
    { clase: { ...clase, id: 'c3', fecha: '2026-08-31' }, presente: true },
  ],
  registradas: 3,
  asistidas: 2,
  porcentaje: 66.67,
}
async function abrir(respuesta: RutaSimulada) {
  await renderConSesion('ALUMNO', '/mis-cursos/secciones/seccion-1', {
    [`${SECCION}/resumen`]: () => seccion,
    [URL]: respuesta,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
  return vi.mocked(globalThis.fetch)
}

describe('ASI-06: asistencia propia por curso', () => {
  test('muestra las marcas por fecha, porcentaje y fracción recibidos sin pedir listas de otros alumnos', async () => {
    const fetch = await abrir(() => resumen)
    const tabla = await screen.findByRole('table', {
      name: 'Mis marcas de asistencia',
    })
    expect(screen.getByText('66,67 %')).toBeInTheDocument()
    expect(
      screen.getByText('2 de 3 clases con marca propia registrada.'),
    ).toBeInTheDocument()
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas.map((f) => f.textContent)).toEqual([
      '2026-09-1408:30–10:00Ausente',
      '2026-09-0708:30–10:00Presente',
      '2026-08-3108:30–10:00Presente',
    ])
    expect(
      screen.queryByRole('button', { name: /Corregir|Guardar|Historial/ }),
    ).not.toBeInTheDocument()
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes('/asistencia/resumen'),
      ),
    ).toBe(false)
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith('/clases')),
    ).toBe(false)
  })
  test('usa el porcentaje del backend, sin recalcularlo en el navegador', async () => {
    await abrir(() => ({ ...resumen, porcentaje: 12.34 }))
    expect(await screen.findByText('12,34 %')).toBeInTheDocument()
  })
  test('sin marcas muestra Sin registros y no 0 %', async () => {
    await abrir(() => ({
      clases: [],
      registradas: 0,
      asistidas: 0,
      porcentaje: null,
    }))
    expect(await screen.findByText('Sin registros')).toBeInTheDocument()
    expect(
      screen.getByText('Aún no tienes marcas de asistencia registradas.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('0 %')).not.toBeInTheDocument()
  })
  test.each([0, 100])(
    'presenta el porcentaje límite %s',
    async (porcentaje) => {
      await abrir(() => ({ ...resumen, porcentaje }))
      expect(await screen.findByText(`${porcentaje} %`)).toBeInTheDocument()
    },
  )
  test('Actualiza las marcas y porcentaje tras una corrección del profesor', async () => {
    let corregida = false
    await abrir(() =>
      corregida
        ? {
            ...resumen,
            clases: resumen.clases.map((a) => ({ ...a, presente: true })),
            asistidas: 3,
            porcentaje: 100,
          }
        : resumen,
    )
    await screen.findByText('66,67 %')
    corregida = true
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar asistencia' }),
    )
    expect(await screen.findByText('100 %')).toBeInTheDocument()
    expect(screen.queryByText('Ausente')).not.toBeInTheDocument()
    expect(
      screen.getByText('3 de 3 clases con marca propia registrada.'),
    ).toBeInTheDocument()
  })
  test('no conserva marcas visibles ante un 403 en la recarga y permite reintentar', async () => {
    let permitido = true
    await abrir(() => (permitido ? resumen : json({}, 403)))
    await screen.findByText('66,67 %')
    permitido = false
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar asistencia' }),
    )
    await screen.findByText('No pudimos cargar tu asistencia.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    permitido = true
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('66,67 %')).toBeInTheDocument()
  })
  test('recarga al volver a abrir la pestaña', async () => {
    let porcentaje = 66.67
    await abrir(() => ({ ...resumen, porcentaje }))
    await screen.findByText('66,67 %')
    fireEvent.click(screen.getByRole('tab', { name: 'Anuncios' }))
    porcentaje = 100
    fireEvent.click(screen.getByRole('tab', { name: 'Asistencia' }))
    expect(await screen.findByText('100 %')).toBeInTheDocument()
  })
})
