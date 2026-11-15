import type { AlumnosEspacio, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/espacio/secciones/seccion-1/resumen'
const VISTA = '/mis-cursos/secciones/seccion-1'
const SILABO = '/api/espacio/secciones/seccion-1/silabo-vigente'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: {
    id: 'curso-icc101',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
  },
  periodo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [
    { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
    { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
  ],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  profesores: ['Camila Rojas'],
  ayudantes: [
    { id: 'ayudante-1', nombre: 'Diego Muñoz' },
    { id: 'ayudante-2', nombre: 'Sofía Pérez' },
  ],
}

const vista = async () =>
  within(await screen.findByRole('region', { name: 'Vista del curso' }))

describe('sílabo vigente (MAT-03)', () => {
  test('destaca el PDF en el curso y pide una URL al descargar', async () => {
    const url = 'https://archivos.test/silabo.pdf?firma=prueba'
    const destinos: string[] = []
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        destinos.push(this.href)
      })
    const pedir = vi.fn(() => ({ url, expiraEn: '2026-11-10T13:00:00Z' }))
    try {
      await renderConSesion('ALUMNO', VISTA, {
        [RUTA]: () => RESUMEN,
        [SILABO]: () => ({
          silabo: { version: 2, subidoEn: '2026-11-09T15:00:00Z' },
        }),
        [`${SILABO}/descarga`]: pedir,
      })
      const tarjeta = within(
        await screen.findByRole('region', { name: 'Sílabo del curso' }),
      )
      expect(
        await tarjeta.findByText('Versión vigente 2 · PDF'),
      ).toBeInTheDocument()
      expect(pedir).not.toHaveBeenCalled()
      fireEvent.click(tarjeta.getByRole('button', { name: 'Descargar sílabo' }))
      await tarjeta.findByRole('button', { name: 'Descargar sílabo' })
      expect(pedir).toHaveBeenCalledTimes(1)
      expect(destinos).toEqual([url])
    } finally {
      clic.mockRestore()
    }
  })

  test('muestra un aviso cuando todavía no se ha publicado el sílabo', async () => {
    await renderConSesion('ALUMNO', VISTA, { [RUTA]: () => RESUMEN })
    const tarjeta = within(
      await screen.findByRole('region', { name: 'Sílabo del curso' }),
    )
    expect(
      await tarjeta.findByText(
        'Aún no hay un sílabo publicado para este curso.',
      ),
    ).toBeInTheDocument()
    expect(
      tarjeta.queryByRole('button', { name: 'Descargar sílabo' }),
    ).not.toBeInTheDocument()
  })

  test('permite reintentar cuando el servidor no entrega la descarga', async () => {
    await renderConSesion('ALUMNO', VISTA, {
      [RUTA]: () => RESUMEN,
      [SILABO]: () => ({
        silabo: { version: 1, subidoEn: '2026-11-09T15:00:00Z' },
      }),
      [`${SILABO}/descarga`]: () => json({}, 503),
    })
    const tarjeta = within(
      await screen.findByRole('region', { name: 'Sílabo del curso' }),
    )
    fireEvent.click(
      await tarjeta.findByRole('button', { name: 'Descargar sílabo' }),
    )
    expect(await tarjeta.findByRole('alert')).toHaveTextContent(
      'No pudimos descargar el sílabo.',
    )
    expect(
      tarjeta.getByRole('button', { name: 'Descargar sílabo' }),
    ).toBeEnabled()
  })
})

