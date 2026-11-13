import type { EventoAcceso, PaginaEventos, Rol } from '@cursus/shared'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EVENTOS = '/api/auditoria/eventos'
const UNIVERSIDADES = '/api/auditoria/universidades'
const OPCIONES = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    nombre: 'Universidad Demo Norte',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    nombre: 'Universidad Demo Sur',
  },
]
const PROFESOR_ID = '00000000-0000-4000-8000-0000000000b2'
const ALUMNO_ID = '00000000-0000-4000-8000-0000000000b1'

const evento = (extra: Partial<EventoAcceso> = {}): EventoAcceso => ({
  id: 'e1',
  tipo: 'INICIO_SESION',
  resultado: 'EXITOSO',
  fecha: '2026-10-07T15:30:00.000Z',
  ip: '198.51.100.1',
  usuario: { id: ALUMNO_ID, nombre: 'Alumno Norte', rol: 'ALUMNO' },
  universidad: { id: OPCIONES[0].id, nombre: OPCIONES[0].nombre },
  detalle: {},
  ...extra,
})
const pagina = (
  eventos: EventoAcceso[],
  extra: Partial<PaginaEventos> = {},
): PaginaEventos => ({
  total: eventos.length,
  pagina: 1,
  tamano: 25,
  eventos,
  ...extra,
})
const LISTA = pagina([
  evento(),
  evento({
    id: 'e2',
    resultado: 'FALLIDO',
    usuario: null,
    universidad: null,
    ip: null,
    fecha: '2026-10-06T09:00:00.000Z',
  }),
  evento({
    id: 'e3',
    tipo: 'CAMBIO_NOTA',
    ip: null,
    usuario: { id: PROFESOR_ID, nombre: 'Profesor Norte', rol: 'PROFESOR' },
    detalle: { subtipo: 'APROBACION', origen: 'nota_cambio' },
  }),
])

