import {
  resumirHorario,
  type BloqueHorario,
  type CursoDetalle,
  type GuardarHorario,
  type HorarioSeccion,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const RUTA = '/api/secciones/seccion-1/horario'
const BLOQUES: BloqueHorario[] = [
  { dia: 1, inicio: '08:30', termino: '09:20', sala: 'Sala 201' },
  { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Laboratorio A' },
]
const VACIO: HorarioSeccion = { version: 0, bloques: [], resumen: null }
const EXISTENTE: HorarioSeccion = {
  version: 3,
  bloques: BLOQUES,
  resumen: resumirHorario(BLOQUES),
}
const curso = (horario: string | null): CursoDetalle => ({
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraNombre: 'Informática',
  periodo: { id: 'periodo', anio: 2026, semestre: 2 },
  secciones: [
    {
      id: 'seccion-1',
      numero: 1,
      horario,
      profesor: 'Profesor Norte',
      profesorId: 'profesor-norte',
      ayudantes: ['Ana Ayudante'],
      alumnos: 2,
    },
  ],
})
const respuestaCorrecta: RutaSimulada = (init) => {
  const { version, bloques } = JSON.parse(String(init?.body)) as GuardarHorario
  return { version: version + 1, bloques, resumen: resumirHorario(bloques) }
}
async function abrir(
  horario: HorarioSeccion = VACIO,
  guardar: RutaSimulada = respuestaCorrecta,
  obtener: RutaSimulada = () => horario,
) {
  const pedir = vi.fn((init?: RequestInit) =>
    init?.method === 'PUT' ? guardar(init) : obtener(init),
  )
  await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
    '/api/cursos/curso-1': () => curso(horario.resumen),
    [RUTA]: pedir,
  })
  fireEvent.click(
    await screen.findByRole('button', {
      name: /^(Asignar|Editar) horario de la sección 1$/,
    }),
  )
  const dialogo = screen.getByRole('dialog', {
    name: 'Horario de la sección 1',
  })
  await within(dialogo).findByRole('button', { name: 'Agregar bloque' })
  return { dialogo, pedir }
}
function completar(
  dialogo: HTMLElement,
  indice: number,
  bloque: BloqueHorario,
) {
  for (const [campo, valor] of Object.entries({
    Día: bloque.dia,
    Inicio: bloque.inicio,
    Término: bloque.termino,
    Sala: bloque.sala,
  })) {
    fireEvent.change(
      within(dialogo).getByLabelText(`${campo} del bloque ${indice}`),
      { target: { value: valor } },
    )
  }
}
const resumenVisible = () =>
  within(screen.getByRole('table', { name: 'Secciones' })).getAllByRole(
    'row',
  )[1].children[1].textContent

