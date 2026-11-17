import type {
  Actividad,
  EntregaDeAlumno,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const ACTIVIDADES = '/api/espacio/secciones/seccion-1/actividades'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  profesores: ['Camila Rojas'],
  ayudantes: [],
}

// Plazos en UTC: 2026-10-01T02:59Z es el 30-09-2026 a las 23:59 en Chile
// (UTC-3); 2026-11-15T02:59Z, el 14-11-2026 a las 23:59.
const LISTA: Actividad[] = [
  {
    id: 'a1',
    titulo: 'Informe 1',
    instrucciones: 'Entregar en PDF.\nMáximo 5 páginas.',
    plazo: '2026-10-01T02:59:00.000Z',
    cerrada: true,
  },
  {
    id: 'a2',
    titulo: 'Informe 2',
    instrucciones: 'Incluir anexos.',
    plazo: '2026-11-15T02:59:00.000Z',
    cerrada: false,
  },
]

// El período del curso, con sus fechas (GET /api/periodos).
const PERIODO_VIGENTE = {
  id: 'periodo-1',
  anio: 2026,
  semestre: 2,
  activo: true,
  fechaInicio: '2026-08-03',
  fechaTermino: '2026-12-18',
}

// «Ahora» de las pruebas: 15-11-2026 a las 10:30 en Chile (UTC-3). Solo se
// fija la fecha; los temporizadores siguen siendo reales.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T13:30:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

