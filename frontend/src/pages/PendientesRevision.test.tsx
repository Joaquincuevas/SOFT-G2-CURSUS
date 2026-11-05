import type {
  NotasEvaluacion,
  PendienteRevision,
  SeccionDashboard,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/dashboard/pendientes-revision'
const PAGINA = '/mis-cursos/pendientes-revision'
const NOTAS = '/api/espacio/secciones/seccion-1/evaluaciones/e1/notas'

const PENDIENTES: PendienteRevision[] = [
  {
    evaluacion: { id: 'e1', nombre: 'Control 1', fecha: '2026-09-01' },
    seccion: { id: 'seccion-1', numero: 1 },
    curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
    ayudante: { id: 'ayudante-1', nombre: 'Diego Muñoz' },
    enviadaEl: '2026-09-10T15:30:00.000Z',
    sinNota: 0,
  },
  {
    evaluacion: { id: 'e2', nombre: 'Tarea 1', fecha: '2026-09-05' },
    seccion: { id: 'seccion-2', numero: 2 },
    curso: { id: 'curso-2', codigo: 'ICC201', nombre: 'Estructuras' },
    ayudante: { id: 'ayudante-2', nombre: 'Elena Paz' },
    enviadaEl: '2026-09-12T09:00:00.000Z',
    sinNota: 1,
  },
]

const EN_REVISION: NotasEvaluacion = {
  evaluacion: {
    id: 'e1',
    nombre: 'Control 1',
    fecha: '2026-09-01',
    ponderacion: 20,
  },
  estado: 'EN_REVISION',
  alumnos: [
    { id: 'a1', nombre: 'Ana Ávila', nota: 6.1, estado: 'PROPUESTA' },
    { id: 'a2', nombre: 'Bruno Díaz', nota: 5.5, estado: 'PROPUESTA' },
  ],
}

const pagina = async () =>
  within(await screen.findByRole('region', { name: 'Pendientes de revisión' }))

describe('pendientes de revisión del profesor (NOT-10)', () => {
  test('lista curso, sección, evaluación, ayudante, fecha y alumnos sin nota', async () => {
    await renderConSesion('PROFESOR', PAGINA, { [RUTA]: () => PENDIENTES })
    const vista = await pagina()

    const filas = (await vista.findAllByRole('row')).slice(1)
    expect(
      filas.map((fila) =>
        within(fila)
          .getAllByRole('cell')
          .slice(0, 5)
          .map((celda) => celda.textContent),
      ),
    ).toEqual([
      [
        'ICC101 Programación',
        '1',
        'Control 1',
        'Diego Muñoz',
        new Date(PENDIENTES[0].enviadaEl as string).toLocaleString('es-CL', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
      ],
      [
        'ICC201 Estructuras',
        '2',
        'Tarea 1 (1 alumno sin nota)',
        'Elena Paz',
        new Date(PENDIENTES[1].enviadaEl as string).toLocaleString('es-CL', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
      ],
    ])
  })

  test('sin pendientes lo dice', async () => {
    await renderConSesion('PROFESOR', PAGINA, { [RUTA]: () => [] })
    expect(
      await (
        await pagina()
      ).findByText('No tienes evaluaciones pendientes de revisión.'),
    ).toBeInTheDocument()
  })

  test('si la lista falla muestra el error y Reintentar la vuelve a pedir', async () => {
    let intentos = 0
    await renderConSesion('PROFESOR', PAGINA, {
      [RUTA]: () => (++intentos === 1 ? json({}, 500) : PENDIENTES),
    })
    const vista = await pagina()

    expect(
      await vista.findByText('No pudimos cargar las evaluaciones pendientes.'),
    ).toBeInTheDocument()
    fireEvent.click(vista.getByRole('button', { name: 'Reintentar' }))
    expect(await vista.findByText('Control 1')).toBeInTheDocument()
    expect(intentos).toBe(2)
  })

  test('otro rol que entra por la URL recibe 403 y no se le ofrece reintentar', async () => {
    await renderConSesion('AYUDANTE', PAGINA, {
      [RUTA]: () => json({ statusCode: 403 }, 403),
    })
    const vista = await pagina()
    expect(
      await vista.findByText(
        'Solo el profesor ve las evaluaciones pendientes de revisión.',
      ),
    ).toBeInTheDocument()
    expect(
      vista.queryByRole('button', { name: 'Reintentar' }),
    ).not.toBeInTheDocument()
  })

  test('al abrir una pendiente se ven todas las notas propuestas en solo lectura', async () => {
    await renderConSesion('PROFESOR', PAGINA, {
      [RUTA]: () => PENDIENTES,
      [NOTAS]: () => EN_REVISION,
    })
    const vista = await pagina()

    const abrir = await vista.findByRole('button', {
      name: 'Notas de Control 1 (ICC101, sección 1)',
    })
    fireEvent.click(abrir)

    expect(await vista.findByText('Estado: En revisión')).toBeInTheDocument()
    expect(vista.getByLabelText('Nota de Ana Ávila')).toHaveValue('6.1')
    expect(vista.getByLabelText('Nota de Bruno Díaz')).toHaveValue('5.5')
    for (const campo of vista.getAllByLabelText(/^Nota de /)) {
      expect(campo).toHaveAttribute('readonly')
    }
    expect(
      vista.queryByRole('button', { name: 'Guardar borrador' }),
    ).not.toBeInTheDocument()
    expect(
      vista.queryByRole('button', { name: 'Enviar a revisión' }),
    ).not.toBeInTheDocument()

    // Volver a pulsar la cierra.
    fireEvent.click(abrir)
    expect(vista.queryByText('Estado: En revisión')).not.toBeInTheDocument()
  })
})

describe('contador de pendientes en el dashboard del profesor (NOT-10)', () => {
  const seccion = (
    id: string,
    codigo: string,
    pendientesRevision: number,
  ): SeccionDashboard => ({
    id,
    numero: 1,
    curso: { id: `curso-${id}`, codigo, nombre: codigo },
    horario: [],
    alumnos: 3,
    pendientesRevision,
  })

  test('muestra el total de la misma consulta y enlaza a la lista', async () => {
    const pedidas: string[] = []
    await renderConSesion('PROFESOR', '/', {
      '/api/dashboard/mis-secciones': () => [
        seccion('s1', 'ICC101', 2),
        seccion('s2', 'ICC201', 0),
        seccion('s3', 'ICC301', 1),
      ],
      [RUTA]: () => {
        pedidas.push(RUTA)
        return PENDIENTES
      },
    })

    const aviso = await screen.findByText(
      /3 evaluaciones pendientes de revisión/,
    )
    // Cada tarjeta con pendientes dice cuántas tiene.
    expect(
      screen.getByText('2 evaluaciones pendientes de revisión'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 evaluación pendiente de revisión'),
    ).toBeInTheDocument()
    // El dashboard no pide la lista: el total viene con las secciones.
    expect(pedidas).toEqual([])

    const enlace = within(aviso).getByRole('link', { name: 'Ver pendientes' })
    expect(enlace).toHaveAttribute('href', PAGINA)
    fireEvent.click(enlace)
    expect(await (await pagina()).findByText('Control 1')).toBeInTheDocument()
  })

  test('sin pendientes lo dice, sin enlace', async () => {
    await renderConSesion('PROFESOR', '/', {
      '/api/dashboard/mis-secciones': () => [seccion('s1', 'ICC101', 0)],
    })
    expect(
      await screen.findByText('No tienes evaluaciones pendientes de revisión.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Ver pendientes' }),
    ).not.toBeInTheDocument()
  })

  test('sin secciones no muestra el aviso de pendientes', async () => {
    await renderConSesion('PROFESOR', '/', {
      '/api/dashboard/mis-secciones': () => [],
    })
    expect(
      await screen.findByText(
        'No tienes secciones a tu cargo en el período activo.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/pendientes de revisión/)).not.toBeInTheDocument()
  })
})

describe('aprobar y publicar (NOT-11)', () => {
  const APROBACION = `${NOTAS}/aprobacion`

  // Abre la pendiente Control 1 con la aprobación dada; la lista quita la
  // evaluación una vez aprobada.
  async function abrirPendiente(aprobacion: (init?: RequestInit) => unknown) {
    let aprobada = false
    const posts: (RequestInit | undefined)[] = []
    await renderConSesion('PROFESOR', PAGINA, {
      [RUTA]: () => (aprobada ? PENDIENTES.slice(1) : PENDIENTES),
      [NOTAS]: () => EN_REVISION,
      [APROBACION]: async (init) => {
        posts.push(init)
        const respuesta = await aprobacion(init)
        if (!(respuesta instanceof Response) || respuesta.ok) aprobada = true
        return respuesta
      },
    })
    const vista = await pagina()
    fireEvent.click(
      await vista.findByRole('button', {
        name: 'Notas de Control 1 (ICC101, sección 1)',
      }),
    )
    await vista.findByText('Estado: En revisión')
    return { vista, posts }
  }
  const confirmacion = (vista: ReturnType<typeof within>) =>
    within(vista.getByRole('region', { name: 'Confirmar aprobación' }))

  test('pide confirmación; al publicar avisa y la evaluación sale de la lista', async () => {
    const { vista, posts } = await abrirPendiente(() => ({
      ...EN_REVISION,
      estado: 'APROBADA',
    }))

    // Cancelar no aprueba.
    fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
    expect(
      confirmacion(vista).getByText(
        '¿Aprobar y publicar las notas? Los alumnos podrán verlas y ya no se podrán editar.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      confirmacion(vista).getByRole('button', { name: 'Cancelar' }),
    )
    expect(
      vista.queryByRole('region', { name: 'Confirmar aprobación' }),
    ).not.toBeInTheDocument()
    expect(posts).toEqual([])

    fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
    fireEvent.click(
      confirmacion(vista).getByRole('button', { name: 'Publicar' }),
    )

    expect(await vista.findByRole('status')).toHaveTextContent(
      'Control 1: Notas aprobadas y publicadas.',
    )
    expect(posts.map((p) => p?.method)).toEqual(['POST'])
    await waitFor(() =>
      expect(vista.queryByText('Control 1')).not.toBeInTheDocument(),
    )
    expect(vista.getByText('Tarea 1')).toBeInTheDocument()
  })

  test('mientras publica los botones quedan bloqueados', async () => {
    let terminar!: (respuesta: unknown) => void
    const { vista } = await abrirPendiente(
      () =>
        new Promise((resolver) => {
          terminar = resolver
        }),
    )
    fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
    fireEvent.click(
      confirmacion(vista).getByRole('button', { name: 'Publicar' }),
    )

    expect(
      await confirmacion(vista).findByRole('button', { name: 'Publicando…' }),
    ).toBeDisabled()
    expect(
      confirmacion(vista).getByRole('button', { name: 'Cancelar' }),
    ).toBeDisabled()
    terminar(json({}, 500))
    expect(
      await confirmacion(vista).findByRole('button', { name: 'Publicar' }),
    ).toBeEnabled()
  })

  test.each([
    [
      'un error del servidor',
      () => json({}, 500),
      'No pudimos aprobar las notas. Inténtalo nuevamente.',
    ],
    [
      'un fallo de red',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'No pudimos aprobar las notas. Comprueba tu conexión e inténtalo nuevamente.',
    ],
  ])(
    'con %s muestra el error, se desbloquea y permite reintentar',
    async (_caso, falla, mensaje) => {
      let intentos = 0
      const { vista } = await abrirPendiente(() =>
        ++intentos === 1 ? falla() : { ...EN_REVISION, estado: 'APROBADA' },
      )
      fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
      fireEvent.click(
        confirmacion(vista).getByRole('button', { name: 'Publicar' }),
      )

      expect(await vista.findByRole('alert')).toHaveTextContent(mensaje)
      // La confirmación sigue abierta y desbloqueada: Publicar reintenta.
      const publicar = confirmacion(vista).getByRole('button', {
        name: 'Publicar',
      })
      expect(publicar).toBeEnabled()
      expect(vista.getByText('Control 1')).toBeInTheDocument()
      fireEvent.click(publicar)
      expect(await vista.findByRole('status')).toHaveTextContent(
        'Control 1: Notas aprobadas y publicadas.',
      )
      expect(intentos).toBe(2)
    },
  )

  test('un 409 de estado (ya aprobada) muestra el mensaje del servidor y recarga la lista', async () => {
    const { vista } = await abrirPendiente(() =>
      json(
        {
          statusCode: 409,
          message: 'Las notas ya fueron aprobadas',
          estado: 'APROBADA',
        },
        409,
      ),
    )
    fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
    fireEvent.click(
      confirmacion(vista).getByRole('button', { name: 'Publicar' }),
    )

    expect(await vista.findByRole('status')).toHaveTextContent(
      'Control 1: Las notas ya fueron aprobadas.',
    )
  })

  // Estos 409 dejan la evaluación en revisión: el panel sigue abierto.
  test.each([
    'Hay notas que no están propuestas en la escala de 1,0 a 7,0',
    'La evaluación no tiene notas que publicar',
  ])(
    'un 409 sin estado ("%s") deja el panel abierto, muestra el mensaje y desbloquea',
    async (mensaje) => {
      const { vista } = await abrirPendiente(() =>
        json({ statusCode: 409, message: mensaje }, 409),
      )
      fireEvent.click(vista.getByRole('button', { name: 'Aprobar y publicar' }))
      fireEvent.click(
        confirmacion(vista).getByRole('button', { name: 'Publicar' }),
      )

      expect(await vista.findByRole('alert')).toHaveTextContent(`${mensaje}.`)
      expect(vista.getByText('Estado: En revisión')).toBeInTheDocument()
      expect(
        confirmacion(vista).getByRole('button', { name: 'Publicar' }),
      ).toBeEnabled()
      expect(vista.queryByRole('status')).not.toBeInTheDocument()
    },
  )

  test('una evaluación ya aprobada no muestra el botón', async () => {
    await renderConSesion('PROFESOR', PAGINA, {
      [RUTA]: () => PENDIENTES,
      [NOTAS]: () => ({ ...EN_REVISION, estado: 'APROBADA' }),
    })
    const vista = await pagina()
    fireEvent.click(
      await vista.findByRole('button', {
        name: 'Notas de Control 1 (ICC101, sección 1)',
      }),
    )
    await vista.findByText('Estado: Aprobada')
    expect(
      vista.queryByRole('button', { name: 'Aprobar y publicar' }),
    ).not.toBeInTheDocument()
  })
})

describe('devolver al ayudante (NOT-12)', () => {
  const DEVOLUCION = `${NOTAS}/devolucion`

  // Abre la pendiente Control 1 con la devolución dada; la lista quita la
  // evaluación una vez devuelta.
  async function abrirPendiente(devolucion: (init?: RequestInit) => unknown) {
    let devuelta = false
    const posts: (RequestInit | undefined)[] = []
    await renderConSesion('PROFESOR', PAGINA, {
      [RUTA]: () => (devuelta ? PENDIENTES.slice(1) : PENDIENTES),
      [NOTAS]: () => EN_REVISION,
      [DEVOLUCION]: async (init) => {
        posts.push(init)
        const respuesta = await devolucion(init)
        if (!(respuesta instanceof Response) || respuesta.ok) devuelta = true
        return respuesta
      },
    })
    const vista = await pagina()
    fireEvent.click(
      await vista.findByRole('button', {
        name: 'Notas de Control 1 (ICC101, sección 1)',
      }),
    )
    await vista.findByText('Estado: En revisión')
    fireEvent.click(vista.getByRole('button', { name: 'Devolver' }))
    return { vista, posts }
  }
  const formulario = (vista: ReturnType<typeof within>) =>
    within(vista.getByRole('region', { name: 'Devolver al ayudante' }))
  const comentar = (vista: ReturnType<typeof within>, texto: string) =>
    fireEvent.change(
      formulario(vista).getByLabelText(
        'Comentario para el ayudante (obligatorio)',
      ),
      { target: { value: texto } },
    )
  const confirmar = (vista: ReturnType<typeof within>) =>
    formulario(vista).getByRole('button', { name: 'Confirmar devolución' })

  test('el comentario es obligatorio, con contador, y cancelar no devuelve', async () => {
    const { vista, posts } = await abrirPendiente(() => ({
      ...EN_REVISION,
      estado: 'DEVUELTA',
    }))

    expect(formulario(vista).getByText('0/500 caracteres')).toBeInTheDocument()
    expect(confirmar(vista)).toBeDisabled()
    comentar(vista, '   ')
    expect(confirmar(vista)).toBeDisabled()
    comentar(vista, 'Revisa')
    expect(formulario(vista).getByText('6/500 caracteres')).toBeInTheDocument()
    expect(confirmar(vista)).toBeEnabled()

    fireEvent.click(formulario(vista).getByRole('button', { name: 'Cancelar' }))
    expect(
      vista.queryByRole('region', { name: 'Devolver al ayudante' }),
    ).not.toBeInTheDocument()
    expect(posts).toEqual([])
  })

  test('al confirmar envía el comentario sin espacios, avisa y la evaluación sale de la lista', async () => {
    const { vista, posts } = await abrirPendiente(() => ({
      ...EN_REVISION,
      estado: 'DEVUELTA',
    }))
    comentar(vista, '  Revisa la pregunta 3  ')
    fireEvent.click(confirmar(vista))

    expect(await vista.findByRole('status')).toHaveTextContent(
      'Control 1: Notas devueltas al ayudante.',
    )
    expect(posts.map((p) => [p?.method, p?.body])).toEqual([
      ['POST', JSON.stringify({ comentario: 'Revisa la pregunta 3' })],
    ])
    await waitFor(() =>
      expect(vista.queryByText('Control 1')).not.toBeInTheDocument(),
    )
  })

  test('mientras devuelve todo queda bloqueado y un error lo desbloquea', async () => {
    let terminar!: (respuesta: unknown) => void
    const { vista } = await abrirPendiente(
      () =>
        new Promise((resolver) => {
          terminar = resolver
        }),
    )
    comentar(vista, 'Revisa')
    fireEvent.click(confirmar(vista))

    expect(
      await formulario(vista).findByRole('button', { name: 'Devolviendo…' }),
    ).toBeDisabled()
    expect(
      formulario(vista).getByLabelText(
        'Comentario para el ayudante (obligatorio)',
      ),
    ).toBeDisabled()
    expect(
      formulario(vista).getByRole('button', { name: 'Cancelar' }),
    ).toBeDisabled()
    expect(
      vista.getByRole('button', { name: 'Aprobar y publicar' }),
    ).toBeDisabled()

    terminar(json({}, 500))
    expect(await vista.findByRole('alert')).toHaveTextContent(
      'No pudimos devolver las notas. Inténtalo nuevamente.',
    )
    expect(confirmar(vista)).toBeEnabled()
    // El comentario escrito se conserva para reintentar.
    expect(
      formulario(vista).getByLabelText(
        'Comentario para el ayudante (obligatorio)',
      ),
    ).toHaveValue('Revisa')
  })

  test('un fallo de red muestra el error y desbloquea', async () => {
    const { vista } = await abrirPendiente(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    )
    comentar(vista, 'Revisa')
    fireEvent.click(confirmar(vista))

    expect(await vista.findByRole('alert')).toHaveTextContent(
      'No pudimos devolver las notas. Comprueba tu conexión e inténtalo nuevamente.',
    )
    expect(confirmar(vista)).toBeEnabled()
  })

  test('un 400 muestra el primer mensaje de la validación', async () => {
    const { vista } = await abrirPendiente(() =>
      json(
        {
          statusCode: 400,
          message: ['El comentario contiene caracteres no permitidos'],
        },
        400,
      ),
    )
    comentar(vista, 'Revisa')
    fireEvent.click(confirmar(vista))

    expect(await vista.findByRole('alert')).toHaveTextContent(
      'El comentario contiene caracteres no permitidos.',
    )
    expect(confirmar(vista)).toBeEnabled()
  })

  test('un 409 de estado (ya aprobada) cierra el panel y recarga la lista', async () => {
    const { vista } = await abrirPendiente(() =>
      json(
        {
          statusCode: 409,
          message: 'Las notas ya fueron aprobadas',
          estado: 'APROBADA',
        },
        409,
      ),
    )
    comentar(vista, 'Revisa')
    fireEvent.click(confirmar(vista))

    expect(await vista.findByRole('status')).toHaveTextContent(
      'Control 1: Las notas ya fueron aprobadas.',
    )
    expect(
      vista.queryByRole('region', { name: 'Devolver al ayudante' }),
    ).not.toBeInTheDocument()
  })

  test('un 409 sin estado deja el panel abierto, muestra el mensaje y desbloquea', async () => {
    const { vista } = await abrirPendiente(() =>
      json({ statusCode: 409, message: 'No se pudo devolver ahora' }, 409),
    )
    comentar(vista, 'Revisa')
    fireEvent.click(confirmar(vista))

    expect(await vista.findByRole('alert')).toHaveTextContent(
      'No se pudo devolver ahora.',
    )
    expect(vista.getByText('Estado: En revisión')).toBeInTheDocument()
    expect(confirmar(vista)).toBeEnabled()
    expect(vista.queryByRole('status')).not.toBeInTheDocument()
  })
})