describe('GES-10: editor del horario', () => {
  test('asigna varios bloques y actualiza el detalle conservando las otras acciones', async () => {
    const { dialogo, pedir } = await abrir()
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Agregar bloque' }),
    )
    completar(dialogo, 1, BLOQUES[0])
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Agregar bloque' }),
    )
    completar(dialogo, 2, BLOQUES[1])
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Horario de la sección 1 guardado.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(resumenVisible()).toBe(EXISTENTE.resumen)
    const envio = pedir.mock.calls.find(([init]) => init?.method === 'PUT')![0]!
    expect(JSON.parse(String(envio.body))).toEqual({
      version: 0,
      bloques: BLOQUES,
    })
    expect(screen.getByRole('table')).toHaveTextContent('Profesor Norte')
    expect(screen.getByRole('table')).toHaveTextContent('Ana Ayudante')
    expect(
      screen.getByRole('link', { name: 'Ver los 2 alumnos de la sección 1' }),
    ).toHaveAttribute('href', '/secciones/seccion-1/alumnos')
    expect(
      screen.getByRole('button', { name: 'Editar horario de la sección 1' }),
    ).toBeInTheDocument()
  })

  test('carga el horario existente, permite modificar y quitar un bloque', async () => {
    const { dialogo, pedir } = await abrir(EXISTENTE)
    expect(within(dialogo).getByLabelText('Sala del bloque 1')).toHaveValue(
      'Sala 201',
    )
    expect(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    ).toBeDisabled()
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Quitar bloque 1' }),
    )
    completar(dialogo, 1, { ...BLOQUES[1], sala: 'Sala 305' })
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    await screen.findByRole('status')
    expect(
      JSON.parse(
        String(
          pedir.mock.calls.find(([init]) => init?.method === 'PUT')![0]!.body,
        ),
      ),
    ).toEqual({ version: 3, bloques: [{ ...BLOQUES[1], sala: 'Sala 305' }] })
    expect(resumenVisible()).toBe('Miércoles 10:00–11:30 · Sala 305')
  })

  test('quitar todos los bloques deja el detalle sin asignar', async () => {
    const { dialogo } = await abrir(EXISTENTE)
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Quitar bloque 2' }),
    )
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Quitar bloque 1' }),
    )
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    await screen.findByRole('status')
    expect(resumenVisible()).toBe('Sin asignar')
    expect(
      screen.getByRole('button', { name: 'Asignar horario de la sección 1' }),
    ).toBeInTheDocument()
  })

  test('cancelar descarta cambios sin enviar nada', async () => {
    const { dialogo, pedir } = await abrir(EXISTENTE)
    completar(dialogo, 1, { ...BLOQUES[0], sala: 'Sala 999' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedir.mock.calls.some(([init]) => init?.method === 'PUT')).toBe(
      false,
    )
    expect(resumenVisible()).toBe(EXISTENTE.resumen)
  })

  test('cargar alumnos por CSV conserva el horario y editarlo conserva el conteo', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => curso(EXISTENTE.resumen),
      [RUTA]: (init) =>
        init?.method === 'PUT' ? respuestaCorrecta(init) : EXISTENTE,
      '/api/secciones/seccion-1/alumnos/csv': () => ({
        total: 1,
        cargados: 1,
        errores: 0,
        filas: [
          {
            fila: 2,
            correo: 'ana@norte.cursus.test',
            estado: 'cargado',
            cuentaCreada: false,
            alumno: {
              id: 'alumno-3',
              nombre: 'Ana',
              correo: 'ana@norte.cursus.test',
            },
          },
        ],
      }),
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cargar CSV en la sección 1' }),
    )
    const csv = 'correo,nombre\nana@norte.cursus.test,Ana'
    const archivo = new File([csv], 'alumnos.csv', { type: 'text/csv' })
    Object.defineProperty(archivo, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode(csv).buffer),
    })
    fireEvent.change(screen.getByLabelText('Archivo CSV'), {
      target: { files: [archivo] },
    })
    fireEvent.submit(screen.getByLabelText('Archivo CSV').closest('form')!)
    await screen.findByText('Se cargaron 1 de 1 alumnos. Filas con error: 0.')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(resumenVisible()).toBe(EXISTENTE.resumen)

    fireEvent.click(
      screen.getByRole('button', { name: 'Editar horario de la sección 1' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Quitar bloque 2' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Quitar bloque 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }))
    await screen.findByText('Horario de la sección 1 guardado.')
    expect(resumenVisible()).toBe('Sin asignar')
    expect(
      screen.getByRole('link', { name: 'Ver los 3 alumnos de la sección 1' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('Profesor Norte')
    expect(screen.getByRole('table')).toHaveTextContent('Ana Ayudante')
  })

  test('durante el guardado bloquea campos, Cancelar y Escape', async () => {
    let responder: (respuesta: Response) => void = () => {}
    const { dialogo } = await abrir(
      EXISTENTE,
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    completar(dialogo, 1, { ...BLOQUES[0], sala: 'Sala 305' })
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    await waitFor(() =>
      expect(
        within(dialogo).getByRole('button', { name: 'Cancelar' }),
      ).toBeDisabled(),
    )
    expect(within(dialogo).getByLabelText('Sala del bloque 1')).toBeDisabled()
    expect(
      dialogo.dispatchEvent(new Event('cancel', { cancelable: true })),
    ).toBe(false)
    responder(json({ ...EXISTENTE, version: 4 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('un error de guardado conserva los campos y permite reintentar', async () => {
    const { dialogo } = await abrir(EXISTENTE, () => json({}, 500))
    completar(dialogo, 1, { ...BLOQUES[0], sala: 'Sala 305' })
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el horario.',
    )
    expect(within(dialogo).getByLabelText('Sala del bloque 1')).toHaveValue(
      'Sala 305',
    )
    expect(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    ).toBeEnabled()
    expect(
      within(dialogo).getByRole('button', { name: 'Cancelar' }),
    ).toBeEnabled()
    expect(resumenVisible()).toBe(EXISTENTE.resumen)
  })

  test('ante cambios de otra sesión, exige recargar y usa la versión actual', async () => {
    let actual = EXISTENTE
    const guardar = vi.fn(() =>
      json(
        { message: 'El horario cambió. Vuelve a cargarlo antes de guardar.' },
        409,
      ),
    )
    const { dialogo } = await abrir(EXISTENTE, guardar, () => actual)
    completar(dialogo, 1, { ...BLOQUES[0], sala: 'Sala 305' })
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    )
    await within(dialogo).findByRole('alert')
    expect(
      within(dialogo).getByRole('button', { name: 'Guardar horario' }),
    ).toBeDisabled()
    expect(within(dialogo).getByLabelText('Sala del bloque 1')).toHaveValue(
      'Sala 305',
    )
    actual = {
      version: 4,
      bloques: [{ ...BLOQUES[0], sala: 'Sala actual' }],
      resumen: 'Lunes 08:30–09:20 · Sala actual',
    }
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Recargar horario' }),
    )
    await waitFor(() =>
      expect(within(dialogo).getByLabelText('Sala del bloque 1')).toHaveValue(
        'Sala actual',
      ),
    )
    expect(within(dialogo).queryByRole('alert')).toBeNull()
    expect(guardar).toHaveBeenCalledTimes(1)
  })

  test('rechaza un término anterior al inicio antes de enviar', async () => {
    const { dialogo, pedir } = await abrir(EXISTENTE)
    completar(dialogo, 1, { ...BLOQUES[0], termino: '08:00' })
    fireEvent.submit(
      within(dialogo).getByRole('form', { name: 'Bloques del horario' }),
    )
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'La hora de término debe ser posterior al inicio.',
    )
    expect(pedir.mock.calls.some(([init]) => init?.method === 'PUT')).toBe(
      false,
    )
  })

  test('puede reintentar si falla la carga inicial', async () => {
    let fallar = true
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => curso(null),
      [RUTA]: () => (fallar ? json({}, 500) : VACIO),
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Asignar horario de la sección 1',
      }),
    )
    const dialogo = screen.getByRole('dialog')
    await within(dialogo).findByRole('alert')
    fallar = false
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reintentar' }))
    expect(
      await within(dialogo).findByRole('button', { name: 'Agregar bloque' }),
    ).toBeEnabled()
  })

  test('el Director consulta el horario sin acciones de edición', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => curso(EXISTENTE.resumen),
    })
    await screen.findByRole('table', { name: 'Secciones' })
    expect(resumenVisible()).toBe(EXISTENTE.resumen)
    expect(
      screen.queryByRole('button', { name: /horario de la sección/ }),
    ).toBeNull()
  })
})
