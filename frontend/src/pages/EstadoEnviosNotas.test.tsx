import type {
  EvaluacionesSeccion,
  NotasEvaluacion,
  Rol,
  SeccionResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'
const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo', anio: 2026, semestre: 2 },
  rol: 'AYUDANTE',
  horario: [],
  profesor: { id: 'profesor', nombre: 'Camila Rojas' },
  profesores: ['Camila Rojas'],
  ayudantes: [],
}
const COMENTARIO =
  'Revisa la pregunta 3.\nJustifica el resultado. <script>alert(1)</script>'
const LISTA: EvaluacionesSeccion = {
  evaluaciones: [
    {
      id: 'b',
      nombre: 'Control borrador',
      fecha: '2026-09-01',
      ponderacion: 10,
      envio: { estado: 'BORRADOR', comentarioDevolucion: null },
    },
    {
      id: 'r',
      nombre: 'Control en revisión',
      fecha: '2026-09-02',
      ponderacion: 20,
      envio: { estado: 'EN_REVISION', comentarioDevolucion: null },
    },
    {
      id: 'a',
      nombre: 'Control aprobado',
      fecha: '2026-09-03',
      ponderacion: 30,
      envio: { estado: 'APROBADA', comentarioDevolucion: null },
    },
    {
      id: 'd',
      nombre: 'Control devuelto',
      fecha: '2026-09-04',
      ponderacion: 40,
      envio: { estado: 'DEVUELTA', comentarioDevolucion: COMENTARIO },
    },
  ],
  sumaPonderaciones: 100,
}
const DETALLE: NotasEvaluacion = {
  evaluacion: LISTA.evaluaciones[3],
  estado: 'DEVUELTA',
  comentarioDevolucion: COMENTARIO,
  alumnos: [{ id: 'ana', nombre: 'Ana Ávila', nota: 5, estado: 'PROPUESTA' }],
}

