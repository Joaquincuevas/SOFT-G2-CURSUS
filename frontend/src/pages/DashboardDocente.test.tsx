import type {
  Actividad,
  Anuncio,
  SeccionAyudante,
  SeccionDashboard,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const DIA = 86_400_000
const en = (dias: number) => new Date(Date.now() + dias * DIA).toISOString()
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const ICC101 = {
  id: 'c1',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
}
const ICC201 = { id: 'c2', codigo: 'ICC201', nombre: 'Estructuras de Datos' }
const PROFESOR: SeccionDashboard[] = [
  {
    id: 's1',
    numero: 1,
    curso: ICC101,
    horario: [
      { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
      { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
    ],
    alumnos: 32,
    pendientesRevision: 0,
  },
  {
    id: 's2',
    numero: 2,
    curso: ICC201,
    horario: [{ dia: 1, inicio: '14:00', termino: '15:30', sala: 'Sala C-1' }],
    alumnos: 1,
    pendientesRevision: 0,
  },
]
const AYUDANTE: SeccionAyudante[] = [
  {
    id: 's1',
    numero: 1,
    curso: ICC101,
    profesor: { id: 'p', nombre: 'Camila Rojas' },
    profesores: ['Camila Rojas'],
  },
]

const actividad = (
  id: string,
  titulo: string,
  plazo: string,
  cerrada = false,
): Actividad => ({
  id,
  titulo,
  instrucciones: '',
  plazo,
  cerrada,
})
const anuncio = (id: string, titulo: string, publicadoEn: string): Anuncio => ({
  id,
  titulo,
  cuerpo: '',
  autor: { id: 'p', nombre: 'Camila Rojas' },
  publicadoEn,
  seccion: null,
})

const RUTA = '/api/dashboard/mis-secciones'
const secc = (id: string, recurso: string) =>
  `/api/espacio/secciones/${id}/${recurso}`

const abrir = (
  rutas: Record<string, () => unknown>,
  rol: 'PROFESOR' | 'AYUDANTE' = 'PROFESOR',
) =>
  renderConSesion(rol, '/', {
    [RUTA]: () => PROFESOR,
    '/api/dashboard/secciones-ayudante': () => AYUDANTE,
    ...rutas,
  })
const bloque = async (nombre: string) =>
  within(await screen.findByRole('region', { name: nombre }))

describe('dashboard docente: tarjetas de curso', () => {
  test('alumnos, horario y accesos directos a las pestañas del curso', async () => {
    await abrir({})
    const lista = within(
      await screen.findByRole('list', { name: 'Secciones del período activo' }),
    )
    expect(lista.getByText('32 alumnos')).toBeInTheDocument()
    expect(
      lista.getByRole('list', { name: 'Horario de ICC101' }),
    ).toHaveTextContent('Lunes 08:30–10:00 · Sala A-101')
    const accesos = within(
      lista.getByRole('group', { name: 'Accesos de ICC101' }),
    )
    expect(
      accesos
        .getAllByRole('link')
        .map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]),
    ).toEqual(
      [
        'anuncios',
        'material',
        'entregas',
        'notas',
        'asistencia',
        'integrantes',
      ].map((v) => [
        `${v[0].toUpperCase()}${v.slice(1)} de ICC101`,
        `/mis-cursos/secciones/s1?vista=${v}`,
      ]),
    )
  })

  test('«Por revisar» se conserva para el profesor', async () => {
    await abrir({
      [RUTA]: () => [{ ...PROFESOR[0], pendientesRevision: 2 }, PROFESOR[1]],
    })
    const por = await bloque('Por revisar')
    expect(
      por.getByText('2 evaluaciones pendientes de revisión.'),
    ).toBeInTheDocument()
    expect(por.getByRole('link', { name: 'Ver pendientes' })).toHaveAttribute(
      'href',
      '/mis-cursos/pendientes-revision',
    )
  })

  test('si fallan las secciones, solo ellas ofrecen reintentar', async () => {
    let intentos = 0
    await abrir({ [RUTA]: () => (++intentos === 1 ? json({}, 500) : PROFESOR) })
    expect(
      await screen.findByText('No pudimos cargar tus secciones.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(
      1,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('list', { name: 'Secciones del período activo' }),
    ).toBeInTheDocument()
  })
})

describe('dashboard docente: próximas fechas', () => {
  test('lista las entregas de los próximos 14 días de todas las secciones, por plazo', async () => {
    const tarde = en(5)
    const pronto = en(3)
    await abrir({
      [secc('s1', 'actividades')]: () => [
        actividad('a1', 'Tarea 1', tarde),
        actividad('a2', 'Proyecto final', en(20)),
        actividad('a3', 'Tarea cerrada', en(2), true),
      ],
      [secc('s2', 'actividades')]: () => [actividad('a4', 'Informe', pronto)],
    })
    const fechas = await bloque('Próximas fechas')
    const items = await fechas.findAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual([
      `InformeICC201 · ${fecha(pronto)}`,
      `Tarea 1ICC101 · ${fecha(tarde)}`,
    ])
    expect(fechas.getByRole('link', { name: 'Tarea 1' })).toHaveAttribute(
      'href',
      '/mis-cursos/secciones/s1?vista=entregas',
    )
    expect(fechas.queryByText('Proyecto final')).toBeNull()
  })

  test('sin entregas por vencer muestra el estado vacío', async () => {
    await abrir({
      [secc('s1', 'actividades')]: () => [actividad('a2', 'Lejana', en(30))],
    })
    const fechas = await bloque('Próximas fechas')
    expect(
      await fechas.findByText(
        'No hay entregas por vencer en los próximos 14 días.',
      ),
    ).toBeInTheDocument()
  })

  test('si fallan, el error es solo de este bloque y se puede reintentar', async () => {
    let intentos = 0
    await abrir({
      [secc('s1', 'actividades')]: () =>
        ++intentos === 1 ? json({}, 500) : [actividad('a1', 'Tarea 1', en(2))],
    })
    const fechas = await bloque('Próximas fechas')
    expect(
      await fechas.findByText('No pudimos cargar las próximas fechas.'),
    ).toBeInTheDocument()
    // Las tarjetas y el horario siguen en pantalla.
    expect(
      screen.getByRole('list', { name: 'Secciones del período activo' }),
    ).toBeInTheDocument()
    expect(
      (await bloque('Horario de la semana')).getByText('Sala A-101', {
        exact: false,
      }),
    ).toBeInTheDocument()
    fireEvent.click(fechas.getByRole('button', { name: 'Reintentar' }))
    expect(
      await fechas.findByRole('link', { name: 'Tarea 1' }),
    ).toBeInTheDocument()
  })

  test('mientras carga muestra esqueletos', async () => {
    await abrir({ [secc('s1', 'actividades')]: () => new Promise(() => {}) })
    const fechas = await bloque('Próximas fechas')
    expect(
      await fechas.findByText('Cargando próximas fechas…'),
    ).toBeInTheDocument()
  })
})

describe('dashboard docente: horario de la semana', () => {
  test('grilla de lunes a sábado con los bloques de todas las secciones y hoy destacado', async () => {
    await abrir({})
    const horario = await bloque('Horario de la semana')
    await horario.findByText('Lunes')
    const filas = horario.getAllByText(
      /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado)/,
    )
    expect(filas.map((f) => f.textContent?.replace(' (hoy)', ''))).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ])
    const lunes = horario.getByText('Lunes').closest('li')!
    expect(lunes).toHaveTextContent('08:30–10:00 · Sala A-101 · ICC101')
    expect(lunes).toHaveTextContent('14:00–15:30 · Sala C-1 · ICC201')
    // Ordenados por hora.
    expect(lunes.textContent!.indexOf('08:30')).toBeLessThan(
      lunes.textContent!.indexOf('14:00'),
    )
    const hoy = ((new Date().getDay() + 6) % 7) + 1
    expect(document.querySelectorAll('[aria-current=date]')).toHaveLength(
      hoy <= 6 ? 1 : 0,
    )
  })

  test('el domingo aparece solo si tiene bloques, con su hora, sala y curso', async () => {
    await abrir({})
    const sin = await bloque('Horario de la semana')
    await sin.findByText('Lunes')
    expect(sin.queryByText('Domingo')).toBeNull()
  })

  test('muestra los bloques del domingo', async () => {
    await abrir({
      [RUTA]: () => [
        {
          ...PROFESOR[0],
          horario: [
            { dia: 7, inicio: '10:00', termino: '11:30', sala: 'Sala Dom-1' },
          ],
        },
        PROFESOR[1],
      ],
    })
    const horario = await bloque('Horario de la semana')
    const domingo = (await horario.findByText('Domingo')).closest('li')!
    expect(domingo).toHaveTextContent('10:00–11:30 · Sala Dom-1 · ICC101')
    // Lunes a sábado siguen en su lugar, antes del domingo.
    expect(
      horario
        .getAllByText(/^(Lunes|Sábado|Domingo)/)
        .map((f) => f.textContent?.replace(' (hoy)', '')),
    ).toEqual(['Lunes', 'Sábado', 'Domingo'])
  })
})