// Abre la vista de la sección con el rol dado y entra a la pestaña Entregas.
async function abrirEntregas(
  rol: Rol,
  actividades: (init?: RequestInit) => unknown = () => LISTA,
  otras: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [ACTIVIDADES]: actividades,
    '/api/periodos': () => [PERIODO_VIGENTE],
    ...otras,
  })
  fireEvent.click(await screen.findByRole('link', { name: 'Entregas' }))
  expect(screen.getByRole('link', { name: 'Entregas' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  // Con un diálogo abierto las consultas van a él; si no, a la pestaña.
  const zona = () =>
    within(
      screen.queryByRole('dialog') ??
        screen.getByRole('region', { name: 'Entregas' }),
    )
  const panel = new Proxy({} as ReturnType<typeof within>, {
    get: (_, clave) => Reflect.get(zona(), clave),
  })
  return { panel }
}

// Abre «Crear actividad» del encabezado (o del estado vacío).
async function abrirFormulario() {
  const pestana = within(screen.getByRole('region', { name: 'Entregas' }))
  fireEvent.click(
    (await pestana.findAllByRole('button', { name: 'Crear actividad' }))[0],
  )
  return within(await screen.findByRole('dialog', { name: 'Crear actividad' }))
}

// Elige un día en el calendario (avanza los meses que haga falta).
async function elegirDia(
  dialogo: ReturnType<typeof within>,
  dia: RegExp,
  mesesAdelante = 0,
) {
  fireEvent.click(dialogo.getByRole('button', { name: 'Fecha límite' }))
  for (let i = 0; i < mesesAdelante; i++)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ir al mes siguiente' }),
    )
  fireEvent.click(await screen.findByRole('button', { name: dia }))
}

// Rellena el formulario de una actividad nueva.
async function completar(campos: {
  titulo: string
  instrucciones: string
  dia: RegExp
  mesesAdelante?: number
  hora: string
  minutos: string
}) {
  const dialogo = await abrirFormulario()
  fireEvent.change(dialogo.getByLabelText('Título'), {
    target: { value: campos.titulo },
  })
  fireEvent.change(dialogo.getByLabelText('Instrucciones'), {
    target: { value: campos.instrucciones },
  })
  await elegirDia(dialogo, campos.dia, campos.mesesAdelante)
  fireEvent.change(dialogo.getByLabelText('Hora'), {
    target: { value: campos.hora },
  })
  fireEvent.change(dialogo.getByLabelText('Minutos'), {
    target: { value: campos.minutos },
  })
  return dialogo
}

describe('pestaña Entregas (MAT-08)', () => {
  test('al alumno le muestra primero las abiertas y al final las cerradas', async () => {
    const { panel } = await abrirEntregas('ALUMNO')
    await panel.findByRole('article', { name: 'Informe 1' })
    expect(
      panel.getAllByRole('article').map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Informe 2', 'Informe 1'])
  })

  test('lista las actividades con su plazo en hora de Chile y su estado', async () => {
    const { panel } = await abrirEntregas('ALUMNO')

    const informe1 = within(
      await panel.findByRole('article', { name: 'Informe 1' }),
    )
    expect(informe1.getByText('Cerrada')).toBeInTheDocument()
    expect(informe1.getByText('30-09-2026 23:59')).toBeInTheDocument()
    expect(
      informe1.getByText(/Entregar en PDF\.\s+Máximo 5 páginas\./),
    ).toBeInTheDocument()

    const informe2 = within(panel.getByRole('article', { name: 'Informe 2' }))
    expect(informe2.getByText('Abierta')).toBeInTheDocument()
    expect(informe2.getByText('14-11-2026 23:59')).toBeInTheDocument()
  })

  test('el profesor crea una actividad: envía los cuatro campos y vuelve a pedir la lista', async () => {
    const enviados: unknown[] = []
    let creada = false
    const nueva: Actividad = {
      id: 'a3',
      titulo: 'Informe final',
      instrucciones: 'Proyecto completo.',
      plazo: '2026-12-10T21:00:00.000Z',
      cerrada: false,
    }
    const { panel } = await abrirEntregas('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        creada = true
        return json(nueva, 201)
      }
      return creada ? [...LISTA, nueva] : LISTA
    })
    await panel.findByText('Informe 1')

    const dialogo = await completar({
      titulo: 'Informe final',
      instrucciones: 'Proyecto completo.',
      dia: /10 de diciembre de 2026/,
      mesesAdelante: 1,
      hora: '18',
      minutos: '00',
    })
    expect(
      dialogo.getByRole('button', { name: 'Fecha límite' }),
    ).toHaveTextContent('10-12-2026')
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear actividad' }))

    expect(await screen.findByText('Actividad creada')).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        titulo: 'Informe final',
        instrucciones: 'Proyecto completo.',
        fecha: '2026-12-10',
        hora: '18:00',
      },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      await panel.findByRole('row', { name: 'Informe final' }),
    ).toBeInTheDocument()
  })

  test('un 400 del backend se muestra en una alerta de peligro, con fechas en dd-mm-aaaa', async () => {
    const mensaje =
      'La fecha límite debe estar dentro del período del curso (del 2026-08-03 al 2026-12-18)'
    await abrirEntregas('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 400, message: mensaje }, 400)
        : LISTA,
    )
    const dialogo = await completar({
      titulo: 'Informe',
      instrucciones: 'Entregar en PDF.',
      dia: /20 de noviembre de 2026/,
      hora: '12',
      minutos: '00',
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear actividad' }))

    const alerta = await dialogo.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(alerta).toHaveTextContent(
      'La fecha límite debe estar dentro del período del curso (del 03-08-2026 al 18-12-2026)',
    )
    expect(alerta.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    // Un solo mensaje: ningún error de campo que lo contradiga.
    expect(dialogo.getAllByRole('alert')).toHaveLength(1)
  })

  // El Director lee por la API (db-spec), pero no tiene ruta a esta vista:
  // /mis-cursos no está en su menú.
  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s ve la lista pero no el formulario',
    async (rol) => {
      const { panel } = await abrirEntregas(rol)

      expect(await panel.findByText('Informe 1')).toBeInTheDocument()
      expect(
        panel.queryByRole('form', { name: 'Nueva actividad' }),
      ).not.toBeInTheDocument()
      expect(
        panel.queryByRole('button', { name: 'Crear actividad' }),
      ).not.toBeInTheDocument()
    },
  )

  test('sin actividades muestra el estado vacío', async () => {
    const { panel } = await abrirEntregas('AYUDANTE', () => [])

    expect(
      await panel.findByText('Aún no hay actividades de entrega'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirEntregas('ALUMNO', () =>
      ++intentos === 1 ? json({}, 500) : LISTA,
    )

    expect(
      await panel.findByText('No pudimos cargar las actividades.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Informe 1')).toBeInTheDocument()
  })
})

const ENTREGAS = `${ACTIVIDADES}/a2/entregas`
// 2026-11-10T18:05Z es el 10-11-2026 a las 15:05 en Chile.
const ENTREGADAS: EntregaDeAlumno[] = [
  {
    alumno: { id: 'al1', nombre: 'Ana Pérez', correo: 'ana@x' },
    entrega: {
      id: 'e1',
      entregadaEn: '2026-11-10T18:05:00.000Z',
      versiones: 2,
      archivo: {
        id: 'f1',
        nombre: 'Informe.pdf',
        tipo: 'application/pdf',
        tamano: 10,
        subidoEn: '2026-11-10T18:04:00.000Z',
      },
    },
  },
  {
    alumno: { id: 'al2', nombre: 'Bruno Soto', correo: 'bruno@x' },
    entrega: null,
  },
]
const SOLO_A2 = () => [LISTA[1]]

// El equipo docente ve las entregas de una actividad en su diálogo.
async function verEntregas(titulo = 'Informe 2') {
  fireEvent.click(
    await screen.findByRole('button', { name: `Ver entregas de ${titulo}` }),
  )
  return within(
    await screen.findByRole('dialog', { name: `Entregas de ${titulo}` }),
  )
}

describe('entregas de una actividad para el equipo docente (MAT-10)', () => {
  test.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    '%s ve la tabla de alumnos con estado, fecha y hora',
    async (rol) => {
      const { panel } = await abrirEntregas(rol, SOLO_A2, {
        [ENTREGAS]: () => ENTREGADAS,
      })
      await verEntregas()
      const tabla = await panel.findByRole('table', {
        name: 'Entregas de Informe 2',
      })
      const filas = within(tabla).getAllByRole('row')
      expect(within(filas[1]).getByText('Ana Pérez')).toBeInTheDocument()
      expect(within(filas[1]).getByText('Entregado')).toBeInTheDocument()
      expect(
        within(filas[1]).getByText('10-11-2026, 15:05'),
      ).toBeInTheDocument()
      expect(
        within(filas[1]).getByText('2 versiones; se descarga la última'),
      ).toBeInTheDocument()
      expect(within(filas[2]).getByText('Sin entrega')).toBeInTheDocument()
      expect(within(filas[2]).queryByRole('button')).toBeNull()
      expect(panel.getByText('1 de 2 alumnos entregaron')).toBeInTheDocument()
    },
  )

  test('el alumno no ve la tabla ni pide las entregas', async () => {
    const pedidas = vi.fn(() => ENTREGADAS)
    const { panel } = await abrirEntregas('ALUMNO', SOLO_A2, {
      [ENTREGAS]: pedidas,
    })
    await panel.findByText('Informe 2')
    expect(panel.queryByRole('table')).toBeNull()
    expect(pedidas).not.toHaveBeenCalled()
  })

  test('sin alumnos inscritos muestra el estado vacío', async () => {
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => [],
    })
    await verEntregas()
    expect(
      await panel.findByText('No hay alumnos inscritos en la sección'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intento = 0
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => (++intento === 1 ? json({}, 500) : ENTREGADAS),
    })
    await verEntregas()
    expect(
      await panel.findByText('No pudimos cargar las entregas.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByRole('table')).toBeInTheDocument()
  })

  test('descarga el informe con la URL firmada de esa entrega', async () => {
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const descarga = vi.fn(() => ({
      url: 'https://s3.test/informe?firma',
      expiraEn: '2026-11-11T00:00:00.000Z',
    }))
    const { panel } = await abrirEntregas('AYUDANTE', SOLO_A2, {
      [ENTREGAS]: () => ENTREGADAS,
      [`${ENTREGAS}/e1/descarga`]: descarga,
    })
    await verEntregas()
    fireEvent.click(
      await panel.findByRole('button', {
        name: 'Descargar el informe de Ana Pérez',
      }),
    )
    await waitFor(() => expect(clic).toHaveBeenCalledTimes(1))
    expect(descarga).toHaveBeenCalledTimes(1)
    expect((clic.mock.contexts[0] as HTMLAnchorElement).href).toBe(
      'https://s3.test/informe?firma',
    )
    clic.mockRestore()
  })

  test('si la descarga falla muestra el error y desbloquea el botón', async () => {
    const { panel } = await abrirEntregas('PROFESOR', SOLO_A2, {
      [ENTREGAS]: () => ENTREGADAS,
      [`${ENTREGAS}/e1/descarga`]: () => json({}, 503),
    })
    await verEntregas()
    const boton = await panel.findByRole('button', {
      name: 'Descargar el informe de Ana Pérez',
    })
    fireEvent.click(boton)
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No pudimos descargar el informe. Inténtalo nuevamente.',
    )
    expect(boton).toBeEnabled()
    expect(boton).toHaveTextContent('Descargar')
  })
})

