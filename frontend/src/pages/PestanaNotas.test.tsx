import type {
  EvaluacionesSeccion,
  HistorialNota,
  NotasEvaluacion,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'

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

const LISTA: EvaluacionesSeccion = {
  evaluaciones: [
    { id: 'e1', nombre: 'Control 1', fecha: '2026-09-01', ponderacion: 20 },
    { id: 'e2', nombre: 'Solemne 1', fecha: '2026-10-05', ponderacion: 30 },
  ],
  sumaPonderaciones: 50,
}

// Abre la vista de la sección con el rol dado y entra a la pestaña Notas.
async function abrirNotas(
  rol: Rol,
  evaluaciones: (init?: RequestInit) => unknown = () => LISTA,
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: evaluaciones,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  expect(screen.getByRole('tab', { name: 'Notas' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return { panel: within(screen.getByRole('tabpanel', { name: 'Notas' })) }
}

describe('pestaña Notas (NOT-01)', () => {
  test('HIS-02: un curso cerrado conserva las notas y el historial en solo lectura', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      [RESUMEN_RUTA]: () => ({ ...RESUMEN, cursoCerrado: true }),
      [EVALUACIONES]: () => LISTA,
      [`${EVALUACIONES}/e1/notas`]: () => ({
        cursoCerrado: true,
        estado: 'APROBADA',
        evaluacion: LISTA.evaluaciones[0],
        alumnos: [{ id: 'a1', nombre: 'Ana', nota: 5.5, estado: 'PUBLICADA' }],
      }),
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
    expect(screen.getByText(/Curso cerrado/)).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: 'Historial de notas de Control 1',
      }),
    ).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Nueva evaluación' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Editar Control 1' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Notas de Control 1' }))
    expect(
      await screen.findByRole('table', { name: 'Notas publicadas' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Recorregir nota/ })).toBeNull()
  })

  test('el profesor ve el formulario y la lista con la suma de ponderaciones', async () => {
    const { panel } = await abrirNotas('PROFESOR')

    expect(
      panel.getByRole('form', { name: 'Nueva evaluación' }),
    ).toBeInTheDocument()
    const filas = (await panel.findAllByRole('row')).map((f) => f.textContent)
    expect(filas).toEqual([
      'EvaluaciónFechaPonderaciónAccionesNotas',
      'Control 12026-09-0120 %EditarVer historialVer notas',
      'Solemne 12026-10-0530 %EditarVer historialVer notas',
      'Suma de ponderaciones50 %',
    ])
  })

  test('crear envía los tres campos y vuelve a pedir la lista', async () => {
    const enviados: unknown[] = []
    let creada = false
    const { panel } = await abrirNotas('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        creada = true
        return json(
          { id: 'e3', nombre: 'Examen', fecha: '2026-12-01', ponderacion: 50 },
          201,
        )
      }
      return creada
        ? {
            evaluaciones: [
              ...LISTA.evaluaciones,
              {
                id: 'e3',
                nombre: 'Examen',
                fecha: '2026-12-01',
                ponderacion: 50,
              },
            ],
            sumaPonderaciones: 100,
          }
        : LISTA
    })
    await panel.findByText('Control 1')

    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Examen' },
    })
    fireEvent.change(panel.getByLabelText('Fecha'), {
      target: { value: '2026-12-01' },
    })
    fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
      target: { value: '50' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))

    expect(await panel.findByText('Evaluación creada')).toBeInTheDocument()
    expect(enviados).toEqual([
      { nombre: 'Examen', fecha: '2026-12-01', ponderacion: 50 },
    ])
    expect(await panel.findByText('Examen')).toBeInTheDocument()
    expect(panel.getByText('100 %')).toBeInTheDocument()
    expect(panel.getByLabelText('Nombre')).toHaveValue('')

    // Al empezar la siguiente evaluación se borra el aviso.
    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Otra' },
    })
    expect(panel.queryByText('Evaluación creada')).not.toBeInTheDocument()
  })

  test('un 400 del backend muestra su mensaje', async () => {
    const mensaje =
      'La fecha debe estar dentro del período del curso (del 2026-08-03 al 2026-12-18)'
    const { panel } = await abrirNotas('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 400, message: mensaje }, 400)
        : LISTA,
    )
    await panel.findByText('Control 1')
    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Tarde' },
    })
    fireEvent.change(panel.getByLabelText('Fecha'), {
      target: { value: '2027-01-10' },
    })
    fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
      target: { value: '10' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(mensaje)
  })

  // El Director lee por la API (db-spec), pero no tiene ruta a esta vista:
  // /mis-cursos no está en su menú.
  // El alumno ve sus notas en vez de la lista (NOT-13, MisNotas.test.tsx).
  test('el ayudante ve la lista pero no el formulario', async () => {
    const { panel } = await abrirNotas('AYUDANTE')

    expect(await panel.findByText('Control 1')).toBeInTheDocument()
    expect(panel.getByText('50 %')).toBeInTheDocument()
    expect(
      panel.queryByRole('status', { name: 'Aviso de ponderaciones' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Nueva evaluación' }),
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Crear evaluación' }),
    ).not.toBeInTheDocument()
    // NOT-05: el ayudante tiene exactamente un botón por evaluación para
    // ingresar sus notas, y ningún otro.
    const esperados = ['Notas de Control 1', 'Notas de Solemne 1']
    const botones = panel.queryAllByRole('button')
    expect(botones).toHaveLength(esperados.length)
    botones.forEach((boton, indice) =>
      expect(boton).toHaveAccessibleName(esperados[indice]),
    )
    expect(botones.map((boton) => boton.textContent)).toEqual(
      esperados.map(() => 'Ingresar notas'),
    )
  })

  test('sin evaluaciones muestra el estado vacío', async () => {
    const { panel } = await abrirNotas('AYUDANTE', () => ({
      evaluaciones: [],
      sumaPonderaciones: 0,
    }))

    expect(
      await panel.findByText('Aún no hay evaluaciones'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirNotas('AYUDANTE', () =>
      ++intentos === 1 ? json({}, 500) : LISTA,
    )

    expect(
      await panel.findByText('No pudimos cargar las evaluaciones.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Control 1')).toBeInTheDocument()
  })
})

describe('historial de una nota (NOT-16)', () => {
  const NOTAS = `${EVALUACIONES}/e1/notas`
  const ANA = `${NOTAS}/a1/historial`
  const BRUNO = `${NOTAS}/a2/historial`
  const alumnos: NotasEvaluacion = {
    evaluacion: LISTA.evaluaciones[0],
    estado: 'APROBADA',
    alumnos: [
      { id: 'a1', nombre: 'Ana Ávila', nota: 6.5, estado: 'PUBLICADA' },
      { id: 'a2', nombre: 'Bruno Díaz', nota: null, estado: null },
    ],
  }
  const fecha = '2026-10-02T13:00:00Z'
  const historial: HistorialNota = {
    eventos: [
      {
        id: '1',
        tipo: 'PROPUESTA',
        fecha,
        responsable: { id: 'a', nombre: 'Lucía Reyes' },
        notaAnterior: null,
        notaNueva: 5.5,
        motivo: null,
      },
      {
        id: '2',
        tipo: 'APROBACION',
        fecha: '2026-10-03T13:00:00Z',
        responsable: { id: 'p', nombre: 'Camila Rojas' },
        notaAnterior: null,
        notaNueva: null,
        motivo: null,
      },
      {
        id: '3',
        tipo: 'RECORRECCION',
        fecha: '2026-10-04T13:00:00Z',
        responsable: { id: 'p', nombre: 'Camila Rojas' },
        notaAnterior: 5.5,
        notaNueva: 6.5,
        motivo: 'Se revisó la rúbrica.',
      },
    ],
  }

  test('consulta al seleccionar un alumno y muestra sus eventos en una tabla de solo lectura', async () => {
    const peticiones: string[] = []
    let intentoBruno = 0
    await renderConSesion('PROFESOR', VISTA, {
      [RESUMEN_RUTA]: () => RESUMEN,
      [EVALUACIONES]: () => LISTA,
      [NOTAS]: () => alumnos,
      [ANA]: (init) => {
        peticiones.push(init?.method ?? 'GET')
        return historial
      },
      [BRUNO]: (init) => {
        peticiones.push(init?.method ?? 'GET')
        return intentoBruno++ === 0 ? json({}, 503) : { eventos: [] }
      },
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
    const abrir = await screen.findByRole('button', {
      name: 'Historial de notas de Control 1',
    })
    expect(peticiones).toEqual([])
    fireEvent.click(abrir)
    expect(abrir).toHaveAttribute('aria-expanded', 'true')
    const seleccion = await screen.findByRole('combobox', {
      name: 'Alumno para consultar',
    })
    expect(peticiones).toEqual([])
    fireEvent.change(seleccion, { target: { value: 'a1' } })
    const tabla = await screen.findByRole('table', {
      name: 'Historial de Ana Ávila',
    })
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(
      filas.map((fila) =>
        within(fila)
          .getAllByRole('cell')
          .slice(1)
          .map((celda) => celda.textContent),
      ),
    ).toEqual([
      ['Lucía Reyes', 'Propuesta', '—', '5,5', '—'],
      ['Camila Rojas', 'Aprobación', '—', '—', '—'],
      ['Camila Rojas', 'Recorrección', '5,5', '6,5', 'Se revisó la rúbrica.'],
    ])
    expect(filas[0].querySelector('time')).toHaveAttribute('datetime', fecha)
    expect(within(tabla).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(tabla).queryByRole('button')).not.toBeInTheDocument()

    fireEvent.change(seleccion, { target: { value: 'a2' } })
    expect(
      screen.queryByRole('table', { name: 'Historial de Ana Ávila' }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('No pudimos cargar el historial de esta nota.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByText(
        'Este alumno aún no tiene cambios de nota registrados.',
      ),
    ).toBeInTheDocument()
    expect(peticiones).toEqual(['GET', 'GET', 'GET'])
  })

  // El alumno ve MisNotas, sin historial (NOT-13, MisNotas.test.tsx).
  test.each(['AYUDANTE'] as const)(
    'no ofrece historial al rol %s',
    async (rol) => {
      const { panel } = await abrirNotas(rol)
      await panel.findByText('Control 1')
      expect(
        panel.queryByRole('button', {
          name: 'Historial de notas de Control 1',
        }),
      ).not.toBeInTheDocument()
    },
  )
})

describe('NOT-03: edición de evaluaciones', () => {
  const EDICION = `${EVALUACIONES}/e1`

  async function abrirEdicion(
    guardar: (init?: RequestInit) => Response,
    listar = () => LISTA,
  ) {
    await renderConSesion('PROFESOR', VISTA, {
      [RESUMEN_RUTA]: () => RESUMEN,
      [EVALUACIONES]: listar,
      [EDICION]: guardar,
    })
    fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Control 1' }),
    )
    return within(screen.getByRole('form', { name: 'Editar Control 1' }))
  }

  test('precarga y guarda los tres campos, y actualiza el total', async () => {
    const cambios: unknown[] = []
    let lista = LISTA
    const nuevo = {
      nombre: 'Control corregido',
      fecha: '2026-09-02',
      ponderacion: 40,
    }
    const form = await abrirEdicion(
      (init) => {
        expect(init?.method).toBe('PUT')
        cambios.push(JSON.parse(String(init?.body)))
        lista = {
          evaluaciones: [{ id: 'e1', ...nuevo }, LISTA.evaluaciones[1]],
          sumaPonderaciones: 70,
        }
        return json({ id: 'e1', ...nuevo })
      },
      () => lista,
    )
    expect(form.getByLabelText('Nombre')).toHaveValue('Control 1')
    expect(form.getByLabelText('Fecha')).toHaveValue('2026-09-01')
    expect(form.getByLabelText('Ponderación (%)')).toHaveValue(20)
    fireEvent.change(form.getByLabelText('Nombre'), {
      target: { value: nuevo.nombre },
    })
    fireEvent.change(form.getByLabelText('Fecha'), {
      target: { value: nuevo.fecha },
    })
    fireEvent.change(form.getByLabelText('Ponderación (%)'), {
      target: { value: '40' },
    })
    fireEvent.click(form.getByRole('button', { name: 'Guardar cambios' }))
    expect(
      await screen.findByText('Evaluación actualizada.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Control corregido')).toBeInTheDocument()
    expect(screen.getByText('70 %')).toBeInTheDocument()
    expect(cambios).toEqual([nuevo])
  })

  test('explica el bloqueo al cargar una evaluación que ya tiene notas', async () => {
    const { panel } = await abrirNotas('PROFESOR', () => ({
      ...LISTA,
      evaluaciones: LISTA.evaluaciones.map((e) => ({ ...e, tieneNotas: true })),
    }))
    expect(await panel.findAllByText(/ya tiene notas ingresadas/)).toHaveLength(
      2,
    )
    expect(
      panel.queryByRole('button', { name: /Editar/ }),
    ).not.toBeInTheDocument()
  })

  test('un 409 concurrente conserva el motivo y deshabilita el guardado', async () => {
    let tieneNotas = false
    const form = await abrirEdicion(
      () => {
        tieneNotas = true
        return json({ statusCode: 409 }, 409)
      },
      () => ({
        ...LISTA,
        evaluaciones: [
          { ...LISTA.evaluaciones[0], tieneNotas },
          LISTA.evaluaciones[1],
        ],
      }),
    )
    fireEvent.click(form.getByRole('button', { name: 'Guardar cambios' }))
    expect(await form.findByRole('alert')).toHaveTextContent(
      'ya tiene notas ingresadas',
    )
    expect(form.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    fireEvent.click(form.getByRole('button', { name: 'Cancelar' }))
    expect(
      screen.queryByRole('button', { name: 'Editar Control 1' }),
    ).not.toBeInTheDocument()
  })
})

describe('NOT-02: aviso de ponderaciones', () => {
  test.each([
    [0, 'Faltan 100 puntos porcentuales'],
    [50, 'Faltan 50 puntos porcentuales'],
    [99, 'Falta 1 punto porcentual'],
    [101, 'Sobra 1 punto porcentual'],
    [130, 'Sobran 30 puntos porcentuales'],
  ])(
    'con suma %s indica el total y cuánto falta o sobra',
    async (suma, texto) => {
      const { panel } = await abrirNotas('PROFESOR', () => ({
        evaluaciones: suma === 0 ? [] : LISTA.evaluaciones,
        sumaPonderaciones: suma,
      }))
      const aviso = await panel.findByRole('status', {
        name: 'Aviso de ponderaciones',
      })
      expect(aviso).toHaveTextContent(`Las ponderaciones suman ${suma} %.`)
      expect(aviso).toHaveTextContent(texto)
      if (suma === 0)
        expect(panel.getByText('Aún no hay evaluaciones')).toBeInTheDocument()
      expect(
        panel.getByRole('button', { name: 'Crear evaluación' }),
      ).toBeEnabled()
    },
  )
  test('no muestra aviso cuando la suma es exactamente 100 %', async () => {
    const { panel } = await abrirNotas('PROFESOR', () => ({
      ...LISTA,
      sumaPonderaciones: 100,
    }))
    await panel.findByText('Control 1')
    expect(
      panel.queryByRole('status', { name: 'Aviso de ponderaciones' }),
    ).not.toBeInTheDocument()
  })
  test('el aviso desaparece al completar 100 % y vuelve si se supera al crear otra evaluación', async () => {
    let suma = 50
    const { panel } = await abrirNotas('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        suma += 50
        return json(
          { id: 'nueva', nombre: 'Otra', fecha: '2026-10-12', ponderacion: 50 },
          201,
        )
      }
      return { ...LISTA, sumaPonderaciones: suma }
    })
    expect(
      await panel.findByRole('status', { name: 'Aviso de ponderaciones' }),
    ).toHaveTextContent('Faltan 50')
    const crear = () => {
      fireEvent.change(panel.getByLabelText('Nombre'), {
        target: { value: 'Otra' },
      })
      fireEvent.change(panel.getByLabelText('Fecha'), {
        target: { value: '2026-10-12' },
      })
      fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
        target: { value: '50' },
      })
      fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))
    }
    crear()
    await panel.findByText('100 %')
    expect(
      panel.queryByRole('status', { name: 'Aviso de ponderaciones' }),
    ).not.toBeInTheDocument()
    crear()
    expect(
      await panel.findByRole('status', { name: 'Aviso de ponderaciones' }),
    ).toHaveTextContent('Sobran 50')
  })
  test('no inventa una suma ni muestra el aviso si falla la carga', async () => {
    const { panel } = await abrirNotas('PROFESOR', () => json({}, 500))
    await panel.findByText('No pudimos cargar las evaluaciones.')
    expect(
      panel.queryByRole('status', { name: 'Aviso de ponderaciones' }),
    ).not.toBeInTheDocument()
  })
})