describe('dashboard docente: actividad reciente', () => {
  test('los últimos 3 anuncios de sus cursos, sin repetir los de curso', async () => {
    const compartido = anuncio('n1', 'Bienvenida', '2026-09-10T12:00:00.000Z')
    await abrir({
      [secc('s1', 'anuncios')]: () => [
        compartido,
        anuncio('n2', 'Cambio de sala', '2026-09-12T12:00:00.000Z'),
        anuncio('n3', 'Material nuevo', '2026-09-01T12:00:00.000Z'),
      ],
      [secc('s2', 'anuncios')]: () => [
        compartido,
        anuncio('n4', 'Prueba 1', '2026-09-14T12:00:00.000Z'),
      ],
    })
    const actividad = await bloque('Actividad reciente')
    const lista = within(
      await actividad.findByRole('list', { name: 'Últimos anuncios' }),
    )
    expect(lista.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Prueba 1',
      'Cambio de sala',
      'Bienvenida',
    ])
    expect(lista.getByRole('link', { name: 'Prueba 1' })).toHaveAttribute(
      'href',
      '/mis-cursos/secciones/s2?vista=anuncios',
    )
  })

  test('sin anuncios muestra el estado vacío', async () => {
    await abrir({})
    expect(
      await (
        await bloque('Actividad reciente')
      ).findByText('Aún no hay anuncios en tus cursos.'),
    ).toBeInTheDocument()
  })

  test('si fallan, el error es solo de este bloque y se puede reintentar', async () => {
    let intentos = 0
    await abrir({
      [secc('s1', 'anuncios')]: () =>
        ++intentos === 1 ? json({}, 500) : [anuncio('n1', 'Hola', en(-1))],
    })
    const actividad = await bloque('Actividad reciente')
    expect(
      await actividad.findByText('No pudimos cargar la actividad reciente.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Secciones del período activo' }),
    ).toBeInTheDocument()
    fireEvent.click(actividad.getByRole('button', { name: 'Reintentar' }))
    expect(
      await actividad.findByRole('link', { name: 'Hola' }),
    ).toBeInTheDocument()
  })
})

