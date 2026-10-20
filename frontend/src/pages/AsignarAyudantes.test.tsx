import type { AyudanteOpcion, CursoDetalle } from '@cursus/shared'
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
      profesor: null,
      profesorId: null,
      ayudantes: ['Ya Asignado'],
      alumnos: 0,
    },
  ],
}
const OPCIONES: AyudanteOpcion[] = [
  {
    id: 'ayudante-1',
    nombre: 'Ana Pérez',
    correo: 'ana@norte.cursus.test',
    asignado: false,
  },
  {
    id: 'ayudante-2',
    nombre: 'Luis Soto',
    correo: 'luis@norte.cursus.test',
    asignado: false,
  },
  {
    id: 'ayudante-3',
    nombre: 'Ya Asignado',
    correo: 'ya@norte.cursus.test',
    asignado: true,
  },
]
const RUTA = '/api/secciones/seccion-1/ayudantes'

async function abrir(
  responder: (init?: RequestInit) => unknown = () => OPCIONES,
) {
  await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
    '/api/cursos/curso-1': () => CURSO,
    [RUTA]: responder,
  })
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Asignar ayudantes a la sección 1',
    }),
  )
  return screen.findByRole('dialog', {
    name: 'Asignar ayudantes a la sección 1',
  })
}

describe('GES-13: asignar ayudantes', () => {
  test('selecciona varios, conserva los anteriores y actualiza el detalle al guardar', async () => {
    const responder = vi.fn((init?: RequestInit) =>
      init?.method === 'POST'
        ? OPCIONES.map(({ id, nombre, correo }) => ({ id, nombre, correo }))
        : OPCIONES,
    )
    const dialogo = await abrir(responder)
    const ana = await within(dialogo).findByRole('checkbox', {
      name: /Ana Pérez/,
    })
    const luis = within(dialogo).getByRole('checkbox', { name: /Luis Soto/ })
    expect(
      within(dialogo).getByRole('checkbox', { name: /Ya Asignado/ }),
    ).toBeChecked()
    expect(
      within(dialogo).getByRole('checkbox', { name: /Ya Asignado/ }),
    ).toBeDisabled()
    const guardar = within(dialogo).getByRole('button', {
      name: 'Asignar ayudantes',
    })
    expect(guardar).toBeDisabled()
    fireEvent.click(ana)
    fireEvent.click(luis)
    fireEvent.click(guardar)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ayudantes asignados a la sección 1.',
    )
    expect(screen.getByRole('table', { name: 'Secciones' })).toHaveTextContent(
      'Ana Pérez, Luis Soto, Ya Asignado',
    )
    expect(
      screen.getByRole('link', {
        name: 'Ver los 0 alumnos de la sección 1',
      }),
    ).toHaveAttribute('href', '/secciones/seccion-1/alumnos')
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ayudanteIds: ['ayudante-1', 'ayudante-2'] }),
      }),
      RUTA,
    )
  })

  test('cancelar descarta la selección sin guardar ni cambiar los asignados', async () => {
    const responder = vi.fn(() => OPCIONES)
    const dialogo = await abrir(responder)
    fireEvent.click(
      await within(dialogo).findByRole('checkbox', { name: /Ana Pérez/ }),
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(responder).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('table')).toHaveTextContent('Ya Asignado')
    expect(screen.getByRole('table')).not.toHaveTextContent('Ana Pérez')
  })

  test('un error al guardar mantiene la selección y permite reintentar', async () => {
    const responder = vi.fn((init?: RequestInit) =>
      init?.method === 'POST' ? json({}, 500) : OPCIONES,
    )
    const dialogo = await abrir(responder)
    const ana = await within(dialogo).findByRole('checkbox', {
      name: /Ana Pérez/,
    })
    fireEvent.click(ana)
    fireEvent.click(
      within(dialogo).getByRole('button', {
        name: 'Asignar ayudantes',
      }),
    )
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'No se pudieron asignar los ayudantes.',
    )
    expect(ana).toBeChecked()
    expect(
      within(dialogo).getByRole('button', {
        name: 'Asignar ayudantes',
      }),
    ).toBeEnabled()
    expect(screen.getByRole('table')).not.toHaveTextContent('Ana Pérez')
  })

  test('puede recargar las opciones después de un error de carga', async () => {
    const responder = vi
      .fn()
      .mockReturnValueOnce(json({}, 500))
      .mockReturnValue(OPCIONES)
    const dialogo = await abrir(responder)
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los ayudantes.',
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reintentar' }))
    expect(
      await within(dialogo).findByRole('checkbox', { name: /Ana Pérez/ }),
    ).toBeInTheDocument()
  })

  test('sin opciones informa el estado vacío y no permite guardar', async () => {
    const dialogo = await abrir(() => [])
    expect(
      await within(dialogo).findByText(
        'No hay ayudantes disponibles en tu universidad.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByRole('button', {
        name: 'Asignar ayudantes',
      }),
    ).toBeDisabled()
  })
})