async function abrir({
  lista = LISTA,
  detalle = () => DETALLE,
  envio = () => DETALLE,
  rol = 'AYUDANTE' as Rol,
} = {}) {
  await renderConSesion(rol, '/mis-cursos/secciones/seccion-1', {
    '/api/espacio/secciones/seccion-1/resumen': () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: () => lista,
    [`${EVALUACIONES}/d/notas`]: detalle,
    [`${EVALUACIONES}/d/notas/envio`]: envio,
    [`${EVALUACIONES}/a/notas`]: () => ({
      ...DETALLE,
      evaluacion: LISTA.evaluaciones[2],
      estado: 'APROBADA',
      comentarioDevolucion: null,
    }),
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  await screen.findByText('Control borrador')
  return within(screen.getByRole('table'))
}

test('cada evaluación muestra su estado y una acción acorde a su edición', async () => {
  const tabla = await abrir()
  expect(
    tabla.getByRole('columnheader', { name: 'Estado del envío' }),
  ).toBeInTheDocument()
  const esperados = [
    ['Control borrador', 'Borrador', 'Ingresar notas'],
    ['Control en revisión', 'En revisión', 'Ver notas'],
    ['Control aprobado', 'Aprobada', 'Ver notas'],
    ['Control devuelto', 'Devuelta', 'Corregir notas'],
  ]
  for (const [nombre, estado, accion] of esperados) {
    const fila = within(tabla.getByRole('row', { name: new RegExp(nombre) }))
    expect(fila.getByText(estado, { exact: true })).toBeInTheDocument()
    expect(
      fila.getByRole('button', { name: `Notas de ${nombre}` }),
    ).toHaveTextContent(accion)
  }
  const comentario = tabla.getByRole('note', {
    name: 'Comentario del profesor',
  })
  expect(comentario.textContent).toContain(COMENTARIO)
  expect(comentario.querySelector('script')).toBeNull()
})

test('devuelta muestra el comentario, permite corregir y al reenviar limpia lista y detalle', async () => {
  let actual = DETALLE
  const guardados: unknown[] = []
  const tabla = await abrir({
    detalle: (init?: RequestInit) => {
      if (init?.method === 'PUT') {
        guardados.push(JSON.parse(String(init.body)))
        actual = { ...actual, alumnos: [{ ...actual.alumnos[0], nota: 6.5 }] }
      }
      return actual
    },
    envio: () =>
      (actual = {
        ...actual,
        estado: 'EN_REVISION',
        comentarioDevolucion: null,
      }),
  })
  fireEvent.click(
    tabla.getByRole('button', { name: 'Notas de Control devuelto' }),
  )
  const detalle = within(
    await screen.findByRole('region', { name: 'Notas de Control devuelto' }),
  )
  expect(
    detalle.getByRole('note', { name: 'Comentario del profesor' }).textContent,
  ).toContain(COMENTARIO)
  const campo = detalle.getByLabelText('Nota de Ana Ávila')
  expect(campo).not.toHaveAttribute('readonly')
  fireEvent.change(campo, { target: { value: '6,5' } })
  fireEvent.click(detalle.getByRole('button', { name: 'Guardar borrador' }))
  expect(await detalle.findByRole('status')).toHaveTextContent(
    'Borrador guardado.',
  )
  expect(guardados).toEqual([{ notas: [{ alumnoId: 'ana', nota: 6.5 }] }])
  expect(detalle.getByRole('note')).toHaveTextContent('Revisa la pregunta 3.')
  fireEvent.click(detalle.getByRole('button', { name: 'Enviar a revisión' }))
  fireEvent.click(
    within(detalle.getByRole('region', { name: 'Confirmar envío' })).getByRole(
      'button',
      { name: 'Enviar' },
    ),
  )
  await detalle.findByText('Estado: En revisión')
  await waitFor(() =>
    expect(
      tabla.getByRole('row', { name: /Control devuelto/ }),
    ).toHaveTextContent('En revisión'),
  )
  expect(
    screen.queryAllByRole('note', { name: 'Comentario del profesor' }),
  ).toHaveLength(0)
  expect(detalle.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
    'readonly',
  )
  expect(
    detalle.queryByRole('button', { name: 'Guardar borrador' }),
  ).not.toBeInTheDocument()
})

test('abrir una evaluación sincroniza una devolución posterior a la carga del listado', async () => {
  const lista: EvaluacionesSeccion = {
    ...LISTA,
    evaluaciones: LISTA.evaluaciones.map((e) =>
      e.id === 'd'
        ? { ...e, envio: { estado: 'EN_REVISION', comentarioDevolucion: null } }
        : e,
    ),
  }
  const tabla = await abrir({ lista })
  expect(
    tabla.getByRole('row', { name: /Control devuelto/ }),
  ).toHaveTextContent('En revisión')
  fireEvent.click(
    tabla.getByRole('button', { name: 'Notas de Control devuelto' }),
  )
  const detalle = within(
    await screen.findByRole('region', { name: 'Notas de Control devuelto' }),
  )
  await waitFor(() =>
    expect(
      tabla.getByRole('row', { name: /Control devuelto/ }),
    ).toHaveTextContent('Devuelta'),
  )
  expect(detalle.getByLabelText('Nota de Ana Ávila')).not.toHaveAttribute(
    'readonly',
  )
  expect(tabla.getByRole('note')).toHaveTextContent('Comentario del profesor')
})

test('aprobada solo permite consultar las notas', async () => {
  const tabla = await abrir()
  fireEvent.click(
    tabla.getByRole('button', { name: 'Notas de Control aprobado' }),
  )
  const detalle = within(
    await screen.findByRole('region', { name: 'Notas de Control aprobado' }),
  )
  expect(detalle.getByText('Estado: Aprobada')).toBeInTheDocument()
  expect(detalle.getByLabelText('Nota de Ana Ávila')).toHaveAttribute(
    'readonly',
  )
  expect(
    detalle.queryByRole('button', { name: 'Guardar borrador' }),
  ).not.toBeInTheDocument()
  expect(
    detalle.queryByRole('button', { name: 'Enviar a revisión' }),
  ).not.toBeInTheDocument()
  expect(detalle.queryByRole('note')).not.toBeInTheDocument()
})

test.each<Rol>(['ALUMNO', 'PROFESOR'])(
  '%s no ve los estados ni comentarios del listado del ayudante',
  async (rol) => {
    const tabla = await abrir({ rol })
    expect(
      tabla.queryByRole('columnheader', { name: 'Estado del envío' }),
    ).not.toBeInTheDocument()
    expect(tabla.queryByRole('note')).not.toBeInTheDocument()
  },
)

test('una respuesta anterior sin metadatos no inventa un estado de borrador', async () => {
  const lista = {
    ...LISTA,
    evaluaciones: LISTA.evaluaciones.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      fecha: e.fecha,
      ponderacion: e.ponderacion,
    })),
  }
  const tabla = await abrir({ lista })
  expect(tabla.getAllByText('Estado no disponible')).toHaveLength(4)
  expect(tabla.queryByText('Borrador', { exact: true })).not.toBeInTheDocument()
})
