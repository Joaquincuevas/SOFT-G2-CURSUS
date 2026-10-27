import type {
  BloqueHorario,
  Clase,
  DiaSemana,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const CLASES = '/api/espacio/secciones/seccion-1/clases'
// 2026-09-14 es lunes y 2026-09-15, martes.
const LUNES = '2026-09-14'
const MARTES = '2026-09-15'

// Un bloque a las 08:30 cada día, para que hoy (cualquier día) tenga uno.
const UNO_POR_DIA: BloqueHorario[] = ([1, 2, 3, 4, 5, 6, 7] as DiaSemana[]).map(
  (dia) => ({ dia, inicio: '08:30', termino: '10:00', sala: `Sala ${dia}` }),
)
// El lunes tiene además otro bloque a las 10:15.
const HORARIO: BloqueHorario[] = [
  ...UNO_POR_DIA,
  { dia: 1, inicio: '10:15', termino: '11:45', sala: 'Sala A-102' },
]

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: HORARIO,
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

const LISTA: Clase[] = [
  {
    id: 'c1',
    fecha: '2026-09-07',
    inicio: '08:30',
    termino: '10:00',
    sala: 'Sala 1',
  },
  {
    id: 'c2',
    fecha: LUNES,
    inicio: '10:15',
    termino: '11:45',
    sala: 'Sala A-102',
  },
]

// Abre la vista de la sección con el rol dado y entra a la pestaña
// Asistencia.
async function abrirAsistencia(
  rol: Rol,
  clases: (init?: RequestInit) => unknown = () => LISTA,
  resumen: Partial<SeccionResumen> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, ...resumen, rol }),
    [CLASES]: clases,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
  return within(screen.getByRole('tabpanel', { name: 'Asistencia' }))
}

const elegirFecha = (panel: ReturnType<typeof within>, fecha: string) =>
  fireEvent.change(panel.getByLabelText('Fecha'), {
    target: { value: fecha },
  })

