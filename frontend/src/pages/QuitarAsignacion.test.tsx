import type {
  AyudanteOpcion,
  AyudanteQuitado,
  CursoDetalle,
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
      profesores: ['Ana Profesora'],
      profesorId: 'profesor-1',
      ayudantes: ['Luis Soto', 'Marta Díaz'],
      alumnos: 0,
    },
    {
      id: 'seccion-2',
      numero: 2,
      horario: null,
      profesor: null,
      profesores: [],
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
  test('quitar ayudante solo aparece en secciones con ayudantes', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => CURSO,
    })
    expect(
      await screen.findByRole('button', {
        name: 'Quitar ayudante de la sección 1',
      }),
    ).toBeInTheDocument()
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
