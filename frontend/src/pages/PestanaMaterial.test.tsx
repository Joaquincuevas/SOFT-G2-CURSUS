import type { Rol, SeccionResumen, VersionSilabo } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const SILABO = '/api/espacio/secciones/seccion-1/silabo'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

const HISTORIAL: VersionSilabo[] = [
  { version: 2, subidoEn: '2026-11-08T15:00:00.000Z' },
  { version: 1, subidoEn: '2026-10-01T15:00:00.000Z' },
]

async function abrirMaterial(
  rol: Rol,
  silabo: (init?: RequestInit) => unknown = () => HISTORIAL,
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [SILABO]: silabo,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Material' }))
  return within(screen.getByRole('tabpanel', { name: 'Material' }))
}

describe('pestaña Material (MAT-02)', () => {
  test('muestra y permite descargar todas las versiones del curso', async () => {
    const panel = await abrirMaterial('ALUMNO')
    const historial = await panel.findByRole('list', {
      name: 'Historial del sílabo',
    })

    expect(
      within(historial)
        .getAllByRole('heading')
        .map((titulo) => titulo.textContent),
    ).toEqual(['Versión 2', 'Versión 1'])
    expect(
      within(historial).getAllByRole('button', { name: 'Descargar PDF' }),
    ).toHaveLength(2)
    expect(
      panel.queryByRole('form', { name: 'Cargar sílabo' }),
    ).not.toBeInTheDocument()
  })

  test('el profesor carga un PDF y recarga el historial con la nueva versión', async () => {
    let cargado = false
    let cuerpoEnviado: FormData | undefined
    const nuevaVersion: VersionSilabo = {
      version: 3,
      subidoEn: '2026-11-09T15:00:00.000Z',
    }
    const panel = await abrirMaterial('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        cuerpoEnviado = init.body as FormData
        cargado = true
        return json(nuevaVersion, 201)
      }
      return cargado ? [nuevaVersion, ...HISTORIAL] : HISTORIAL
    })
    await panel.findByRole('button', { name: 'Subir nueva versión' })
    const archivo = new File(['%PDF-1.7 contenido'], 'programa.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(panel.getByLabelText('Archivo PDF'), {
      target: { files: [archivo] },
    })
    fireEvent.submit(panel.getByRole('form', { name: 'Cargar sílabo' }))

    expect(await panel.findByRole('status')).toHaveTextContent(
      'la versión anterior quedó en el historial',
    )
    expect(cuerpoEnviado?.get('archivo')).toBe(archivo)
    const historial = within(
      await panel.findByRole('list', { name: 'Historial del sílabo' }),
    )
    await historial.findByRole('heading', { name: 'Versión 3' })
    expect(
      historial.getAllByRole('heading').map((titulo) => titulo.textContent),
    ).toEqual(['Versión 3', 'Versión 2', 'Versión 1'])
  })

  test('rechaza archivos que no son PDF', async () => {
    const panel = await abrirMaterial('PROFESOR')
    await panel.findByRole('button', { name: 'Subir nueva versión' })
    const archivo = new File(['texto'], 'programa.txt', { type: 'text/plain' })

    fireEvent.change(panel.getByLabelText('Archivo PDF'), {
      target: { files: [archivo] },
    })

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Selecciona un archivo PDF.',
    )
    expect(
      panel.getByRole('button', { name: 'Subir nueva versión' }),
    ).toBeDisabled()
  })

  test('sin historial muestra el estado vacío', async () => {
    const panel = await abrirMaterial('AYUDANTE', () => [])
    expect(
      await panel.findByText('Aún no hay un sílabo para este curso'),
    ).toBeInTheDocument()
  })

  test('si falla la carga del historial permite reintentar', async () => {
    let intentos = 0
    const panel = await abrirMaterial('ALUMNO', () =>
      ++intentos === 1 ? json({}, 500) : HISTORIAL,
    )

    expect(
      await panel.findByText('No pudimos cargar el historial del sílabo.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Versión 2')).toBeInTheDocument()
  })
})