describe('pestaña Asistencia (ASI-01)', () => {
  test('el profesor ve el formulario y las clases por fecha', async () => {
    const panel = await abrirAsistencia('PROFESOR')

    expect(
      await panel.findByRole('form', { name: 'Nueva clase' }),
    ).toBeInTheDocument()
    const filas = (await panel.findAllByRole('row')).map((f) => f.textContent)
    expect(filas).toEqual([
      'FechaBloqueSala',
      '2026-09-0708:30–10:00Sala 1',
      `${LUNES}10:15–11:45Sala A-102`,
    ])
  })

  test('sin cambiar la fecha envía solo el bloque: el backend usa hoy', async () => {
    const enviados: unknown[] = []
    const panel = await abrirAsistencia(
      'PROFESOR',
      (init) => {
        if (init?.method === 'POST') {
          enviados.push(JSON.parse(init.body as string))
          return json(LISTA[0], 201)
        }
        return LISTA
      },
      { horario: UNO_POR_DIA },
    )

    // Hoy (sea el día que sea) tiene un solo bloque, que queda elegido.
    fireEvent.click(
      await panel.findByRole('button', { name: 'Registrar clase' }),
    )

    expect(await panel.findByText('Clase registrada')).toBeInTheDocument()
    expect(enviados).toEqual([{ inicio: '08:30' }])
  })

  test('con otra fecha ofrece los bloques de ese día y envía fecha y bloque', async () => {
    const enviados: unknown[] = []
    const panel = await abrirAsistencia('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        return json(LISTA[1], 201)
      }
      return LISTA
    })
    await panel.findByRole('form', { name: 'Nueva clase' })

    elegirFecha(panel, LUNES)
    const bloque = panel.getByLabelText('Bloque')
    expect(
      within(bloque)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Elige un bloque',
      '08:30–10:00 · Sala 1',
      '10:15–11:45 · Sala A-102',
    ])
    // Con dos bloques hay que elegir uno.
    expect(
      panel.getByRole('button', { name: 'Registrar clase' }),
    ).toBeDisabled()

    fireEvent.change(bloque, { target: { value: '10:15' } })
    fireEvent.click(panel.getByRole('button', { name: 'Registrar clase' }))

    expect(await panel.findByText('Clase registrada')).toBeInTheDocument()
    expect(enviados).toEqual([{ fecha: LUNES, inicio: '10:15' }])
  })

  test('si pasa la medianoche con el formulario abierto, envía la fecha que muestra', async () => {
    // Solo se falsea Date: los timers de React siguen reales. 02:00 UTC del
    // 15 es el 14 a las 23:00 en Santiago (UTC-3 en septiembre).
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-15T02:00:00Z'))
      const enviados: unknown[] = []
      const panel = await abrirAsistencia(
        'PROFESOR',
        (init) => {
          if (init?.method === 'POST') {
            enviados.push(JSON.parse(init.body as string))
            return json(LISTA[0], 201)
          }
          return LISTA
        },
        { horario: UNO_POR_DIA },
      )
      await panel.findByRole('form', { name: 'Nueva clase' })
      expect(panel.getByLabelText('Fecha')).toHaveValue(LUNES)

      // Ya es el 15 en Santiago, pero el formulario sigue mostrando el 14.
      vi.setSystemTime(new Date('2026-09-15T04:00:00Z'))
      fireEvent.click(panel.getByRole('button', { name: 'Registrar clase' }))

      expect(await panel.findByText('Clase registrada')).toBeInTheDocument()
      expect(enviados).toEqual([{ fecha: LUNES, inicio: '08:30' }])
    } finally {
      vi.useRealTimers()
    }
  })

  test('si falla la carga del horario lo indica y permite reintentar', async () => {
    // La vista pide el resumen primero (responde bien); el formulario lo pide
    // de nuevo: esa vez falla y al reintentar responde bien.
    let pedidos = 0
    await renderConSesion('PROFESOR', VISTA, {
      [RESUMEN_RUTA]: () =>
        ++pedidos === 2 ? json({}, 500) : { ...RESUMEN, rol: 'PROFESOR' },
      [CLASES]: () => LISTA,
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Asistencia' }))
    const panel = within(screen.getByRole('tabpanel', { name: 'Asistencia' }))

    expect(
      await panel.findByText('No pudimos cargar el horario de la sección.'),
    ).toBeInTheDocument()
    expect(panel.queryByText(/aún no tiene horario/)).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(
      await panel.findByRole('form', { name: 'Nueva clase' }),
    ).toBeInTheDocument()
  })

  test('una clase repetida (409) muestra el mensaje del backend', async () => {
    const mensaje = `Ya existe una clase de esta sección el ${MARTES} en el bloque de las 08:30`
    const panel = await abrirAsistencia('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 409, message: mensaje }, 409)
        : LISTA,
    )
    await panel.findByRole('form', { name: 'Nueva clase' })

    elegirFecha(panel, MARTES)
    fireEvent.click(panel.getByRole('button', { name: 'Registrar clase' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(mensaje)
  })

  test('sin horario lo indica y no muestra el formulario', async () => {
    const panel = await abrirAsistencia('PROFESOR', () => [], { horario: [] })

    expect(
      await panel.findByText(
        'La sección aún no tiene horario; lo carga el Administrativo.',
      ),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Nueva clase' }),
    ).not.toBeInTheDocument()
  })

  test('el ayudante ve las clases pero no el formulario', async () => {
    const panel = await abrirAsistencia('AYUDANTE')

    expect(await panel.findByText('Sala A-102')).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Nueva clase' }),
    ).not.toBeInTheDocument()
    expect(panel.queryByRole('button')).not.toBeInTheDocument()
  })

  test('el alumno no ve las clases ni las pide (su asistencia es ASI-06)', async () => {
    let pedidas = 0
    const panel = await abrirAsistencia('ALUMNO', () => {
      pedidas++
      return LISTA
    })

    expect(
      panel.getByText('Las clases de la sección las registra su profesor.'),
    ).toBeInTheDocument()
    expect(panel.queryByRole('table')).not.toBeInTheDocument()
    expect(pedidas).toBe(0)
  })

  test('sin clases muestra el estado vacío', async () => {
    const panel = await abrirAsistencia('AYUDANTE', () => [])

    expect(
      await panel.findByText('Aún no hay clases registradas'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const panel = await abrirAsistencia('AYUDANTE', () =>
      ++intentos === 1 ? json({}, 500) : LISTA,
    )

    expect(
      await panel.findByText('No pudimos cargar las clases.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Sala A-102')).toBeInTheDocument()
  })
})
