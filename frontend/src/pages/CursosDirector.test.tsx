import type { CursoListado } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const curso = (
  codigo: string,
  nombre: string,
  extra: Partial<CursoListado> = {},
): CursoListado => ({
  id: `c-${codigo}`,
  codigo,
  nombre,
  carreraNombre: 'Ingeniería Civil en Informática',
  periodo: { id: 'p-2026-2', anio: 2026, semestre: 2 },
  secciones: 2,
  universidadNombre: 'Universidad Demo Norte',
  ...extra,
})

const SUR = {
  universidadNombre: 'Universidad Demo Sur',
  carreraNombre: 'Enfermería',
}
const CURSOS: CursoListado[] = [
  curso('ICC101', 'Introducción a la Programación'),
  curso('ICC201', 'Estructuras de Datos', { secciones: 3 }),
  curso('ENF101', 'Fundamentos de Enfermería', SUR),
  // Otro período y un curso sin secciones (el «Demo» del seed).
  curso('ICC102', 'Programación Avanzada', {
    periodo: { id: 'p-2026-1', anio: 2026, semestre: 1 },
  }),
  curso('DEMO', 'Curso Demo', {
    secciones: 0,
    periodo: { id: 'p-2026-1', anio: 2026, semestre: 1 },
  }),
]

const abrir = async (cursos: CursoListado[] = CURSOS) => {
  await renderConSesion('DIRECTOR', '/cursos', { '/api/cursos': () => cursos })
  return within(
    await screen.findByRole('region', { name: 'Gestión de cursos' }),
  )
}
const codigos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[1].textContent)
const contador = () => screen.getByText(/^\d+ de \d+ cursos?$/)

describe('Gestión de cursos del Director: búsqueda y filtros', () => {
  test('parte en el período activo y el subtítulo lo refleja', async () => {
    const pagina = await abrir()
    await pagina.findByRole('table')
    expect(screen.getByLabelText('Período')).toHaveValue('2026-2')
    expect(pagina.getByText(/Período 2026-2$/)).toBeInTheDocument()
    expect(codigos()).toEqual(['ICC101', 'ICC201', 'ENF101'])
    expect(contador()).toHaveTextContent('3 de 5 cursos')
    expect(contador()).toHaveAttribute('aria-live', 'polite')

    fireEvent.change(screen.getByLabelText('Período'), {
      target: { value: '' },
    })
    expect(pagina.getByText(/Todos los períodos$/)).toBeInTheDocument()
    expect(contador()).toHaveTextContent('5 de 5 cursos')
  })

  test('busca por nombre o código, sin importar tildes, y se limpia con el botón', async () => {
    await abrir()
    await screen.findByRole('table')
    const buscar = screen.getByRole('searchbox', { name: 'Buscar' })
    fireEvent.change(buscar, { target: { value: 'introduccion' } })
    expect(codigos()).toEqual(['ICC101'])
    fireEvent.change(buscar, { target: { value: 'enf1' } })
    expect(codigos()).toEqual(['ENF101'])
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(buscar).toHaveValue('')
    expect(contador()).toHaveTextContent('3 de 5 cursos')
  })

  test('filtra por universidad y carrera, con chips que se pueden quitar', async () => {
    await abrir()
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Universidad'), {
      target: { value: 'Universidad Demo Sur' },
    })
    expect(codigos()).toEqual(['ENF101'])
    // Las carreras se acotan a la universidad elegida.
    expect(
      within(screen.getByLabelText('Carrera'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todas', 'Enfermería'])

    const chips = within(screen.getByRole('list', { name: 'Filtros activos' }))
    expect(
      chips.getAllByRole('button').map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Quitar Universidad: Universidad Demo Sur',
      'Quitar Período: 2026-2',
    ])
    fireEvent.click(
      chips.getByRole('button', {
        name: 'Quitar Universidad: Universidad Demo Sur',
      }),
    )
    expect(codigos()).toEqual(['ICC101', 'ICC201', 'ENF101'])
  })

  test('sin resultados muestra el estado vacío y «Limpiar filtros» vuelve a todos', async () => {
    await abrir()
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'zzz' },
    })
    expect(
      screen.getByText('No hay cursos con estos filtros.'),
    ).toBeInTheDocument()
    expect(contador()).toHaveTextContent('0 de 5 cursos')
    const limpiar = screen.getAllByRole('button', { name: 'Limpiar filtros' })
    expect(limpiar).toHaveLength(2)
    fireEvent.click(limpiar[1])
    expect(contador()).toHaveTextContent('5 de 5 cursos')
    expect(screen.getByLabelText('Período')).toHaveValue('')
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).toBeNull()
  })

  test('todas las columnas se ordenan con aria-sort', async () => {
    await abrir()
    await screen.findByRole('table')
    for (const columna of [
      'Universidad',
      'Código',
      'Curso',
      'Carrera',
      'Período',
      'Secciones',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: columna }),
      ).toHaveAttribute('aria-sort', 'none')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Código' }))
    expect(codigos()).toEqual(['ENF101', 'ICC101', 'ICC201'])
    expect(
      screen.getByRole('columnheader', { name: 'Código' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(screen.getByRole('button', { name: 'Secciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Secciones' }))
    expect(codigos()[0]).toBe('ICC201')
    expect(
      screen.getByRole('columnheader', { name: 'Secciones' }),
    ).toHaveAttribute('aria-sort', 'descending')
  })

  test('pagina de a 25 con Anterior y Siguiente', async () => {
    const muchos = Array.from({ length: 30 }, (_, i) =>
      curso(`C${String(i + 1).padStart(3, '0')}`, `Curso ${i + 1}`),
    )
    await abrir(muchos)
    await screen.findByRole('table')
    expect(codigos()).toHaveLength(25)
    const paginacion = within(
      screen.getByRole('navigation', { name: 'Paginación' }),
    )
    expect(paginacion.getByText('Página 1 de 2')).toBeInTheDocument()
    expect(paginacion.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    fireEvent.click(paginacion.getByRole('button', { name: 'Siguiente' }))
    expect(codigos()).toHaveLength(5)
    expect(paginacion.getByText('Página 2 de 2')).toBeInTheDocument()
    // Un filtro nuevo vuelve a la primera página.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'Curso' },
    })
    expect(codigos()).toHaveLength(25)
  })

  test('el código es un enlace sin negrita ni subrayado fijo', async () => {
    await abrir()
    const enlace = await screen.findByRole('link', { name: 'ICC101' })
    expect(enlace).toHaveAttribute('href', '/cursos/c-ICC101')
    expect(enlace).toHaveClass('font-medium', 'no-underline', 'hover:underline')
    expect(enlace).not.toHaveClass('font-semibold')
  })

  test('mientras carga muestra esqueletos', async () => {
    await renderConSesion('DIRECTOR', '/cursos', {
      '/api/cursos': () => new Promise(() => {}),
    })
    expect(await screen.findByText('Cargando cursos…')).toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-slot=data-table-carga]').length,
    ).toBeGreaterThan(0)
  })
})
