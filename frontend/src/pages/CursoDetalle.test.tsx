import type { CursoDetalle, CursoListado } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }
const SECCION = {
  horario: null,
  profesor: null,
  ayudantes: [],
  alumnos: 0,
}

const CURSO: CursoDetalle = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
  carreraNombre: 'Ingeniería Civil en Informática',
  periodo: PERIODO,
  secciones: [
    { id: 'seccion-1', numero: 1, ...SECCION },
    { id: 'seccion-2', numero: 2, ...SECCION },
  ],
}

const ruta = (respuesta: RutaSimulada): Record<string, RutaSimulada> => ({
  '/api/cursos/curso-1': respuesta,
})

const filasDe = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) =>
      within(fila)
        .getAllByRole('cell')
        .map((celda) => celda.textContent),
    )

describe('detalle de un curso', () => {
  test('muestra los datos del curso y sus secciones', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => CURSO),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'ICC101 · Introducción a la Programación',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Ingeniería Civil en Informática · Período 2026-2'),
    ).toBeInTheDocument()
    const tabla = screen.getByRole('table', { name: 'Secciones' })
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Sección',
      'Horario',
      'Profesor',
      'Ayudantes',
      'Alumnos',
      'Acciones',
    ])
    // Lo que todavía no se asigna aparece como "Sin asignar".
    expect(filasDe(tabla)).toEqual([
      [
        '1',
        'Sin asignar',
        'Sin asignar',
        'Sin asignar',
        '0',
        'Agregar alumnoCargar CSV',
      ],
      [
        '2',
        'Sin asignar',
        'Sin asignar',
        'Sin asignar',
        '0',
        'Agregar alumnoCargar CSV',
      ],
    ])
  })

  test('Editar curso enlaza al formulario de edición', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => CURSO),
    )

    const editar = await screen.findByRole('link', { name: 'Editar curso' })
    expect(editar).toHaveAttribute('href', '/cursos/curso-1/editar')
    const crear = screen.getByRole('button', { name: 'Crear sección' })
    expect(crear).not.toHaveAttribute('aria-disabled')
    expect(crear).not.toHaveAttribute('title')
  })

  test('el Director ve el detalle sin acciones y con la universidad', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/cursos/curso-1',
      ruta(() => ({ ...CURSO, universidadNombre: 'Universidad Demo Sur' })),
    )

    expect(
      await screen.findByText(
        'Universidad Demo Sur · Ingeniería Civil en Informática · Período 2026-2',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar curso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crear sección' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Agregar alumno/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  })

  test('sin secciones muestra el estado vacío', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => ({ ...CURSO, secciones: [] })),
    )

    expect(
      await screen.findByText('Este curso aún no tiene secciones.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('un curso que no existe muestra el 404 con vuelta al listado', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => json({ statusCode: 404, message: 'El curso no existe' }, 404)),
    )

    expect(
      await screen.findByRole('heading', { name: 'Curso no encontrado' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Volver a cursos' }),
    ).toHaveAttribute('href', '/cursos')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  test('si falla, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => (fallar ? new Response(null, { status: 500 }) : CURSO)),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el curso.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('table', { name: 'Secciones' }),
    ).toBeInTheDocument()
  })
})

