import type {
  SeccionAlumno,
  SeccionAyudante,
  SeccionDashboard,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const PROFESOR_RUTA = '/api/dashboard/mis-secciones'
const AYUDANTE_RUTA = '/api/dashboard/secciones-ayudante'
const ALUMNO_RUTA = '/api/dashboard/secciones-alumno'

const ICC101 = {
  id: 'curso-icc101',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
}
const ICC201 = {
  id: 'curso-icc201',
  codigo: 'ICC201',
  nombre: 'Estructuras de Datos',
}
const HORARIO = [
  { dia: 1 as const, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
]

const PROFESOR: SeccionDashboard[] = [
  {
    id: 's-101-1',
    numero: 1,
    curso: ICC101,
    horario: HORARIO,
    alumnos: 32,
    pendientesRevision: 2,
  },
  {
    id: 's-201-2',
    numero: 2,
    curso: ICC201,
    horario: [],
    alumnos: 1,
    pendientesRevision: 1,
  },
]
const AYUDANTE: SeccionAyudante[] = [
  {
    id: 's-101-1',
    numero: 1,
    curso: ICC101,
    profesor: { id: 'p', nombre: 'Profesor Norte' },
    profesores: ['Profesor Norte'],
  },
  { id: 's-201-2', numero: 2, curso: ICC201, profesor: null, profesores: [] },
]
const ALUMNO: SeccionAlumno[] = [
  {
    id: 's-101-1',
    numero: 1,
    curso: ICC101,
    horario: HORARIO,
    profesor: { id: 'p', nombre: 'Profesor Norte' },
    profesores: ['Profesor Norte'],
    anunciosNuevos: 0,
  },
  {
    id: 's-201-2',
    numero: 2,
    curso: ICC201,
    horario: [],
    profesor: null,
    profesores: [],
    anunciosNuevos: 1,
  },
]

const abrir = async (
  rol: 'PROFESOR' | 'AYUDANTE' | 'ALUMNO',
  ruta: string,
  datos: unknown,
) => {
  await renderConSesion(rol, '/mis-cursos', { [ruta]: () => datos })
  return within(await screen.findByRole('region', { name: 'Mis cursos' }))
}
const encabezados = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent?.trim())
const cursos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('link')
    .map((l) => l.textContent)

describe('Mis cursos del Profesor', () => {
  test('lista sus secciones con horario, alumnos y el acceso a pendientes', async () => {
    const pagina = await abrir('PROFESOR', PROFESOR_RUTA, PROFESOR)
    await pagina.findByRole('table')
    expect(encabezados()).toEqual([
      'Curso',
      'Sección',
      'Período',
      'Horario y sala',
      'Alumnos',
    ])
    expect(cursos()).toEqual([
      'ICC101 · Introducción a la Programación',
      'ICC201 · Estructuras de Datos',
    ])
    expect(
      screen.getByText('Lunes 08:30–10:00 · Sala A-101'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sin horario asignado')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getAllByText('2026-2').length).toBeGreaterThan(1)
    expect(screen.getByText('2 cursos')).toBeInTheDocument()
    expect(
      pagina.getByRole('link', {
        name: '3 evaluaciones pendientes de revisión',
      }),
    ).toHaveAttribute('href', '/mis-cursos/pendientes-revision')
    expect(
      pagina.queryByRole('link', { name: 'Historial de notas' }),
    ).toBeNull()
  })

  test('sin pendientes no muestra el acceso a pendientes', async () => {
    const pagina = await abrir(
      'PROFESOR',
      PROFESOR_RUTA,
      PROFESOR.map((s) => ({ ...s, pendientesRevision: 0 })),
    )
    await pagina.findByRole('table')
    expect(pagina.queryByText(/pendientes? de revisión/)).toBeNull()
  })

  test('busca por código, nombre o sección, sin importar tildes, y se limpia', async () => {
    const pagina = await abrir('PROFESOR', PROFESOR_RUTA, PROFESOR)
    await pagina.findByRole('table')
    const buscar = pagina.getByRole('searchbox', { name: 'Buscar' })
    fireEvent.change(buscar, { target: { value: 'introduccion' } })
    expect(cursos()).toEqual(['ICC101 · Introducción a la Programación'])
    expect(screen.getByText('1 curso')).toBeInTheDocument()
    fireEvent.change(buscar, { target: { value: 'icc2' } })
    expect(cursos()).toEqual(['ICC201 · Estructuras de Datos'])
    fireEvent.change(buscar, { target: { value: '2' } })
    expect(cursos()).toEqual(['ICC201 · Estructuras de Datos'])
    fireEvent.click(pagina.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(buscar).toHaveValue('')
    expect(screen.getByText('2 cursos')).toBeInTheDocument()
  })

  test('sin coincidencias muestra el estado vacío y limpia la búsqueda', async () => {
    const pagina = await abrir('PROFESOR', PROFESOR_RUTA, PROFESOR)
    await pagina.findByRole('table')
    fireEvent.change(pagina.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'zzz' },
    })
    expect(
      screen.getByText('No hay cursos con esa búsqueda.'),
    ).toBeInTheDocument()
    expect(screen.getByText('0 cursos')).toBeInTheDocument()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Limpiar búsqueda' }).at(-1)!,
    )
    expect(screen.getByText('2 cursos')).toBeInTheDocument()
  })

  test('sin secciones muestra el estado vacío del rol', async () => {
    const pagina = await abrir('PROFESOR', PROFESOR_RUTA, [])
    expect(
      await pagina.findByText(
        'No tienes secciones a tu cargo en el período activo.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('0 cursos')).toBeInTheDocument()
  })

  test('el link del curso abre la vista de la sección, con estilo de enlace', async () => {
    await abrir('PROFESOR', PROFESOR_RUTA, PROFESOR)
    const enlace = await screen.findByRole('link', {
      name: /^ICC101/,
    })
    expect(enlace).toHaveAttribute('href', '/mis-cursos/secciones/s-101-1')
    expect(enlace).toHaveClass('font-medium', 'no-underline', 'hover:underline')
  })

  test('hacer clic en la fila abre la sección', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos', {
      [PROFESOR_RUTA]: () => PROFESOR,
      '/api/espacio/secciones/s-201-2/resumen': () => ({
        id: 's-201-2',
        numero: 2,
        curso: ICC201,
        periodo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
        rol: 'PROFESOR',
        horario: [],
        profesor: { id: 'p', nombre: 'Profesor Norte' },
        profesores: ['Profesor Norte'],
        ayudantes: [],
      }),
    })
    const fila = (
      await screen.findByText('Estructuras de Datos', { exact: false })
    ).closest('tr')!
    expect(fila).toHaveClass('cursor-pointer')
    fireEvent.click(within(fila).getAllByRole('cell')[3])
    const vista = within(
      await screen.findByRole('region', { name: 'Vista del curso' }),
    )
    expect(
      vista.getByRole('heading', { name: 'Estructuras de Datos' }),
    ).toBeInTheDocument()
  })

  test('mientras carga muestra esqueletos', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos', {
      [PROFESOR_RUTA]: () => new Promise(() => {}),
    })
    expect(await screen.findByText('Cargando tus cursos…')).toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-slot=data-table-carga]').length,
    ).toBeGreaterThan(0)
  })

  test('con error ofrece reintentar', async () => {
    let intentos = 0
    await renderConSesion('PROFESOR', '/mis-cursos', {
      [PROFESOR_RUTA]: () =>
        ++intentos === 1 ? new Response(null, { status: 500 }) : PROFESOR,
    })
    expect(
      await screen.findByText('No pudimos cargar tus cursos.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(cursos()).toHaveLength(2)
  })
})

