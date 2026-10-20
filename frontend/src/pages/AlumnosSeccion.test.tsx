import type { AlumnosSeccion, CursoDetalle } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const RUTA = '/api/secciones/seccion-1/alumnos'
const SECCION = {
  id: 'seccion-1',
  numero: 1,
  curso: {
    id: 'curso-1',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
  },
}
const ALUMNOS: AlumnosSeccion = {
  seccion: SECCION,
  alumnos: [
    { id: 'a-1', nombre: 'Ángela Mora', correo: 'angela@norte.cursus.test' },
    { id: 'a-2', nombre: 'Ñandú Pérez', correo: 'nandu@norte.cursus.test' },
  ],
  total: 2,
}
const VACIA: AlumnosSeccion = { seccion: SECCION, alumnos: [], total: 0 }

const abrir = (
  respuesta: RutaSimulada,
  rol: 'ADMINISTRATIVO' | 'DIRECTOR' = 'ADMINISTRATIVO',
) => renderConSesion(rol, '/secciones/seccion-1/alumnos', { [RUTA]: respuesta })

describe('alumnos de una sección (GES-18)', () => {
  test('muestra el encabezado, el total y la tabla en el orden del backend', async () => {
    await abrir(() => ALUMNOS)

    expect(
      await screen.findByRole('heading', {
        name: 'Sección 1 · ICC101 Introducción a la Programación',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 alumnos inscritos')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Volver al curso' }),
    ).toHaveAttribute('href', '/cursos/curso-1')
    const tabla = screen.getByRole('table', { name: 'Alumnos' })
    expect(
      within(tabla)
        .getAllByRole('row')
        .map((fila) =>
          within(fila)
            .queryAllByRole('cell')
            .map((celda) => celda.textContent),
        )
        .slice(1),
    ).toEqual([
      ['Ángela Mora', 'angela@norte.cursus.test', 'Quitar'],
      ['Ñandú Pérez', 'nandu@norte.cursus.test', 'Quitar'],
    ])
    expect(screen.getByRole('button', { name: 'Agregar alumno' })).toBeVisible()
    // El encabezado de la página es el de Gestión académica.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gestión académica' }),
    ).toBeInTheDocument()
  })

  test('usa el singular con un alumno', async () => {
    await abrir(() => ({
      ...ALUMNOS,
      alumnos: ALUMNOS.alumnos.slice(0, 1),
      total: 1,
    }))
    expect(await screen.findByText('1 alumno inscrito')).toBeInTheDocument()
  })

  test('sin alumnos ofrece agregar uno o cargar un CSV (Próximamente)', async () => {
    await abrir(() => VACIA)

    expect(
      await screen.findByText('Esta sección aún no tiene alumnos.'),
    ).toBeInTheDocument()
    expect(screen.getByText('0 alumnos inscritos')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('button', { name: 'Agregar alumno' })).toBeVisible()
    const csv = screen.getByRole('button', { name: 'Cargar CSV' })
    expect(csv).toHaveAttribute('aria-disabled', 'true')
    expect(csv).toHaveAttribute('title', 'Próximamente')
  })

  test('agregar un alumno recarga la lista y el total sin desmontar la página', async () => {
    let pedidos = 0
    await renderConSesion('ADMINISTRATIVO', '/secciones/seccion-1/alumnos', {
      [RUTA]: (init) => {
        if (init?.method === 'POST') {
          return json(
            {
              alumno: {
                id: 'a-3',
                nombre: 'Ana Pérez',
                correo: 'ana@norte.cursus.test',
              },
              cuentaCreada: true,
              passwordProvisoria: 'ABCD2345EFGH6789',
            },
            201,
          )
        }
        pedidos++
        return pedidos === 1
          ? VACIA
          : {
              ...VACIA,
              alumnos: [
                {
                  id: 'a-3',
                  nombre: 'Ana Pérez',
                  correo: 'ana@norte.cursus.test',
                },
              ],
              total: 1,
            }
      },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar alumno' }),
    )
    const dialogo = screen.getByRole('dialog', {
      name: 'Agregar alumno a la sección 1',
    })
    fireEvent.change(within(dialogo).getByLabelText('Correo institucional'), {
      target: { value: 'ana@norte.cursus.test' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    // La lista se actualiza y el diálogo sigue mostrando la contraseña.
    expect(await screen.findByText('1 alumno inscrito')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Ana Pérez' })).toBeInTheDocument()
    expect(within(dialogo).getByText('ABCD2345EFGH6789')).toBeInTheDocument()
    expect(pedidos).toBe(2)
  })

  test('el Director ve la lista sin acciones', async () => {
    await abrir(() => VACIA, 'DIRECTOR')
    expect(
      await screen.findByText('Esta sección aún no tiene alumnos.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar alumno' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cargar CSV' })).toBeNull()
  })

  test('una sección que no existe muestra el 404', async () => {
    await abrir(() =>
      json({ statusCode: 404, message: 'La sección no existe' }, 404),
    )
    expect(
      await screen.findByRole('heading', { name: 'Sección no encontrada' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  test('si falla, muestra el error y reintenta', async () => {
    let fallar = true
    await abrir(() => (fallar ? new Response(null, { status: 500 }) : ALUMNOS))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los alumnos.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('table', { name: 'Alumnos' }),
    ).toBeInTheDocument()
  })

  test('muestra "Cargando alumnos…" mientras llega la lista', async () => {
    let responder: (respuesta: Response) => void = () => {}
    await abrir(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    expect(await screen.findByText('Cargando alumnos…')).toBeInTheDocument()
    responder(json(ALUMNOS))
    await waitFor(() =>
      expect(screen.queryByText('Cargando alumnos…')).toBeNull(),
    )
  })

  test('un rol sin permiso vuelve al Dashboard y la ruta no está en el menú', async () => {
    await renderConSesion('PROFESOR', '/secciones/seccion-1/alumnos')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Bienvenido/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Secciones' })).toBeNull()
  })
})

describe('quitar a un alumno (GES-19)', () => {
  const RUTA_QUITAR = '/api/secciones/seccion-1/alumnos/a-1/quitar'
  const QUITADO = {
    alumno: ALUMNOS.alumnos[0],
    quitadoEn: '2026-10-20T03:00:00.000Z',
    quitadoPor: { id: 'usuario-administrativo', nombre: 'Administrativo' },
  }
  const nombres = () =>
    within(screen.getByRole('table', { name: 'Alumnos' }))
      .getAllByRole('row')
      .slice(1)
      .map((fila) => within(fila).getAllByRole('cell')[0].textContent)

  async function abrirConfirmacion(quitar: RutaSimulada) {
    await renderConSesion('ADMINISTRATIVO', '/secciones/seccion-1/alumnos', {
      [RUTA]: () => ALUMNOS,
      [RUTA_QUITAR]: quitar,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Quitar a Ángela Mora' }),
    )
    return screen.getByRole('dialog', { name: 'Quitar alumno' })
  }

  test('pide confirmación con el nombre, el correo y la sección', async () => {
    const dialogo = await abrirConfirmacion(() => QUITADO)
    expect(dialogo).toHaveAccessibleDescription(
      '¿Quitar a Ángela Mora (angela@norte.cursus.test) de la sección 1? Su cuenta no se elimina.',
    )
  })

  test('cancelar no quita a nadie', async () => {
    let pedidos = 0
    const dialogo = await abrirConfirmacion(() => {
      pedidos++
      return QUITADO
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedidos).toBe(0)
    expect(nombres()).toEqual(['Ángela Mora', 'Ñandú Pérez'])
    expect(screen.getByText('2 alumnos inscritos')).toBeInTheDocument()
  })

  test('confirmar quita la fila y baja el total sin recargar', async () => {
    let pedidosLista = 0
    let metodo: string | undefined
    let responder: (respuesta: Response) => void = () => {}
    await renderConSesion('ADMINISTRATIVO', '/secciones/seccion-1/alumnos', {
      [RUTA]: () => {
        pedidosLista++
        return ALUMNOS
      },
      [RUTA_QUITAR]: (init) => {
        metodo = init?.method
        return new Promise<Response>((resolve) => {
          responder = resolve
        })
      },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Quitar a Ángela Mora' }),
    )
    const dialogo = screen.getByRole('dialog', { name: 'Quitar alumno' })
    const confirmar = within(dialogo).getByRole('button', { name: 'Quitar' })
    fireEvent.click(confirmar)

    // Deshabilitado mientras está en curso.
    await waitFor(() => expect(confirmar).toBeDisabled())
    responder(json(QUITADO))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ángela Mora fue quitado de la sección.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nombres()).toEqual(['Ñandú Pérez'])
    expect(screen.getByText('1 alumno inscrito')).toBeInTheDocument()
    expect(metodo).toBe('PATCH')
    expect(pedidosLista).toBe(1)
  })

  test('mientras el PATCH está pendiente no se puede cerrar ni abrir otra confirmación', async () => {
    let responder: (respuesta: Response) => void = () => {}
    const dialogo = await abrirConfirmacion(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    // Escape sin petición pendiente sí cierra (no se previene).
    expect(
      dialogo.dispatchEvent(new Event('cancel', { cancelable: true })),
    ).toBe(true)

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))
    const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' })
    await waitFor(() => expect(cancelar).toBeDisabled())

    // Ni Cancelar ni Escape cierran la confirmación de Ángela.
    fireEvent.click(cancelar)
    expect(
      dialogo.dispatchEvent(new Event('cancel', { cancelable: true })),
    ).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Quitar alumno' })).toBe(dialogo)
    expect(dialogo).toHaveAccessibleDescription(/Ángela Mora/)

    // Al terminar, la respuesta corresponde a su propia confirmación.
    responder(json(QUITADO))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ángela Mora fue quitado de la sección.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    // Recién ahora se puede confirmar la baja de otro alumno.
    fireEvent.click(
      screen.getByRole('button', { name: 'Quitar a Ñandú Pérez' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Quitar alumno' }),
    ).toHaveAccessibleDescription(/Ñandú Pérez/)
  })

  test('si falla, muestra el error y no cambia la lista', async () => {
    const dialogo = await abrirConfirmacion(() =>
      json(
        {
          statusCode: 404,
          message: 'El alumno no está inscrito en esta sección',
        },
        404,
      ),
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'El alumno no está inscrito en esta sección',
    )
    expect(
      within(dialogo).getByRole('button', { name: 'Quitar' }),
    ).toBeEnabled()
    expect(nombres()).toEqual(['Ángela Mora', 'Ñandú Pérez'])
    expect(screen.getByText('2 alumnos inscritos')).toBeInTheDocument()
  })

  test('el Director no ve el botón ni la columna', async () => {
    await abrir(() => ALUMNOS, 'DIRECTOR')
    expect(
      await screen.findByRole('table', { name: 'Alumnos' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  })
})

describe('desde el detalle del curso', () => {
  const CURSO: CursoDetalle = {
    id: 'curso-1',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
    carreraNombre: 'Ingeniería Civil en Informática',
    periodo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
    secciones: [
      {
        id: 'seccion-1',
        numero: 1,
        horario: null,
        profesor: null,
        profesorId: null,
        ayudantes: [],
        alumnos: 2,
      },
    ],
  }

  test('el número de alumnos enlaza a la lista de la sección', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => CURSO,
      [RUTA]: () => ALUMNOS,
    })
    fireEvent.click(
      await screen.findByRole('link', {
        name: 'Ver los 2 alumnos de la sección 1',
      }),
    )
    expect(
      await screen.findByRole('table', { name: 'Alumnos' }),
    ).toBeInTheDocument()
  })

  test('el Director no tiene el enlace en un curso de otra universidad', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => ({
        ...CURSO,
        universidadId: 'universidad-sur',
        universidadNombre: 'Universidad Demo Sur',
      }),
    })
    expect(
      await screen.findByRole('table', { name: 'Secciones' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ver los/ })).toBeNull()
  })

  test('el Director tiene el enlace en un curso de su universidad', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => ({
        ...CURSO,
        universidadId: 'universidad-norte',
        universidadNombre: 'Universidad Demo Norte',
      }),
    })
    expect(
      await screen.findByRole('link', {
        name: 'Ver los 2 alumnos de la sección 1',
      }),
    ).toBeInTheDocument()
  })
})