describe('crear una sección (GES-09)', () => {
  const NUEVA = { id: 'seccion-3', numero: 3, ...SECCION }
  const conCreacion = (crear: RutaSimulada) => ({
    ...ruta(() => CURSO),
    '/api/cursos/curso-1/secciones': crear,
  })

  test('crea la sección y la agrega a la tabla con un aviso', async () => {
    let pedidosDelCurso = 0
    let metodo: string | undefined
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => {
        pedidosDelCurso++
        return CURSO
      },
      '/api/cursos/curso-1/secciones': (init) => {
        metodo = init?.method
        return json(NUEVA, 201)
      },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear sección' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sección 3 creada.',
    )
    expect(
      filasDe(screen.getByRole('table', { name: 'Secciones' })).map(
        ([numero]) => numero,
      ),
    ).toEqual(['1', '2', '3'])
    expect(metodo).toBe('POST')
    // Sin volver a pedir el curso.
    expect(pedidosDelCurso).toBe(1)
  })

  test('el botón se deshabilita mientras se crea', async () => {
    let responder: (respuesta: Response) => void = () => {}
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      conCreacion(
        () =>
          new Promise<Response>((resolve) => {
            responder = resolve
          }),
      ),
    )

    const boton = await screen.findByRole('button', { name: 'Crear sección' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toBeDisabled())
    responder(json(NUEVA, 201))
    await waitFor(() => expect(boton).toBeEnabled())
  })

  test('si falla, muestra un error y no agrega nada', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      conCreacion(() => new Response(null, { status: 500 })),
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear sección' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la sección.',
    )
    expect(
      filasDe(screen.getByRole('table', { name: 'Secciones' })),
    ).toHaveLength(2)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('agregar un alumno (GES-15)', () => {
  const RUTA_ALUMNOS = '/api/secciones/seccion-1/alumnos'
  const EXISTENTE = {
    alumno: {
      id: 'alumno-1',
      nombre: 'Alumno Norte',
      correo: 'alumno@norte.cursus.test',
    },
    cuentaCreada: false,
  }
  const alumnosDeLaSeccion1 = () =>
    filasDe(screen.getByRole('table', { name: 'Secciones' }))[0][4]

  async function abrirDialogo(alumnos: RutaSimulada) {
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      ...ruta(() => CURSO),
      [RUTA_ALUMNOS]: alumnos,
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Agregar alumno a la sección 1',
      }),
    )
    return screen.getByRole('dialog', {
      name: 'Agregar alumno a la sección 1',
    })
  }

  const enviar = (dialogo: HTMLElement, campos: Record<string, string>) => {
    for (const [nombre, valor] of Object.entries(campos)) {
      fireEvent.change(within(dialogo).getByLabelText(nombre), {
        target: { value: valor },
      })
    }
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))
  }

  test('vincula a un alumno con cuenta y sube el conteo sin recargar', async () => {
    let cuerpo: unknown
    const dialogo = await abrirDialogo((init) => {
      cuerpo = JSON.parse(String(init?.body))
      return json(EXISTENTE, 201)
    })
    // El nombre no se pide de entrada.
    expect(within(dialogo).queryByLabelText('Nombre')).toBeNull()

    enviar(dialogo, { 'Correo institucional': 'alumno@norte.cursus.test' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Alumno Norte agregado a la sección 1.',
    )
    expect(cuerpo).toEqual({ correo: 'alumno@norte.cursus.test' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(alumnosDeLaSeccion1()).toBe('1')
  })

  test('pide el nombre si hay que crear la cuenta y muestra la contraseña una sola vez', async () => {
    const escribir = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: escribir },
    })
    const cuerpos: unknown[] = []
    const dialogo = await abrirDialogo((init) => {
      const cuerpo = JSON.parse(String(init?.body)) as { nombre?: string }
      cuerpos.push(cuerpo)
      return cuerpo.nombre
        ? json(
            {
              alumno: {
                id: 'alumno-2',
                nombre: 'Ana Pérez',
                correo: 'ana@norte.cursus.test',
              },
              cuentaCreada: true,
              passwordProvisoria: 'ABCD2345EFGH6789',
            },
            201,
          )
        : json(
            { statusCode: 400, message: 'Ingresa el nombre del alumno' },
            400,
          )
    })

    enviar(dialogo, { 'Correo institucional': 'ana@norte.cursus.test' })
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Ingresa el nombre del alumno',
    )
    enviar(dialogo, { Nombre: 'Ana Pérez' })

    expect(await within(dialogo).findByText('ABCD2345EFGH6789')).toBeVisible()
    expect(dialogo).toHaveTextContent('No se volverá a mostrar.')
    expect(cuerpos).toEqual([
      { correo: 'ana@norte.cursus.test' },
      { correo: 'ana@norte.cursus.test', nombre: 'Ana Pérez' },
    ])
    expect(alumnosDeLaSeccion1()).toBe('1')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar' }))
    expect(
      await within(dialogo).findByText('Contraseña copiada.'),
    ).toBeInTheDocument()
    expect(escribir).toHaveBeenCalledWith('ABCD2345EFGH6789')

    // Al cerrar se descarta: no queda en la página ni en localStorage.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('ABCD2345EFGH6789')).toBeNull()
    expect(JSON.stringify({ ...localStorage })).not.toContain(
      'ABCD2345EFGH6789',
    )
  })

  test('muestra los errores del backend en el diálogo sin cambiar el conteo', async () => {
    const dialogo = await abrirDialogo(() =>
      json(
        {
          statusCode: 409,
          message: 'El alumno ya está inscrito en esta sección',
        },
        409,
      ),
    )

    enviar(dialogo, { 'Correo institucional': 'alumno@norte.cursus.test' })
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'El alumno ya está inscrito en esta sección',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(alumnosDeLaSeccion1()).toBe('0')
  })

  test('Cancelar cierra el diálogo sin agregar a nadie', async () => {
    let pedidos = 0
    const dialogo = await abrirDialogo(() => {
      pedidos++
      return json(EXISTENTE, 201)
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedidos).toBe(0)
  })
})

test('cada curso del listado enlaza a su detalle', async () => {
  const LISTADO: CursoListado = {
    id: 'curso-1',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
    carreraNombre: 'Ingeniería Civil en Informática',
    periodo: PERIODO,
    secciones: 2,
  }
  await renderConSesion('ADMINISTRATIVO', '/cursos', {
    '/api/cursos': () => [LISTADO],
    '/api/cursos/curso-1': () => CURSO,
  })

  fireEvent.click(await screen.findByRole('link', { name: 'ICC101' }))
  expect(
    await screen.findByRole('table', { name: 'Secciones' }),
  ).toBeInTheDocument()
})
