import type { MetricasConsolidadas, Rol } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/metricas/consolidado'

const METRICAS: MetricasConsolidadas = {
  periodos: [
    { universidad: 'Universidad Demo Norte', anio: 2026, semestre: 2 },
    { universidad: 'Universidad Demo Sur', anio: 2026, semestre: 2 },
  ],
  aprobacion: { valor: 66.7, aprobados: 2, evaluados: 3 },
  promedio: { valor: 4.57, alumnos: 3 },
  asistencia: { valor: 83.33, presentes: 5, registros: 6 },
  alumnos: 12,
  cursos: 4,
}

describe('Indicadores del Director (MET-01)', () => {
  test('muestra las tres tarjetas con valor, unidad y n', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => METRICAS,
    })
    const tarjetas = within(
      await screen.findByRole('list', { name: 'Indicadores' }),
    )
    const aprobacion = within(
      tarjetas.getByRole('article', { name: 'Tasa de aprobación' }),
    )
    expect(aprobacion.getByText('66,7')).toBeInTheDocument()
    expect(aprobacion.getByText('%')).toBeInTheDocument()
    expect(
      aprobacion.getByText('2 de 3 alumnos con nota final'),
    ).toBeInTheDocument()
    const promedio = within(tarjetas.getByRole('article', { name: 'Promedio' }))
    expect(promedio.getByText('4,57')).toBeInTheDocument()
    expect(promedio.getByText('3 alumnos con nota final')).toBeInTheDocument()
    const asistencia = within(
      tarjetas.getByRole('article', { name: 'Asistencia' }),
    )
    expect(asistencia.getByText('83,33')).toBeInTheDocument()
    expect(
      asistencia.getByText('5 presentes de 6 registros'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('12 alumnos inscritos en 4 cursos del período activo.'),
    ).toBeInTheDocument()
    // MET-03 agrega el filtro: el selector existe, pero no se puede usar.
    const periodo = screen.getByRole('combobox', { name: 'Período' })
    expect(periodo).toBeDisabled()
    expect(periodo).toHaveTextContent(
      '2026-2 (Universidad Demo Norte, Universidad Demo Sur)',
    )
  })

  test('un indicador sin denominador dice "Sin datos suficientes" en vez de 0', async () => {
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => ({
        ...METRICAS,
        periodos: [METRICAS.periodos[0]],
        aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
        promedio: { valor: null, alumnos: 0 },
      }),
    })
    const tarjetas = within(
      await screen.findByRole('list', { name: 'Indicadores' }),
    )
    const aprobacion = within(
      tarjetas.getByRole('article', { name: 'Tasa de aprobación' }),
    )
    expect(aprobacion.getByText('Sin datos suficientes')).toBeInTheDocument()
    expect(aprobacion.queryByText('0')).toBeNull()
    expect(
      within(tarjetas.getByRole('article', { name: 'Promedio' })).getByText(
        'Sin datos suficientes',
      ),
    ).toBeInTheDocument()
    // La asistencia sí tiene datos.
    expect(
      within(tarjetas.getByRole('article', { name: 'Asistencia' })).getByText(
        '83,33',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent(
      '2026-2 (Universidad Demo Norte)',
    )
  })

  test('si la API falla, avisa y permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/indicadores', {
      [RUTA]: () => (intentos++ === 0 ? json({}, 500) : METRICAS),
    })
    expect(
      await screen.findByText('No pudimos cargar los indicadores.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Indicadores' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('list', { name: 'Indicadores' }),
    ).toBeInTheDocument()
  })

  test.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO'])(
    '%s no ve Indicadores en el menú',
    async (rol) => {
      await renderConSesion(rol, '/')
      expect(screen.queryByRole('link', { name: 'Indicadores' })).toBeNull()
    },
  )
})
