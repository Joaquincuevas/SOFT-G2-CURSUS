import type { MetricasConsolidadas, ResumenUniversidad } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const CONSOLIDADO = '/api/metricas/consolidado'
const UNIVERSIDADES = '/api/metricas/universidades'

const METRICAS: MetricasConsolidadas = {
  periodos: [
    { universidad: 'Universidad Demo Norte', anio: 2026, semestre: 2 },
    { universidad: 'Universidad Demo Sur', anio: 2026, semestre: 2 },
  ],
  aprobacion: { valor: 72.4, aprobados: 21, evaluados: 29 },
  promedio: { valor: 5.1, alumnos: 29 },
  asistencia: { valor: 86.25, presentes: 345, registros: 400 },
  alumnos: 25,
  cursos: 19,
}

const SIN_VALORES: MetricasConsolidadas = {
  ...METRICAS,
  aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
  promedio: { valor: null, alumnos: 0 },
  asistencia: { valor: null, presentes: 0, registros: 0 },
}

const LISTA: ResumenUniversidad[] = [
  {
    id: 'u-norte',
    nombre: 'Universidad Demo Norte',
    periodo: { anio: 2026, semestre: 2 },
    aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
    promedio: { valor: 4.5, alumnos: 2 },
    asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    alumnos: 25,
    cursos: 17,
  },
  {
    id: 'u-sur',
    nombre: 'Universidad Demo Sur',
    periodo: { anio: 2026, semestre: 2 },
    aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
    promedio: { valor: null, alumnos: 0 },
    asistencia: { valor: null, presentes: 0, registros: 0 },
    alumnos: 0,
    cursos: 2,
  },
]

const dashboard = () => screen.findByRole('region', { name: 'Dashboard' })

describe('Dashboard del Director', () => {
  test('muestra los indicadores clave, los conteos, las universidades y los accesos directos', async () => {
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
    })
    const panel = within(await dashboard())

    const indicadores = await panel.findByRole('list', { name: 'Indicadores' })
    expect(within(indicadores).getByText('72,4')).toBeInTheDocument()
    expect(
      within(indicadores).getByText('21 de 29 alumnos con nota final'),
    ).toBeInTheDocument()
    expect(within(indicadores).getByText('5,10')).toBeInTheDocument()
    expect(within(indicadores).getByText('86,25')).toBeInTheDocument()
    const alumnos = within(
      within(indicadores).getByRole('article', { name: 'Alumnos inscritos' }),
    )
    expect(alumnos.getByText('25')).toBeInTheDocument()
    const cursos = within(
      within(indicadores).getByRole('article', { name: 'Cursos' }),
    )
    expect(cursos.getByText('19')).toBeInTheDocument()
    expect(
      cursos.getByText('2 universidades con período activo'),
    ).toBeInTheDocument()

    const universidades = within(
      await panel.findByRole('region', { name: 'Universidades' }),
    )
    expect(
      universidades.getByRole('link', { name: 'Universidad Demo Norte' }),
    ).toHaveAttribute('href', '/indicadores/universidades/u-norte')
    expect(
      universidades.getByText(
        'Aprobación: 50,0 % · Promedio: 4,50 · Asistencia: 66,67 %',
      ),
    ).toBeInTheDocument()
    // Sur no tiene datos: se dice, no se muestra 0.
    expect(
      universidades.getByText(
        'Aprobación: Sin datos suficientes · Promedio: Sin datos suficientes · Asistencia: Sin datos suficientes',
      ),
    ).toBeInTheDocument()

    const accesos = within(
      panel.getByRole('region', { name: 'Accesos directos' }),
    )
    expect(accesos.getByRole('link', { name: /^Indicadores/ })).toHaveAttribute(
      'href',
      '/indicadores',
    )
    expect(
      accesos.getByRole('link', { name: /^Comparar universidades/ }),
    ).toHaveAttribute('href', '/indicadores/comparar')
    expect(
      accesos.getByRole('link', { name: /^Registro de accesos/ }),
    ).toHaveAttribute('href', '/accesos')
  })

  // El reporte de la facultad (MET-08) es del Administrativo: el Director no
  // tiene ese permiso, así que el dashboard no lo ofrece.
  test('no ofrece el reporte de facultad, que el Director no puede abrir', async () => {
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => METRICAS,
      [UNIVERSIDADES]: () => LISTA,
    })
    const panel = within(await dashboard())
    await panel.findByRole('list', { name: 'Indicadores' })
    expect(panel.queryByRole('link', { name: /Reporte/ })).toBeNull()
  })

  test('un indicador sin denominador dice «Sin datos suficientes» y los conteos siguen', async () => {
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => SIN_VALORES,
      [UNIVERSIDADES]: () => LISTA,
    })
    const indicadores = within(
      await within(await dashboard()).findByRole('list', {
        name: 'Indicadores',
      }),
    )
    expect(indicadores.getAllByText('Sin datos suficientes')).toHaveLength(3)
    expect(indicadores.queryByText('0,00')).toBeNull()
    expect(indicadores.getByText('25')).toBeInTheDocument()
  })

  test('mientras carga muestra esqueletos y lo anuncia', async () => {
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => new Promise(() => {}),
      [UNIVERSIDADES]: () => new Promise(() => {}),
    })
    const panel = within(await dashboard())
    expect(
      (await panel.findAllByRole('status')).map((s) => s.textContent),
    ).toEqual(['Cargando indicadores…', 'Cargando universidades…'])
    expect(panel.queryByRole('list', { name: 'Indicadores' })).toBeNull()
  })

  test('si el consolidado falla, ofrece reintentar sin esconder lo demás', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => (intentos++ === 0 ? json({}, 500) : METRICAS),
      [UNIVERSIDADES]: () => LISTA,
    })
    const panel = within(await dashboard())
    expect(
      await panel.findByText('No pudimos cargar los indicadores.'),
    ).toBeInTheDocument()
    // Las universidades y los accesos directos siguen disponibles.
    expect(
      await panel.findByRole('link', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
    expect(
      panel.getByRole('region', { name: 'Accesos directos' }),
    ).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('72,4')).toBeInTheDocument()
  })

  test('si las universidades fallan, ofrece reintentar', async () => {
    let intentos = 0
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => METRICAS,
      [UNIVERSIDADES]: () => (intentos++ === 0 ? json({}, 500) : LISTA),
    })
    const panel = within(await dashboard())
    expect(
      await panel.findByText('No pudimos cargar las universidades.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(
      await panel.findByRole('link', { name: 'Universidad Demo Sur' }),
    ).toBeInTheDocument()
  })

  test('sin universidades dice qué falta', async () => {
    await renderConSesion('DIRECTOR', '/', {
      [CONSOLIDADO]: () => METRICAS,
      [UNIVERSIDADES]: () => [],
    })
    expect(
      await within(await dashboard()).findByText('No hay universidades.'),
    ).toBeInTheDocument()
  })

  test.each(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'] as const)(
    '%s no ve el resumen del Director ni pide las métricas',
    async (rol) => {
      const pedida = vi.fn(() => METRICAS)
      await renderConSesion(rol, '/', { [CONSOLIDADO]: pedida })
      const panel = await dashboard()
      expect(within(panel).queryByText('Indicadores clave')).toBeNull()
      expect(pedida).not.toHaveBeenCalled()
    },
  )
})