describe('Mis cursos del Ayudante', () => {
  test('lista sus secciones con el profesor y «Inscrito como»', async () => {
    const pagina = await abrir('AYUDANTE', AYUDANTE_RUTA, AYUDANTE)
    await pagina.findByRole('table')
    expect(encabezados()).toEqual([
      'Curso',
      'Sección',
      'Período',
      'Profesores',
      'Inscrito como',
    ])
    expect(screen.getByText('Profesor Norte')).toBeInTheDocument()
    expect(screen.getByText('Sin asignar')).toBeInTheDocument()
    expect(
      within(screen.getByRole('table')).getAllByText('Ayudante'),
    ).toHaveLength(2)
    expect(cursos()[0]).toBe('ICC101 · Introducción a la Programación')
  })

  test('busca, y sin secciones muestra su estado vacío', async () => {
    const pagina = await abrir('AYUDANTE', AYUDANTE_RUTA, AYUDANTE)
    await pagina.findByRole('table')
    fireEvent.change(pagina.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'estructuras' },
    })
    expect(cursos()).toEqual(['ICC201 · Estructuras de Datos'])
  })

  test('vacío y error con reintento', async () => {
    await abrir('AYUDANTE', AYUDANTE_RUTA, [])
    expect(
      await screen.findByText(
        'No eres ayudante de ninguna sección en el período activo.',
      ),
    ).toBeInTheDocument()
  })
})

describe('Mis cursos del Alumno', () => {
  test('lista sus cursos con horario, profesor y «Inscrito como»', async () => {
    const pagina = await abrir('ALUMNO', ALUMNO_RUTA, ALUMNO)
    await pagina.findByRole('table')
    expect(encabezados()).toEqual([
      'Curso',
      'Sección',
      'Período',
      'Horario y sala',
      'Profesores',
      'Inscrito como',
    ])
    expect(
      within(screen.getByRole('table')).getAllByText('Alumno'),
    ).toHaveLength(2)
    expect(
      screen.getByText('Lunes 08:30–10:00 · Sala A-101'),
    ).toBeInTheDocument()
  })

  test('conserva el acceso al historial de notas como botón', async () => {
    const pagina = await abrir('ALUMNO', ALUMNO_RUTA, ALUMNO)
    await pagina.findByRole('table')
    expect(
      pagina.getByRole('link', { name: 'Historial de notas' }),
    ).toHaveAttribute('href', '/mis-cursos/historial')
    expect(pagina.queryByText(/pendientes de revisión/)).toBeNull()
  })

  test('sin inscripciones muestra el estado vacío', async () => {
    await abrir('ALUMNO', ALUMNO_RUTA, [])
    expect(
      await screen.findByText('No tienes inscripciones en el período activo.'),
    ).toBeInTheDocument()
  })

  test('con error ofrece reintentar', async () => {
    let intentos = 0
    await renderConSesion('ALUMNO', '/mis-cursos', {
      [ALUMNO_RUTA]: () =>
        ++intentos === 1 ? new Response(null, { status: 500 }) : ALUMNO,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