// La regla del backend (actividades.service.ts), replicada en el diálogo:
// el plazo cae dentro del período y es posterior a la hora actual (Chile).
describe('ventana de fechas al crear una actividad', () => {
  test('período vigente: el calendario deshabilita los días fuera de la ventana', async () => {
    await abrirEntregas('PROFESOR')
    const dialogo = await abrirFormulario()
    expect(
      dialogo.getByText(
        'El plazo puede ser entre el 15-11-2026 y el 18-12-2026, en hora de Chile continental.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(dialogo.getByRole('button', { name: 'Fecha límite' }))
    expect(
      await screen.findByRole('button', { name: /14 de noviembre de 2026/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /15 de noviembre de 2026/ }),
    ).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Ir al mes siguiente' }))
    expect(
      await screen.findByRole('button', { name: /18 de diciembre de 2026/ }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: /19 de diciembre de 2026/ }),
    ).toBeDisabled()
  })

  test('mismo día: las horas que ya pasaron no se pueden elegir y se avisa junto al campo', async () => {
    const enviados: unknown[] = []
    await abrirEntregas('PROFESOR', (init) => {
      if (init?.method === 'POST') enviados.push(init.body)
      return LISTA
    })
    const dialogo = await completar({
      titulo: 'Control',
      instrucciones: 'Hoy mismo.',
      dia: /15 de noviembre de 2026/,
      hora: '10',
      minutos: '30',
    })
    // A las 10:30, las horas anteriores a las 10 no se ofrecen; 10:30 tampoco.
    const horas = within(dialogo.getByLabelText('Hora'))
    expect(horas.getByRole('option', { name: '09' })).toBeDisabled()
    expect(horas.getByRole('option', { name: '10' })).toBeEnabled()
    const minutos = within(dialogo.getByLabelText('Minutos'))
    expect(minutos.getByRole('option', { name: '30' })).toBeDisabled()
    expect(minutos.getByRole('option', { name: '35' })).toBeEnabled()

    fireEvent.click(dialogo.getByRole('button', { name: 'Crear actividad' }))
    const error = await dialogo.findByRole('alert')
    expect(error).toHaveTextContent(
      'Para hoy, la hora límite debe ser desde las 10:31.',
    )
    expect(dialogo.getByLabelText('Hora')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(dialogo.getByRole('group', { name: 'Hora límite' })).toHaveAttribute(
      'aria-describedby',
      error.id,
    )
    expect(enviados).toEqual([])

    // Con una hora válida se envía.
    fireEvent.change(dialogo.getByLabelText('Minutos'), {
      target: { value: '35' },
    })
    expect(dialogo.queryByRole('alert')).toBeNull()
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear actividad' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(JSON.parse(enviados[0] as string)).toMatchObject({
      fecha: '2026-11-15',
      hora: '10:35',
    })
  })

  test('sin fecha avisa en su campo, sin opinar de la hora', async () => {
    await abrirEntregas('PROFESOR')
    const dialogo = await abrirFormulario()
    fireEvent.change(dialogo.getByLabelText('Título'), {
      target: { value: 'Sin fecha' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear actividad' }))
    const errores = await dialogo.findAllByRole('alert')
    expect(errores).toHaveLength(1)
    expect(errores[0]).toHaveTextContent('Elige la fecha límite.')
    const fecha = dialogo.getByRole('button', { name: 'Fecha límite' })
    expect(fecha).toHaveAttribute('aria-invalid', 'true')
    expect(fecha).toHaveAccessibleDescription('Elige la fecha límite.')
  })

  test('período terminado: un solo aviso arriba y «Crear actividad» deshabilitado', async () => {
    const pedidas = vi.fn(() => LISTA)
    await abrirEntregas('PROFESOR', pedidas, {
      '/api/periodos': () => [
        {
          ...PERIODO_VIGENTE,
          semestre: 1,
          fechaInicio: '2026-03-02',
          fechaTermino: '2026-06-30',
        },
      ],
    })
    const pestana = within(screen.getByRole('region', { name: 'Entregas' }))
    const aviso = await pestana.findByText(
      'El período 2026-1 terminó el 30-06-2026. No se pueden crear actividades nuevas en este curso.',
    )
    expect(aviso.closest('[data-slot="alert"]')).toHaveAttribute(
      'data-variant',
      'warning',
    )
    expect(pestana.getAllByRole('alert')).toHaveLength(1)
    const crear = pestana.getByRole('button', { name: 'Crear actividad' })
    expect(crear).toBeDisabled()
    fireEvent.click(crear)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no pide las fechas del período ni ve el aviso',
    async (rol) => {
      const periodos = vi.fn(() => [PERIODO_VIGENTE])
      await abrirEntregas(rol, undefined, { '/api/periodos': periodos })
      await screen.findByText('Informe 1')
      expect(periodos).not.toHaveBeenCalled()
    },
  )

  test('la lista del profesor es una tabla con título, fecha límite, estado y acciones', async () => {
    const { panel } = await abrirEntregas('PROFESOR')
    const tabla = await panel.findByRole('table', { name: 'Actividades' })
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Título', 'Fecha límite', 'Estado', 'Acciones'])
    const fila = within(tabla).getByRole('row', { name: 'Informe 1' })
    expect(fila).toHaveTextContent('30-09-2026, 23:59')
    expect(within(fila).getByText('Cerrada')).toHaveAttribute(
      'data-slot',
      'badge',
    )
  })

  test('sin actividades, el estado vacío ofrece crear la primera', async () => {
    const { panel } = await abrirEntregas('PROFESOR', () => [])
    expect(
      await panel.findByText('Aún no hay actividades de entrega'),
    ).toBeInTheDocument()
    expect(
      panel.getAllByRole('button', { name: 'Crear actividad' }),
    ).toHaveLength(1)
  })
})