describe('vista de la sección (ESP-04)', () => {
  test.each<[Rol, string]>([
    ['PROFESOR', 'Profesor'],
    ['AYUDANTE', 'Ayudante'],
    ['ALUMNO', 'Alumno'],
  ])(
    '%s ve curso, sección, horario con sala y equipo docente',
    async (rol, nombreRol) => {
      await renderConSesion(rol, VISTA, { [RUTA]: () => ({ ...RESUMEN, rol }) })

      const v = await vista()
      expect(v.getByText('ICC101')).toBeInTheDocument()
      expect(
        v.getByRole('heading', { name: 'Introducción a la Programación' }),
      ).toBeInTheDocument()
      expect(v.getByText('Sección 1')).toBeInTheDocument()
      expect(v.getByText(`Entras como ${nombreRol}`)).toBeInTheDocument()
      expect(
        within(v.getByRole('list', { name: 'Horario' }))
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([
        'Lunes 08:30–10:00 · Sala A-101',
        'Miércoles 10:00–11:30 · Sala B-202',
      ])
      expect(v.getByText('Camila Rojas')).toBeInTheDocument()
      expect(v.getByText('Diego Muñoz')).toBeInTheDocument()
      expect(v.getByText('Sofía Pérez')).toBeInTheDocument()
    },
  )

  test.each<Rol>(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s no ve acciones de gestión del Administrativo',
    async (rol) => {
      await renderConSesion(rol, VISTA, { [RUTA]: () => ({ ...RESUMEN, rol }) })

      const v = await vista()
      // Solo pestañas y accesos (enlaces): ningún botón de gestión (agregar o
      // quitar alumnos, cargar CSV, asignar docentes, editar horario).
      expect(v.queryAllByRole('button')).toEqual([])
      expect(
        v.queryByRole('link', {
          name: /agregar|quitar|cargar|asignar|editar/i,
        }),
      ).not.toBeInTheDocument()
      expect(v.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
        [
          `${VISTA}?vista=anuncios`,
          `${VISTA}?vista=material`,
          `${VISTA}?vista=entregas`,
          `${VISTA}?vista=notas`,
          `${VISTA}?vista=asistencia`,
        ],
      )
    },
  )

  test('la navegación de la sección tiene Home y las demás secciones, todas habilitadas', async () => {
    await renderConSesion('ALUMNO', VISTA, { [RUTA]: () => RESUMEN })

    const pestanas = within(
      (await vista()).getByRole('tablist', { name: 'Pestañas de la sección' }),
    ).getAllByRole('tab')
    expect(pestanas.map((p) => p.textContent)).toEqual([
      'Home',
      'Anuncios',
      'Material',
      'Entregas',
      'Notas',
      'Asistencia',
      'Integrantes',
    ])
    for (const pestana of pestanas) {
      expect(pestana).toBeEnabled()
      expect(pestana).toHaveAttribute(
        'aria-selected',
        String(pestana.textContent === 'Home'),
      )
    }
    // Sin textos de trabajo pendiente en la UI.
    expect(document.body).not.toHaveTextContent(/TODO|pendiente|próximamente/i)
  })

  test('sin horario, profesor ni ayudantes lo indica', async () => {
    await renderConSesion('ALUMNO', VISTA, {
      [RUTA]: () => ({
        ...RESUMEN,
        horario: [],
        profesor: null,
        profesores: [],
        ayudantes: [],
      }),
    })

    const v = await vista()
    expect(v.getByText('Sin horario asignado')).toBeInTheDocument()
    expect(v.getByText('Sin profesor asignado')).toBeInTheDocument()
    expect(v.getByText('Sin ayudantes asignados')).toBeInTheDocument()
  })

  test('si no es integrante (403) lo indica y permite volver', async () => {
    await renderConSesion('ALUMNO', VISTA, { [RUTA]: () => json({}, 403) })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Sin acceso')
    expect(alerta).toHaveTextContent('No eres integrante de esta sección.')
    expect(
      within(alerta).getByRole('button', { name: 'Volver al Dashboard' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Vista del curso' }),
    ).not.toBeInTheDocument()
  })
})

describe('alumnos de la sección (ESP-05)', () => {
  const ALUMNOS = '/api/espacio/secciones/seccion-1/alumnos'
  // La lista de alumnos está en Integrantes (?vista=integrantes).
  const INTEGRANTES = `${VISTA}?vista=integrantes`
  const LISTA: AlumnosEspacio = {
    total: 3,
    // El backend ya los entrega ordenados por nombre.
    alumnos: [
      {
        id: 'alumno-1',
        nombre: 'Ángela Mora',
        correo: 'angela.mora@norte.cursus.test',
      },
      {
        id: 'alumno-2',
        nombre: 'Nadia León',
        correo: 'nadia.leon@norte.cursus.test',
      },
      {
        id: 'alumno-3',
        nombre: 'Ñandú Pérez',
        correo: 'nandu.perez@norte.cursus.test',
      },
    ],
  }
  const comoProfesor = { ...RESUMEN, rol: 'PROFESOR' as const }
  const seccionAlumnos = async (nombre: string | RegExp) =>
    within(await screen.findByRole('region', { name: nombre }))

  test('el profesor ve el total y la lista con nombre y correo, en orden', async () => {
    await renderConSesion('PROFESOR', INTEGRANTES, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => LISTA,
    })

    const alumnos = await seccionAlumnos('Alumnos (3)')
    expect(
      within(alumnos.getByRole('list', { name: 'Alumnos inscritos' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Ángela Moraangela.mora@norte.cursus.test',
      'Nadia Leónnadia.leon@norte.cursus.test',
      'Ñandú Péreznandu.perez@norte.cursus.test',
    ])
  })

  test('la lista es de solo lectura: sin botones ni enlaces', async () => {
    await renderConSesion('PROFESOR', INTEGRANTES, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => LISTA,
    })

    const alumnos = await seccionAlumnos('Alumnos (3)')
    expect(alumnos.queryAllByRole('button')).toEqual([])
    expect(alumnos.queryAllByRole('link')).toEqual([])
    expect(
      screen.queryByRole('button', { name: /agregar|quitar|cargar/i }),
    ).not.toBeInTheDocument()
  })

  test('sin alumnos inscritos muestra el estado vacío', async () => {
    await renderConSesion('PROFESOR', INTEGRANTES, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => ({ total: 0, alumnos: [] }),
    })

    const alumnos = await seccionAlumnos('Alumnos (0)')
    expect(
      alumnos.getByText('Aún no hay alumnos inscritos'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('PROFESOR', INTEGRANTES, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => (++intentos === 1 ? json({}, 500) : LISTA),
    })

    const alumnos = await seccionAlumnos('Alumnos')
    expect(
      await alumnos.findByText('No pudimos cargar los alumnos.'),
    ).toBeInTheDocument()
    fireEvent.click(alumnos.getByRole('button', { name: 'Reintentar' }))

    expect(await seccionAlumnos('Alumnos (3)')).toBeTruthy()
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no ve la sección de alumnos ni la pide',
    async (rol) => {
      let pedidas = 0
      await renderConSesion(rol, INTEGRANTES, {
        [RUTA]: () => ({ ...RESUMEN, rol }),
        [ALUMNOS]: () => {
          pedidas++
          return LISTA
        },
      })

      await vista()
      expect(
        screen.queryByRole('region', { name: /^Alumnos/ }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText('angela.mora@norte.cursus.test'),
      ).not.toBeInTheDocument()
      expect(pedidas).toBe(0)
    },
  )
})

describe('layout de curso (UIX-04)', () => {
  const ANUNCIOS = '/api/espacio/secciones/seccion-1/anuncios'
  const ALUMNOS = '/api/espacio/secciones/seccion-1/alumnos'
  const rutas = (rol: Rol = 'PROFESOR') => ({
    [RUTA]: () => ({ ...RESUMEN, rol }),
    [ANUNCIOS]: () => [],
    [ALUMNOS]: () => ({ total: 0, alumnos: [] }),
  })
  const pestana = async (nombre: string) =>
    (await vista()).getByRole('tab', { name: nombre })

  test('el Home es la vista por defecto: resumen con curso, período, rol, horario, equipo y accesos', async () => {
    await renderConSesion('PROFESOR', VISTA, rutas())
    const v = await vista()

    expect(v.getByText('Período 2026-2')).toBeInTheDocument()
    expect(
      v.getByRole('heading', { name: 'Introducción a la Programación' }),
    ).toBeInTheDocument()
    expect(await pestana('Home')).toHaveAttribute('aria-selected', 'true')
    expect(v.getByRole('tabpanel', { name: 'Home' })).toBeInTheDocument()
    expect(
      v.getByRole('heading', { name: 'Horario y sala' }),
    ).toBeInTheDocument()
    expect(
      v.getByRole('heading', { name: 'Equipo docente' }),
    ).toBeInTheDocument()
    const accesos = within(v.getByRole('region', { name: 'Accesos' }))
    expect(accesos.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'AnunciosAvisos de la sección',
      'MaterialArchivos y documentos',
      'EntregasTrabajos e informes',
      'NotasEvaluaciones y calificaciones',
      'AsistenciaClases y asistencia',
    ])
  })

  test('elegir una sección cambia el contenido y la URL (?vista=), y Home la quita', async () => {
    await renderConSesion('PROFESOR', VISTA, rutas())

    fireEvent.click(await pestana('Anuncios'))
    expect(await pestana('Anuncios')).toHaveAttribute('aria-selected', 'true')
    expect(await pestana('Home')).toHaveAttribute('aria-selected', 'false')
    expect(
      await screen.findByRole('tabpanel', { name: 'Anuncios' }),
    ).toBeInTheDocument()
    // El resumen ya no está: cada sección se muestra sola.
    expect(screen.queryByRole('heading', { name: 'Horario y sala' })).toBeNull()

    fireEvent.click(await pestana('Home'))
    expect(
      await screen.findByRole('heading', { name: 'Horario y sala' }),
    ).toBeInTheDocument()
  })

  test('un acceso del Home abre esa sección', async () => {
    await renderConSesion('PROFESOR', VISTA, rutas())
    const v = await vista()
    fireEvent.click(
      within(v.getByRole('region', { name: 'Accesos' })).getByRole('link', {
        name: /^Anuncios/,
      }),
    )
    expect(
      await screen.findByRole('tabpanel', { name: 'Anuncios' }),
    ).toBeInTheDocument()
    expect(await pestana('Anuncios')).toHaveAttribute('aria-selected', 'true')
  })

  test('un enlace con ?vista= abre directo esa sección; un valor desconocido cae en el Home', async () => {
    await renderConSesion('PROFESOR', `${VISTA}?vista=anuncios`, rutas())
    expect(await pestana('Anuncios')).toHaveAttribute('aria-selected', 'true')
  })

  test('un ?vista= desconocido muestra el Home', async () => {
    await renderConSesion('PROFESOR', `${VISTA}?vista=otra-cosa`, rutas())
    expect(await pestana('Home')).toHaveAttribute('aria-selected', 'true')
  })

  test('Integrantes muestra el equipo docente a todos y los alumnos solo al profesor', async () => {
    await renderConSesion(
      'ALUMNO',
      `${VISTA}?vista=integrantes`,
      rutas('ALUMNO'),
    )
    const panel = within(
      await screen.findByRole('tabpanel', { name: 'Integrantes' }),
    )
    expect(panel.getByText('Diego Muñoz')).toBeInTheDocument()
    expect(panel.queryByRole('region', { name: /^Alumnos/ })).toBeNull()
  })

  test('Material lleva el sílabo vigente arriba', async () => {
    await renderConSesion('ALUMNO', `${VISTA}?vista=material`, {
      ...rutas('ALUMNO'),
      '/api/espacio/secciones/seccion-1/materiales': () => [],
      '/api/espacio/secciones/seccion-1/silabo': () => [],
    })
    const panel = within(
      await screen.findByRole('tabpanel', { name: 'Material' }),
    )
    expect(
      await panel.findByRole('region', { name: 'Sílabo del curso' }),
    ).toBeInTheDocument()
  })

  test('un curso cerrado lo avisa con una alerta informativa', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      ...rutas(),
      [RUTA]: () => ({ ...RESUMEN, rol: 'PROFESOR', cursoCerrado: true }),
    })
    const v = await vista()
    expect(v.getByText('Curso cerrado')).toBeInTheDocument()
    expect(
      v.getByText('Las notas, evaluaciones y asistencia son de solo lectura.'),
    ).toBeInTheDocument()
    expect(
      v.getByText('Curso cerrado').closest('[data-slot=alert]'),
    ).toHaveAttribute('data-variant', 'info')
  })

  test.each<Rol>(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    'la navegación de la sección es la misma para %s',
    async (rol) => {
      await renderConSesion(rol, VISTA, rutas(rol))
      const nombres = (await vista())
        .getAllByRole('tab')
        .map((t) => t.textContent)
      expect(nombres).toEqual([
        'Home',
        'Anuncios',
        'Material',
        'Entregas',
        'Notas',
        'Asistencia',
        'Integrantes',
      ])
    },
  )
})
