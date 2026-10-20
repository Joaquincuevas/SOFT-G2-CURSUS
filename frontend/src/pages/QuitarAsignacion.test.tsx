import type {
  AsignacionQuitada,
  AyudanteOpcion,
  AyudanteQuitado,
  CursoDetalle,
  ProfesorCambiado,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const CURSO: CursoDetalle = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraNombre: 'Informática',
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  secciones: [
    {
      id: 'seccion-1',
      numero: 1,
      horario: null,
      profesor: 'Ana Profesora',
      profesorId: 'profesor-1',
      ayudantes: ['Luis Soto', 'Marta Díaz'],
      alumnos: 0,
    },
    {
      id: 'seccion-2',
      numero: 2,
      horario: null,
      profesor: null,
      profesorId: null,
      ayudantes: [],
      alumnos: 0,
    },
  ],
}
const OPCIONES: AyudanteOpcion[] = [
  {
    id: 'ayudante-1',
    nombre: 'Luis Soto',
    correo: 'luis@norte.cursus.test',
    asignado: true,
  },
  {
    id: 'ayudante-2',
    nombre: 'Marta Díaz',
    correo: 'marta@norte.cursus.test',
    asignado: true,
  },
  {
    id: 'ayudante-3',
    nombre: 'Sin Asignar',
    correo: 'sin@norte.cursus.test',
    asignado: false,
  },
]
const QUITADA = {
  quitadoEn: '2026-10-20T12:00:00.000Z',
  quitadoPor: { id: 'admin', nombre: 'Administrativo' },
  motivo: 'Asignación equivocada',
}
const RUTA_PROFESOR = '/api/secciones/seccion-1/profesor/quitar'
const RUTA_AYUDANTE = '/api/secciones/seccion-1/ayudantes/ayudante-1/quitar'

async function abrir(
  boton: string,
  rutas: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
    '/api/cursos/curso-1': () => CURSO,
    '/api/secciones/seccion-1/ayudantes': () => OPCIONES,
    ...rutas,
  })
  fireEvent.click(await screen.findByRole('button', { name: boton }))
  return screen.findByRole('dialog', { name: boton })
}

const escribirMotivo = (dialogo: HTMLElement, motivo: string) =>
  fireEvent.change(within(dialogo).getByLabelText('Motivo'), {
    target: { value: motivo },
  })

const filaDe = (numero: number) =>
  within(screen.getByRole('table', { name: 'Secciones' })).getAllByRole('row')[
    numero
  ]

describe('GES-14: quitar al profesor', () => {
  test('pide confirmación y motivo, y la sección queda sin asignar', async () => {
    const responder = vi.fn((): AsignacionQuitada => ({
      ...QUITADA,
      quitado: { id: 'profesor-1', nombre: 'Ana Profesora' },
    }))
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: responder,
    })

    expect(dialogo).toHaveAccessibleDescription(/Ana Profesora/)
    const quitar = within(dialogo).getByRole('button', { name: 'Quitar' })
    expect(quitar).toBeDisabled()
    escribirMotivo(dialogo, '   ')
    expect(quitar).toBeDisabled()
    escribirMotivo(dialogo, 'Asignación equivocada')
    fireEvent.click(quitar)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          motivo: 'Asignación equivocada',
          profesorId: 'profesor-1',
        }),
      }),
      RUTA_PROFESOR,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ana Profesora ya no es el profesor de la sección 1.',
    )
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Sin asignar',
    )
    expect(
      screen.queryByRole('button', { name: 'Quitar profesor de la sección 1' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Asignar profesor de la sección 1' }),
    ).toBeInTheDocument()
  })

  test('cancelar no quita nada', async () => {
    const responder = vi.fn()
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: responder,
    })
    escribirMotivo(dialogo, 'Error')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(responder).not.toHaveBeenCalled()
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Ana Profesora',
    )
  })

  test('si falla, muestra el mensaje en el diálogo y la tabla no cambia', async () => {
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: () =>
        json(
          {
            statusCode: 404,
            message: 'La sección no tiene profesor asignado',
          },
          404,
        ),
    })
    escribirMotivo(dialogo, 'Error')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'La sección no tiene profesor asignado',
    )
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Ana Profesora',
    )
  })

  test('si otro cambió al profesor, muestra al nuevo y pide confirmar de nuevo', async () => {
    const enviados: unknown[] = []
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: (init) => {
        enviados.push(JSON.parse(String(init?.body)))
        if (enviados.length === 1) {
          return json(
            {
              statusCode: 409,
              message:
                'Bruno Pérez es ahora el profesor de la sección. Revisa y confirma de nuevo.',
              profesor: { id: 'profesor-2', nombre: 'Bruno Pérez' },
            } satisfies ProfesorCambiado,
            409,
          )
        }
        return {
          ...QUITADA,
          quitado: { id: 'profesor-2', nombre: 'Bruno Pérez' },
        } satisfies AsignacionQuitada
      },
    })
    escribirMotivo(dialogo, 'Error')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))

    // No se quitó a nadie: el diálogo sigue abierto con el profesor actual,
    // en la tabla también, y conserva el motivo.
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Bruno Pérez es ahora el profesor de la sección.',
    )
    expect(dialogo).toHaveAccessibleDescription(/Bruno Pérez/)
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Bruno Pérez',
    )
    expect(within(dialogo).getByLabelText('Motivo')).toHaveValue('Error')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(enviados).toEqual([
      { motivo: 'Error', profesorId: 'profesor-1' },
      { motivo: 'Error', profesorId: 'profesor-2' },
    ])
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Sin asignar',
    )
  })

  test('si la sección ya no tiene profesor, cierra el diálogo y lo avisa', async () => {
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: () =>
        json(
          {
            statusCode: 409,
            message: 'La sección ya no tiene profesor asignado.',
            profesor: null,
          } satisfies ProfesorCambiado,
          409,
        ),
    })
    escribirMotivo(dialogo, 'Error')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La sección ya no tiene profesor asignado.',
    )
    expect(within(filaDe(1)).getAllByRole('cell')[2]).toHaveTextContent(
      'Sin asignar',
    )
  })

  test('mientras se quita, el diálogo no se puede cerrar', async () => {
    let responder: (respuesta: Response) => void = () => {}
    const dialogo = await abrir('Quitar profesor de la sección 1', {
      [RUTA_PROFESOR]: () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    })
    escribirMotivo(dialogo, 'Error')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }))

    const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' })
    await waitFor(() => expect(cancelar).toBeDisabled())
    expect(
      dialogo.dispatchEvent(new Event('cancel', { cancelable: true })),
    ).toBe(false)

    responder(
      json({ ...QUITADA, quitado: { id: 'profesor-1', nombre: 'Ana' } }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})

