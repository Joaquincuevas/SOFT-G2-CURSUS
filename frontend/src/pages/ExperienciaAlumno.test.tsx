import type { Material, SeccionAlumno, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const API = '/api/espacio/secciones/seccion-1'
const SECCION: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [],
  profesor: { id: 'profesor', nombre: 'Matías Muñoz' },
  profesores: ['Matías Muñoz', 'Camila Rojas'],
  ayudantes: [{ id: 'ayudante', nombre: 'Vicente Silva' }],
}
const MATERIAL: Material = {
  id: 'material-1',
  titulo: 'Guía de prueba',
  descripcion: null,
  categoria: 'GUIA',
  archivo: {
    id: 'a1',
    nombre: 'guia.pdf',
    tipo: 'application/pdf',
    tamano: 1024,
    subidoEn: '2026-11-10T12:00:00.000Z',
  },
  creadoEn: '2026-11-10T12:00:00.000Z',
  version: 1,
  versionEn: '2026-11-10T12:00:00.000Z',
}

describe('UI/UX-05 · pantallas del alumno', () => {
  test('el Dashboard solo consulta las secciones del alumno y enlaza al historial', async () => {
    const seccion: SeccionAlumno = {
      id: SECCION.id,
      numero: SECCION.numero,
      curso: SECCION.curso,
      horario: [],
      profesor: SECCION.profesor,
      profesores: SECCION.profesores,
      anunciosNuevos: 0,
    }
    const docente = vi.fn(() => [])
    await renderConSesion('ALUMNO', '/', {
      '/api/dashboard/secciones-alumno': () => [seccion],
      '/api/dashboard/mis-secciones': docente,
      '/api/dashboard/secciones-ayudante': docente,
    })
    const dashboard = within(
      await screen.findByRole('region', { name: 'Dashboard' }),
    )
    const cursos = within(
      await dashboard.findByRole('list', { name: 'Cursos del período activo' }),
    )
    expect(cursos.getByRole('link', { name: /Programación/ })).toHaveAttribute(
      'href',
      VISTA,
    )
    expect(
      dashboard.getByRole('link', { name: 'Historial de notas' }),
    ).toHaveAttribute('href', '/mis-cursos/historial')
    expect(dashboard.queryByText('Por hacer')).not.toBeInTheDocument()
    expect(docente).not.toHaveBeenCalled()
  })

  test('Académicos lista solo el equipo docente y no consulta la nómina', async () => {
    const alumnos = vi.fn(() => ({ total: 0, alumnos: [] }))
    await renderConSesion('ALUMNO', VISTA + '?vista=integrantes', {
      [API + '/resumen']: () => SECCION,
      [API + '/alumnos']: alumnos,
    })
    const equipo = within(
      await screen.findByRole('region', { name: 'Académicos' }),
    )
    expect(equipo.getByRole('heading', { name: 'Profesores' })).toBeVisible()
    // Cada persona con su rol, y un solo título: «Académicos».
    const personas = equipo.getAllByRole('listitem')
    expect(personas).toHaveLength(3)
    expect(personas.map((p) => p.textContent)).toEqual([
      expect.stringContaining('Matías Muñoz'),
      expect.stringContaining('Camila Rojas'),
      expect.stringContaining('Vicente Silva'),
    ])
    expect(within(personas[0]).getByText('Profesor')).toBeVisible()
    expect(within(personas[2]).getByText('Ayudante')).toBeVisible()
    expect(equipo.getByText('MM')).toBeInTheDocument()
    expect(equipo.queryByRole('heading', { name: 'Equipo docente' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Alumnos inscritos' })).toBeNull()
    expect(alumnos).not.toHaveBeenCalled()
  })

  test('Académicos explica cuando aún no hay docentes asignados', async () => {
    await renderConSesion('ALUMNO', VISTA + '?vista=integrantes', {
      [API + '/resumen']: () => ({
        ...SECCION,
        profesor: null,
        profesores: [],
        ayudantes: [],
      }),
    })
    const equipo = within(
      await screen.findByRole('region', { name: 'Académicos' }),
    )
    expect(equipo.getByText('Sin profesor asignado')).toBeVisible()
    expect(equipo.getByText('Sin ayudantes asignados')).toBeVisible()
    expect(equipo.queryByRole('list')).toBeNull()
  })

  test('Material muestra categorías con archivos y solo ofrece su descarga', async () => {
    await renderConSesion('ALUMNO', VISTA + '?vista=material', {
      [API + '/resumen']: () => SECCION,
      [API + '/materiales']: () => [MATERIAL],
    })
    const materiales = within(
      await screen.findByRole('region', { name: 'Materiales del curso' }),
    )
    const categoria = within(
      await materiales.findByRole('list', { name: 'Guía' }),
    )
    const guia = within(
      categoria.getByRole('article', { name: 'Guía de prueba' }),
    )
    expect(guia.getByText('PDF', { exact: true })).toBeVisible()
    expect(
      guia.getByRole('button', { name: 'Descargar Guía de prueba' }),
    ).toBeEnabled()
    expect(materiales.queryByRole('list', { name: 'Presentación' })).toBeNull()
    expect(materiales.queryByRole('form')).toBeNull()
  })

  test('el historial de sílabo del alumno ofrece reintentar y luego descargar sin publicar', async () => {
    let fallo = true
    await renderConSesion('ALUMNO', VISTA + '?vista=material', {
      [API + '/resumen']: () => SECCION,
      [API + '/materiales']: () => [],
      [API + '/silabo']: () =>
        fallo
          ? json({}, 500)
          : [
              {
                version: 2,
                responsable: 'Matías Muñoz',
                subidoEn: '2026-11-10T12:00:00.000Z',
              },
            ],
    })
    const silabo = within(
      await screen.findByRole('region', { name: 'Versiones del sílabo' }),
    )
    expect(
      await silabo.findByText('No pudimos cargar las versiones del sílabo.'),
    ).toBeVisible()
    fallo = false
    fireEvent.click(silabo.getByRole('button', { name: 'Reintentar' }))
    expect(
      await silabo.findByRole('button', { name: 'Descargar versión 2' }),
    ).toBeEnabled()
    expect(silabo.queryByRole('form', { name: 'Cargar sílabo' })).toBeNull()
  })
})