describe('dashboard del ayudante', () => {
  const resumen = (): SeccionResumen => ({
    id: 's1',
    numero: 1,
    curso: ICC101,
    periodo: { id: 'p', anio: 2026, semestre: 2 },
    rol: 'AYUDANTE',
    horario: [{ dia: 2, inicio: '09:00', termino: '10:30', sala: 'Sala D-4' }],
    profesor: { id: 'p', nombre: 'Camila Rojas' },
    profesores: ['Camila Rojas'],
    ayudantes: [],
  })

  test('tarjetas con el profesor, horario desde el resumen y sin «Por revisar»', async () => {
    await abrir({ [secc('s1', 'resumen')]: resumen }, 'AYUDANTE')
    const lista = within(
      await screen.findByRole('list', { name: 'Secciones del período activo' }),
    )
    expect(
      lista.getByText('Profesor a cargo: Camila Rojas'),
    ).toBeInTheDocument()
    expect(lista.queryByText(/alumnos?$/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Por revisar' })).toBeNull()
    const horario = await bloque('Horario de la semana')
    expect(
      (await horario.findByText('Martes')).closest('li'),
    ).toHaveTextContent('09:00–10:30 · Sala D-4 · ICC101')
  })

  test('sin secciones muestra el estado vacío', async () => {
    await abrir({ '/api/dashboard/secciones-ayudante': () => [] }, 'AYUDANTE')
    expect(
      await screen.findByText(
        'No eres ayudante de ninguna sección en el período activo.',
      ),
    ).toBeInTheDocument()
  })
})
