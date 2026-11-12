import type { PersonaIntegrante, RolIntegrante } from '@cursus/shared'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'
const BASE = '/api/secciones/s1/integrantes'
const SECCION = {
  id: 's1',
  numero: 1,
  curso: { id: 'c1', codigo: 'ICC101', nombre: 'Programación' },
}
const NOMBRES = {
  PROFESOR: 'Profesores',
  AYUDANTE: 'Ayudantes',
  ALUMNO: 'Alumnos',
}
const persona = (rol: RolIntegrante, id = 'p1'): PersonaIntegrante => ({
  id,
  nombre: `Persona ${id}`,
  correo: `${id}@norte.cursus.test`,
  rol,
})
async function abrir(
  rol: RolIntegrante = 'PROFESOR',
  rutas: Record<string, RutaSimulada> = {},
  iniciales: PersonaIntegrante[] = [],
) {
  await renderConSesion(
    'ADMINISTRATIVO',
    `/secciones/s1/integrantes?rol=${rol}`,
    { [BASE]: () => ({ seccion: SECCION, integrantes: iniciales }), ...rutas },
  )
  await screen.findByRole('heading', { name: 'Integrantes · Sección 1' })
}
function buscar(texto = 'Persona') {
  fireEvent.change(screen.getByLabelText('Buscar por correo o nombre'), {
    target: { value: texto },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
}
test.each<RolIntegrante>(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s usa el mismo buscador y agrega sin afectar otros roles',
  async (rol) => {
    const elegida = persona(rol),
      existentes = [persona('PROFESOR', 'otro')]
    const posts: unknown[] = []
    await abrir(
      rol,
      {
        [BASE]: (init) => {
          if (init?.method === 'POST') {
            posts.push(JSON.parse(init.body as string))
            existentes.push(elegida)
            return new Response(null, { status: 204 })
          }
          return { seccion: SECCION, integrantes: existentes }
        },
        [`${BASE}/buscar`]: (_init, url) => {
          expect(new URL(url!, 'http://test').searchParams.get('rol')).toBe(rol)
          return { personas: [elegida], hayMas: false }
        },
      },
      existentes,
    )
    buscar()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar a Persona p1' }),
    )
    expect(
      await screen.findByText('Persona p1 agregado a la sección.'),
    ).toBeInTheDocument()
    expect(posts).toEqual([{ rol, usuarioId: 'p1' }])
    expect(
      within(screen.getByRole('table', { name: NOMBRES[rol] })).getByText(
        elegida.correo,
      ),
    ).toBeInTheDocument()
    expect(existentes.some((p) => p.id === 'otro')).toBe(true)
  },
)
test.each<RolIntegrante>(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
  '%s se quita con motivo; cancelar no modifica nada',
  async (rol) => {
    const p = persona(rol)
    const enviados: unknown[] = []
    let lista = [p]
    await abrir(
      rol,
      {
        [BASE]: () => ({ seccion: SECCION, integrantes: lista }),
        [`${BASE}/p1/quitar`]: (init) => {
          enviados.push(JSON.parse(init!.body as string))
          lista = []
          return new Response(null, { status: 204 })
        },
      },
      lista,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Persona p1' }))
    let modal = within(
      screen.getByRole('dialog', { name: 'Quitar integrante' }),
    )
    expect(modal.getByRole('button', { name: 'Quitar' })).toBeDisabled()
    fireEvent.click(modal.getByRole('button', { name: 'Cancelar' }))
    expect(enviados).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Persona p1' }))
    modal = within(screen.getByRole('dialog', { name: 'Quitar integrante' }))
    fireEvent.change(modal.getByLabelText('Motivo'), {
      target: { value: '  Sección equivocada  ' },
    })
    fireEvent.click(modal.getByRole('button', { name: 'Quitar' }))
    expect(
      await screen.findByText('Persona p1 fue quitado de la sección.'),
    ).toBeInTheDocument()
    expect(enviados).toEqual([{ rol, motivo: 'Sección equivocada' }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
)
test('un cambio de rol descarta una búsqueda pendiente y evita agregar su resultado obsoleto', async () => {
  let completar!: (valor: unknown) => void
  const pendiente = new Promise((resolve) => {
    completar = resolve
  })
  await abrir('PROFESOR', { [`${BASE}/buscar`]: () => pendiente })
  buscar()
  await screen.findByText('Buscando personas…')
  fireEvent.click(screen.getByRole('button', { name: 'Alumnos (0)' }))
  await act(() => {
    completar({ personas: [persona('PROFESOR')], hayMas: false })
  })
  expect(
    screen.queryByRole('button', { name: 'Agregar a Persona p1' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Buscar por correo o nombre')).toHaveValue('')
})
test('una búsqueda fallida permite reintentar; sin coincidencias ofrece crear alumno o CSV', async () => {
  let intentos = 0
  await abrir('ALUMNO', {
    [`${BASE}/buscar`]: () =>
      ++intentos === 1 ? json({}, 500) : { personas: [], hayMas: false },
  })
  buscar('nuevo@norte.cursus.test')
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(
    await screen.findByText(
      'No hay personas disponibles que coincidan con la búsqueda.',
    ),
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Crear alumno e inscribir' }),
  )
  expect(screen.getByLabelText('Correo institucional')).toHaveValue(
    'nuevo@norte.cursus.test',
  )
})
test('un conflicto de alta se muestra y refresca las asignaciones', async () => {
  let lecturas = 0
  await abrir('PROFESOR', {
    [BASE]: (init) =>
      init?.method === 'POST'
        ? json({ message: 'Ya asignado' }, 409)
        : (++lecturas, { seccion: SECCION, integrantes: [] }),
    [`${BASE}/buscar`]: () => ({
      personas: [persona('PROFESOR')],
      hayMas: false,
    }),
  })
  buscar()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Agregar a Persona p1' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya asignado')
  await waitFor(() => expect(lecturas).toBeGreaterThan(1))
})
test('durante el retiro se bloquean motivo, cierre y cambio de rol; un fallo permite reintentar', async () => {
  let completar!: (r: Response) => void
  const pendiente = new Promise<Response>((resolve) => {
    completar = resolve
  })
  await abrir('ALUMNO', { [`${BASE}/p1/quitar`]: () => pendiente }, [
    persona('ALUMNO'),
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Quitar a Persona p1' }))
  const dialogo = screen.getByRole('dialog')
  const modal = within(dialogo)
  fireEvent.change(modal.getByLabelText('Motivo'), {
    target: { value: 'Motivo' },
  })
  fireEvent.click(modal.getByRole('button', { name: 'Quitar' }))
  expect(modal.getByLabelText('Motivo')).toBeDisabled()
  expect(modal.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Profesores (0)' })).toBeDisabled()
  const cancelar = new Event('cancel', { cancelable: true })
  fireEvent(dialogo, cancelar)
  expect(cancelar.defaultPrevented).toBe(true)
  await act(() => completar(json({}, 500)))
  expect(await modal.findByRole('alert')).toHaveTextContent('No se pudo quitar')
  expect(modal.getByRole('button', { name: 'Quitar' })).toBeEnabled()
})
test('crear un alumno conserva la contraseña provisoria y desaparece al cerrar', async () => {
  let creado = false
  await abrir('ALUMNO', {
    '/api/secciones/s1/alumnos': (init) => {
      const datos = JSON.parse(init!.body as string) as { nombre?: string }
      if (!datos.nombre)
        return json({ message: 'Ingresa el nombre del alumno' }, 400)
      creado = true
      return {
        alumno: {
          id: 'a1',
          nombre: datos.nombre,
          correo: 'nueva@norte.cursus.test',
        },
        cuentaCreada: true,
        passwordProvisoria: 'temporal-solo-test',
      }
    },
    [BASE]: () => ({
      seccion: SECCION,
      integrantes: creado
        ? [{ ...persona('ALUMNO', 'a1'), nombre: 'Nueva' }]
        : [],
    }),
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Crear alumno e inscribir' }),
  )
  const modal = within(screen.getByRole('dialog'))
  fireEvent.change(modal.getByLabelText('Correo institucional'), {
    target: { value: 'nueva@norte.cursus.test' },
  })
  fireEvent.click(modal.getByRole('button', { name: 'Agregar' }))
  fireEvent.change(await modal.findByLabelText('Nombre'), {
    target: { value: 'Nueva' },
  })
  fireEvent.click(modal.getByRole('button', { name: 'Agregar' }))
  expect(await modal.findByText('temporal-solo-test')).toBeInTheDocument()
  fireEvent.click(modal.getByRole('button', { name: 'Cerrar' }))
  expect(screen.queryByText('temporal-solo-test')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Alumnos (1)' }),
  ).toBeInTheDocument()
})
test('el detalle del curso reemplaza los accesos dispersos por Integrantes', async () => {
  await renderConSesion('ADMINISTRATIVO', '/cursos/c1', {
    '/api/cursos/c1': () => ({
      id: 'c1',
      codigo: 'ICC101',
      nombre: 'Programación',
      carreraNombre: 'Ingeniería',
      periodo: { id: 'p', anio: 2026, semestre: 2 },
      secciones: [
        {
          id: 's1',
          numero: 1,
          horario: null,
          profesor: null,
          profesores: [],
          ayudantes: [],
          alumnos: 2,
        },
      ],
    }),
  })
  expect(
    await screen.findByRole('link', { name: 'Integrantes de la sección 1' }),
  ).toHaveAttribute('href', '/secciones/s1/integrantes')
  expect(
    screen.getByRole('link', { name: 'Ver los 2 alumnos de la sección 1' }),
  ).toHaveAttribute('href', '/secciones/s1/integrantes?rol=ALUMNO')
  expect(
    screen.queryByRole('button', {
      name: /Agregar alumno|Asignar ayudantes|Quitar ayudante/,
    }),
  ).not.toBeInTheDocument()
})
