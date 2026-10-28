import type { Rol, SeccionAlumno, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'
import { RUTA_SECCIONES_ALUMNO } from './SeccionesAlumno'

const SECCIONES: SeccionAlumno[] = [
  {
    id: 'seccion-1',
    anunciosNuevos: 2,
    numero: 1,
    curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
    horario: [
      { dia: 1, inicio: '08:30', termino: '09:20', sala: 'Sala 201' },
      { dia: 3, inicio: '10:00', termino: '11:00', sala: 'Laboratorio' },
    ],
    profesor: { id: 'profesor', nombre: 'Camila Rojas' },
  },
  {
    id: 'seccion-2',
    anunciosNuevos: 0,
    numero: 2,
    curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
    horario: [],
    profesor: null,
  },
]
const resumen: SeccionResumen = {
  ...SECCIONES[0],
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  ayudantes: [],
}
const tarjetas = async () =>
  within(
    await screen.findByRole('region', { name: 'Dashboard' }),
  ).findAllByRole('link')

describe('ESP-03: dashboard del alumno', () => {
  test('si vuelve al dashboard con el registro pendiente, actualiza el contador cuando termina', async () => {
    let leido = false
    let registrar: (respuesta: Response) => void = () => {}
    const pendiente = new Promise<Response>((resolve) => {
      registrar = resolve
    })
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => [
        { ...SECCIONES[0], anunciosNuevos: leido ? 0 : 1 },
      ],
      '/api/espacio/secciones/seccion-1/resumen': () => resumen,
      '/api/espacio/secciones/seccion-1/anuncios': () => [
        {
          id: 'a',
          titulo: 'Pendiente',
          cuerpo: 'Mensaje',
          autor: { id: 'p', nombre: 'Profesora' },
          publicadoEn: '2026-10-27T15:00:00Z',
          seccion: null,
          nuevo: true,
        },
      ],
      '/api/espacio/secciones/seccion-1/anuncios/lecturas': () => pendiente,
    })
    fireEvent.click((await tarjetas())[0])
    fireEvent.click(await screen.findByRole('tab', { name: 'Anuncios' }))
    await screen.findByText('Nuevo')
    fireEvent.click(screen.getByRole('link', { name: 'Volver al Dashboard' }))
    expect((await tarjetas())[0]).toHaveTextContent('1 anuncio nuevo')
    leido = true
    registrar(new Response(null, { status: 204 }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /ICC101/ })).toHaveTextContent(
        '0 anuncios nuevos',
      ),
    )
  })

  test('muestra el contador, abrir solo el curso lo conserva y abrir Anuncios lo actualiza al volver', async () => {
    let leido = false,
      marcas = 0
    const anuncio = {
      id: 'anuncio-1',
      titulo: 'Nuevo aviso',
      cuerpo: 'Contenido',
      autor: { id: 'p', nombre: 'Camila Rojas' },
      publicadoEn: '2026-10-27T15:00:00Z',
      seccion: null,
    }
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => [
        { ...SECCIONES[0], anunciosNuevos: leido ? 0 : 1 },
        SECCIONES[1],
      ],
      '/api/espacio/secciones/seccion-1/resumen': () => resumen,
      '/api/espacio/secciones/seccion-1/anuncios': () => [
        { ...anuncio, nuevo: !leido },
      ],
      '/api/espacio/secciones/seccion-1/anuncios/lecturas': () => {
        marcas++
        leido = true
        return new Response(null, { status: 204 })
      },
    })
    expect((await tarjetas())[0]).toHaveTextContent('1 anuncio nuevo')
    expect((await tarjetas())[1]).toHaveTextContent('0 anuncios nuevos')
    fireEvent.click((await tarjetas())[0])
    await screen.findByRole('region', { name: 'Vista del curso' })
    expect(marcas).toBe(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Anuncios' }))
    await screen.findByText('Nuevo')
    await waitFor(() => expect(marcas).toBe(1))
    fireEvent.click(screen.getByRole('link', { name: 'Volver al Dashboard' }))
    expect((await tarjetas())[0]).toHaveTextContent('0 anuncios nuevos')
    fireEvent.click((await tarjetas())[0])
    fireEvent.click(await screen.findByRole('tab', { name: 'Anuncios' }))
    await screen.findByText('Nuevo aviso')
    expect(screen.queryByText('Nuevo', { exact: true })).toBeNull()
    expect(marcas).toBe(1)
  })

  test('muestra una tarjeta por sección con curso, horario y profesor, incluso para dos secciones del mismo curso', async () => {
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => SECCIONES,
    })
    const [a, b] = await tarjetas()
    expect(await tarjetas()).toHaveLength(2)
    expect(
      screen.getByRole('heading', { name: 'Mis cursos del período' }),
    ).toBeInTheDocument()
    expect(a).toHaveTextContent('ICC101')
    expect(
      within(a).getByRole('heading', { name: 'Programación' }),
    ).toBeInTheDocument()
    expect(a).toHaveTextContent('Sección 1')
    expect(a).toHaveTextContent('2 anuncios nuevos')
    expect(a).toHaveTextContent('Profesor a cargo: Camila Rojas')
    expect(
      within(a)
        .getAllByRole('listitem')
        .map((x) => x.textContent),
    ).toEqual([
      'Lunes 08:30–09:20 · Sala 201',
      'Miércoles 10:00–11:00 · Laboratorio',
    ])
    expect(b).toHaveTextContent('Sección 2')
    expect(b).toHaveTextContent('Sin horario asignado')
    expect(b).toHaveTextContent('Sin profesor asignado')
    expect([a, b].map((x) => x.getAttribute('href'))).toEqual([
      '/mis-cursos/secciones/seccion-1',
      '/mis-cursos/secciones/seccion-2',
    ])
  })
  test('el clic abre la vista del curso como Alumno y no pide la lista de compañeros', async () => {
    let listasPedidas = 0
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => SECCIONES,
      '/api/espacio/secciones/seccion-1/resumen': () => resumen,
      '/api/espacio/secciones/seccion-1/alumnos': () => {
        listasPedidas++
        return { total: 0, alumnos: [] }
      },
    })
    fireEvent.click((await tarjetas())[0])
    const vista = await screen.findByRole('region', { name: 'Vista del curso' })
    expect(vista).toHaveTextContent('Programación')
    expect(vista).toHaveTextContent('Sección 1')
    expect(vista).toHaveTextContent('Entras como Alumno')
    expect(listasPedidas).toBe(0)
  })
  test('el enlace directo carga la sección autorizada', async () => {
    await renderConSesion('ALUMNO', '/mis-cursos/secciones/seccion-1', {
      '/api/espacio/secciones/seccion-1/resumen': () => resumen,
    })
    expect(
      await screen.findByRole('region', { name: 'Vista del curso' }),
    ).toHaveTextContent('Entras como Alumno')
  })
  test('sin inscripciones muestra el estado vacío', async () => {
    await renderConSesion('ALUMNO')
    expect(
      await screen.findByText('No tienes inscripciones en el período activo.'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Dashboard' })).queryByRole(
        'link',
      ),
    ).toBeNull()
  })
  test('muestra carga mientras espera la respuesta', async () => {
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => new Promise(() => {}),
    })
    expect(await screen.findByText('Cargando tus cursos…')).toBeInTheDocument()
  })
  test('ante error permite reintentar', async () => {
    let fallo = true
    await renderConSesion('ALUMNO', '/', {
      [RUTA_SECCIONES_ALUMNO]: () => (fallo ? json({}, 500) : SECCIONES),
    })
    expect(
      await screen.findByText('No pudimos cargar tus cursos.'),
    ).toBeInTheDocument()
    fallo = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await tarjetas()).toHaveLength(2)
  })
  test('si se retiró la inscripción no muestra el curso y permite volver al dashboard', async () => {
    await renderConSesion('ALUMNO', '/mis-cursos/secciones/seccion-1', {
      '/api/espacio/secciones/seccion-1/resumen': () => json({}, 403),
    })
    expect(
      await screen.findByText('No eres integrante de esta sección.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al Dashboard' }))
    expect(
      await screen.findByText('No tienes inscripciones en el período activo.'),
    ).toBeInTheDocument()
  })
  test.each<Rol>(['PROFESOR', 'AYUDANTE', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no pide las inscripciones del alumno',
    async (rol) => {
      let pedidos = 0
      await renderConSesion(rol, '/', {
        [RUTA_SECCIONES_ALUMNO]: () => {
          pedidos++
          return SECCIONES
        },
      })
      expect(pedidos).toBe(0)
      expect(
        screen.queryByRole('heading', { name: 'Mis cursos del período' }),
      ).toBeNull()
    },
  )
})