const rutas = (datos: () => unknown = () => LISTA) => ({
  [EVENTOS]: datos,
  [UNIVERSIDADES]: () => OPCIONES,
})
describe('Registro de accesos del Director (SEG-05)', () => {
  test('muestra la tabla con evento, resultado, usuario, universidad, IP y detalle', async () => {
    await renderConSesion('DIRECTOR', '/accesos', rutas())
    const tabla = await screen.findByRole('table')
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(3)
    const primera = within(filas[0])
    expect(primera.getByText('Inicio de sesión')).toBeInTheDocument()
    expect(primera.getByText('Exitoso')).toBeInTheDocument()
    expect(primera.getByText('Alumno Norte')).toBeInTheDocument()
    expect(primera.getByText('Alumno')).toBeInTheDocument()
    expect(primera.getByText('Universidad Demo Norte')).toBeInTheDocument()
    expect(primera.getByText('198.51.100.1')).toBeInTheDocument()
    // Sin cuenta ni IP: se dice, no queda en blanco.
    const fallido = within(filas[1])
    expect(fallido.getByText('Fallido')).toBeInTheDocument()
    expect(fallido.getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Aprobación')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Cambio de nota')).toBeInTheDocument()
    expect(screen.getByText(/3 eventos · página 1 de 1/)).toBeInTheDocument()
  })

  test('las fechas llevan el instante y la zona horaria', async () => {
    await renderConSesion('DIRECTOR', '/accesos', rutas())
    const [hora] = await screen.findAllByRole('time')
    expect(hora).toHaveAttribute('dateTime', '2026-10-07T15:30:00.000Z')
    // La zona del navegador (CLST, GMT-3, UTC…) va en la misma fecha.
    const zona = new Intl.DateTimeFormat('es-CL', { timeZoneName: 'short' })
      .formatToParts(new Date('2026-10-07T15:30:00.000Z'))
      .find((p) => p.type === 'timeZoneName')?.value as string
    expect(hora.textContent).toContain(zona)
    expect(screen.getByText(/Fechas en tu zona horaria \(/)).toBeInTheDocument()
  })

  test('los filtros llegan a la API y vuelven a la primera página', async () => {
    const fetch = vi.fn()
    await renderConSesion('DIRECTOR', '/accesos?pagina=3', {
      [EVENTOS]: (_init, url) => {
        fetch(url)
        return pagina([evento()], { total: 80, pagina: 3 })
      },
      [UNIVERSIDADES]: () => OPCIONES,
    })
    await screen.findByRole('table')
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain('pagina=3')

    fireEvent.change(screen.getByLabelText('Tipo de evento'), {
      target: { value: 'CIERRE_CURSO' },
    })
    await screen.findByRole('table')
    fireEvent.change(await screen.findByLabelText('Universidad'), {
      target: { value: OPCIONES[1].id },
    })
    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-01' },
    })
    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-10-31' },
    })
    await vi.waitFor(() => {
      const consulta = new URL(
        String(fetch.mock.calls.at(-1)?.[0]),
        'http://localhost',
      ).searchParams
      expect(consulta.get('tipo')).toBe('CIERRE_CURSO')
      expect(consulta.get('universidadId')).toBe(OPCIONES[1].id)
      // Los días son los de la zona del navegador, enviados como instantes.
      expect(consulta.get('desde')).toBe(
        new Date('2026-10-01T00:00:00').toISOString(),
      )
      expect(consulta.get('hasta')).toBe(
        new Date('2026-10-31T23:59:59.999').toISOString(),
      )
      expect(consulta.has('pagina')).toBe(false)
    })
  })

  test('un usuario de la tabla filtra por él y el filtro se puede quitar', async () => {
    const fetch = vi.fn()
    await renderConSesion('DIRECTOR', '/accesos', {
      [EVENTOS]: (_init, url) => {
        fetch(url)
        return LISTA
      },
      [UNIVERSIDADES]: () => OPCIONES,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Profesor Norte' }),
    )
    await vi.waitFor(() =>
      expect(
        new URL(
          String(fetch.mock.calls.at(-1)?.[0]),
          'http://localhost',
        ).searchParams.get('usuarioId'),
      ).toBe(PROFESOR_ID),
    )
    // El filtro queda visible, con el nombre, y se quita.
    fireEvent.click(
      await screen.findByRole('button', { name: /Usuario: Profesor Norte/ }),
    )
    await vi.waitFor(() =>
      expect(String(fetch.mock.calls.at(-1)?.[0])).not.toContain('usuarioId'),
    )
    expect(screen.queryByRole('button', { name: /Usuario:/ })).toBeNull()
  })

  test('pagina con Anterior y Siguiente', async () => {
    const fetch = vi.fn()
    await renderConSesion('DIRECTOR', '/accesos', {
      [EVENTOS]: (_init, url) => {
        fetch(url)
        const n = Number(
          new URL(url as string, 'http://x').searchParams.get('pagina') ?? 1,
        )
        return pagina([evento({ id: `e${n}` })], {
          total: 60,
          pagina: n,
          tamano: 25,
        })
      },
      [UNIVERSIDADES]: () => OPCIONES,
    })
    expect(
      await screen.findByText(/60 eventos · página 1 de 3/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText(/página 2 de 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText(/página 3 de 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain('pagina=3')
  })

  test('sin eventos dice que no hay resultados', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/accesos',
      rutas(() => pagina([])),
    )
    expect(
      await screen.findByText('No hay eventos con estos filtros.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('muestra la carga mientras llega la respuesta', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/accesos',
      rutas(() => new Promise(() => {})),
    )
    expect(await screen.findByText('Cargando el registro…')).toBeInTheDocument()
  })

  test('si la API falla, avisa y permite reintentar', async () => {
    let intentos = 0
    await renderConSesion(
      'DIRECTOR',
      '/accesos',
      rutas(() => (intentos++ === 0 ? json({}, 500) : LISTA)),
    )
    expect(
      await screen.findByText('No pudimos cargar el registro de accesos.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  test('un rango con "desde" posterior a "hasta" no consulta', async () => {
    const eventos = vi.fn(() => LISTA)
    await renderConSesion(
      'DIRECTOR',
      '/accesos?desde=2026-10-10&hasta=2026-10-01',
      rutas(eventos),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha «desde» no puede ser posterior a «hasta».',
    )
    expect(eventos).not.toHaveBeenCalled()
  })

  test.each(['2026-13-01', '2026-02-30', '2026-00-10', '2026-04-31'])(
    'la fecha imposible %s avisa y no consulta ni se corrige en silencio',
    async (dia) => {
      const eventos = vi.fn(() => LISTA)
      for (const filtro of ['desde', 'hasta']) {
        await renderConSesion(
          'DIRECTOR',
          `/accesos?${filtro}=${dia}`,
          rutas(eventos),
        )
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Los filtros de la dirección no son válidos.',
        )
        cleanup()
      }
      expect(eventos).not.toHaveBeenCalled()
    },
  )

  test('una fecha bisiesta válida sí se consulta', async () => {
    const eventos = vi.fn(() => LISTA)
    await renderConSesion(
      'DIRECTOR',
      '/accesos?desde=2028-02-29',
      rutas(eventos),
    )
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(eventos).toHaveBeenCalledTimes(1)
  })

  test('una página fuera de rango ofrece volver a la primera conservando los filtros', async () => {
    const fetch = vi.fn()
    await renderConSesion('DIRECTOR', '/accesos?tipo=CAMBIO_NOTA&pagina=3', {
      [EVENTOS]: (_init, url) => {
        fetch(url)
        const n = Number(
          new URL(url as string, 'http://x').searchParams.get('pagina') ?? 1,
        )
        return n === 1
          ? pagina([evento()], { total: 30, pagina: 1 })
          : pagina([], { total: 30, pagina: n })
      },
      [UNIVERSIDADES]: () => OPCIONES,
    })
    expect(
      await screen.findByText(/Esta página no tiene eventos: .* 2 páginas/),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver a la primera página' }),
    )
    expect(await screen.findByRole('table')).toBeInTheDocument()
    const consulta = new URL(
      String(fetch.mock.calls.at(-1)?.[0]),
      'http://localhost',
    ).searchParams
    expect(consulta.get('tipo')).toBe('CAMBIO_NOTA')
    expect(consulta.has('pagina')).toBe(false)
    expect(screen.getByLabelText('Tipo de evento')).toHaveValue('CAMBIO_NOTA')
  })

  test('filtros inválidos en la URL no llegan a la API', async () => {
    const eventos = vi.fn(() => LISTA)
    await renderConSesion(
      'DIRECTOR',
      '/accesos?tipo=OTRO&usuario=x',
      rutas(eventos),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Los filtros de la dirección no son válidos.',
    )
    expect(eventos).not.toHaveBeenCalled()
  })

  test('el Director ve la entrada en el menú', async () => {
    const menu = await renderConSesion('DIRECTOR', '/', rutas())
    expect(
      within(menu).getByRole('link', { name: 'Registro de accesos' }),
    ).toHaveAttribute('href', '/accesos')
  })

  test.each<Rol>([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ])('%s no ve la entrada ni puede abrir la ruta', async (rol) => {
    const eventos = vi.fn(() => LISTA)
    const menu = await renderConSesion(rol, '/accesos', rutas(eventos))
    expect(
      within(menu).queryByRole('link', { name: 'Registro de accesos' }),
    ).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Registro de accesos' }),
    ).toBeNull()
    expect(eventos).not.toHaveBeenCalled()
  })
})