describe('GES-14: quitar un ayudante', () => {
  test('elige entre los asignados, exige motivo y actualiza la sección', async () => {
    const responder = vi.fn((): AyudanteQuitado => ({
      ...QUITADA,
      quitado: { id: 'ayudante-1', nombre: 'Luis Soto' },
      ayudantes: [
        {
          id: 'ayudante-2',
          nombre: 'Marta Díaz',
          correo: 'marta@norte.cursus.test',
        },
      ],
    }))
    const dialogo = await abrir('Quitar ayudante de la sección 1', {
      [RUTA_AYUDANTE]: responder,
    })

    // Solo los asignados.
    const luis = await within(dialogo).findByRole('radio', {
      name: /Luis Soto/,
    })
    expect(within(dialogo).getByRole('radio', { name: /Marta Díaz/ })).toBe(
      within(dialogo).getAllByRole('radio')[1],
    )
    expect(within(dialogo).getAllByRole('radio')).toHaveLength(2)
    const quitar = within(dialogo).getByRole('button', { name: 'Quitar' })
    escribirMotivo(dialogo, 'No corresponde')
    expect(quitar).toBeDisabled()
    fireEvent.click(luis)
    fireEvent.click(quitar)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ motivo: 'No corresponde' }),
      }),
      RUTA_AYUDANTE,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Luis Soto ya no es ayudante de la sección 1.',
    )
    expect(within(filaDe(1)).getAllByRole('cell')[3]).toHaveTextContent(
      /^Marta Díaz$/,
    )
  })

  test('si no se pueden cargar los ayudantes, ofrece reintentar', async () => {
    const dialogo = await abrir('Quitar ayudante de la sección 1', {
      '/api/secciones/seccion-1/ayudantes': () => json({}, 500),
    })

    expect(
      await within(dialogo).findByText('No se pudieron cargar los ayudantes.'),
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByRole('button', { name: 'Quitar' }),
    ).toBeDisabled()
  })
})

describe('GES-14: botones para quitar', () => {
  test('solo aparecen en secciones con profesor o ayudantes', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => CURSO,
    })
    await screen.findByRole('button', {
      name: 'Quitar profesor de la sección 1',
    })
    expect(
      screen.getByRole('button', { name: 'Quitar ayudante de la sección 1' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Quitar profesor de la sección 2' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Quitar ayudante de la sección 2' }),
    ).not.toBeInTheDocument()
  })

  test('el Director no los ve', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => CURSO,
    })
    await screen.findByRole('table', { name: 'Secciones' })
    expect(
      screen.queryByRole('button', { name: /Quitar/ }),
    ).not.toBeInTheDocument()
  })
})
