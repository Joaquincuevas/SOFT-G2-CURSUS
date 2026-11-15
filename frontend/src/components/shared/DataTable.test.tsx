import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Button } from '@/components/ui/button'
import { DataTable, type Columna } from './DataTable'
import { EmptyState } from './EmptyState'

interface Alumno {
  id: string
  nombre: string
  nota: number | null
  ingreso: string | null
}

const ALUMNOS: Alumno[] = [
  { id: 'a', nombre: 'Valentina Díaz', nota: 5.5, ingreso: '2026-03-02' },
  { id: 'b', nombre: 'Ana Soto', nota: 6.8, ingreso: '2025-03-04' },
  { id: 'c', nombre: 'Óscar Peña', nota: null, ingreso: null },
  { id: 'd', nombre: 'Benjamín Rojas', nota: 4.1, ingreso: '2026-08-10' },
]

const COLUMNAS: Columna<Alumno>[] = [
  {
    clave: 'nombre',
    encabezado: 'Alumno',
    celda: (a) => a.nombre,
    valor: (a) => a.nombre,
  },
  {
    clave: 'nota',
    encabezado: 'Nota',
    celda: (a) => (a.nota === null ? '—' : a.nota.toFixed(1)),
    valor: (a) => a.nota,
  },
  {
    clave: 'ingreso',
    encabezado: 'Ingreso',
    celda: (a) => a.ingreso ?? '—',
    valor: (a) => (a.ingreso ? new Date(a.ingreso) : null),
  },
  {
    clave: 'acciones',
    encabezado: 'Acciones',
    celda: () => <Button>Ver</Button>,
  },
]

const tabla = (props: Partial<Parameters<typeof DataTable<Alumno>>[0]> = {}) =>
  render(
    <DataTable
      etiqueta="Alumnos de la sección"
      columnas={COLUMNAS}
      filas={ALUMNOS}
      claveFila={(a) => a.id}
      {...props}
    />,
  )

const nombres = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[0].textContent)

describe('DataTable', () => {
  test('es una tabla con nombre, encabezados de columna y una fila por registro', () => {
    tabla()
    expect(
      screen.getByRole('table', { name: 'Alumnos de la sección' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('columnheader').map((c) => c.textContent),
    ).toEqual(['Alumno', 'Nota', 'Ingreso', 'Acciones'])
    expect(nombres()).toEqual([
      'Valentina Díaz',
      'Ana Soto',
      'Óscar Peña',
      'Benjamín Rojas',
    ])
    expect(screen.getAllByRole('button', { name: 'Ver' })).toHaveLength(4)
  })

  test('solo las columnas con valor se pueden ordenar', () => {
    tabla()
    expect(screen.getByRole('button', { name: 'Alumno' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acciones' })).toBeNull()
    expect(
      screen.getByRole('columnheader', { name: 'Acciones' }),
    ).not.toHaveAttribute('aria-sort')
  })

  test('un clic ordena de menor a mayor, otro de mayor a menor y el tercero lo quita', () => {
    tabla()
    const boton = screen.getByRole('button', { name: 'Alumno' })
    const cabecera = screen.getByRole('columnheader', { name: 'Alumno' })
    expect(cabecera).toHaveAttribute('aria-sort', 'none')

    fireEvent.click(boton)
    expect(cabecera).toHaveAttribute('aria-sort', 'ascending')
    // Con acentos y mayúsculas, como en español: Ana, Benjamín, Óscar, Valentina.
    expect(nombres()).toEqual([
      'Ana Soto',
      'Benjamín Rojas',
      'Óscar Peña',
      'Valentina Díaz',
    ])

    fireEvent.click(boton)
    expect(cabecera).toHaveAttribute('aria-sort', 'descending')
    expect(nombres()).toEqual([
      'Valentina Díaz',
      'Óscar Peña',
      'Benjamín Rojas',
      'Ana Soto',
    ])

    fireEvent.click(boton)
    expect(cabecera).toHaveAttribute('aria-sort', 'none')
    expect(nombres()[0]).toBe('Valentina Díaz')
  })

  test('ordena números y fechas, y deja las filas sin valor al final en los dos sentidos', () => {
    tabla()
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }))
    expect(nombres()).toEqual([
      'Benjamín Rojas',
      'Valentina Díaz',
      'Ana Soto',
      'Óscar Peña',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }))
    expect(nombres()).toEqual([
      'Ana Soto',
      'Valentina Díaz',
      'Benjamín Rojas',
      'Óscar Peña',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Ingreso' }))
    expect(nombres()).toEqual([
      'Ana Soto',
      'Valentina Díaz',
      'Benjamín Rojas',
      'Óscar Peña',
    ])
  })

  test('cambiar de columna reinicia en menor a mayor; ordenInicial parte ordenada', () => {
    tabla({ ordenInicial: { clave: 'nota', direccion: 'desc' } })
    expect(screen.getByRole('columnheader', { name: 'Nota' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(nombres()[0]).toBe('Ana Soto')
    fireEvent.click(screen.getByRole('button', { name: 'Alumno' }))
    expect(
      screen.getByRole('columnheader', { name: 'Alumno' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: 'Nota' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  test('el botón de orden se maneja con el teclado: es un botón con foco', () => {
    tabla()
    const boton = screen.getByRole('button', { name: 'Alumno' })
    expect(boton.tagName).toBe('BUTTON')
    expect(boton).toHaveAttribute('type', 'button')
    boton.focus()
    expect(boton).toHaveFocus()
    expect(boton).toHaveClass('focus-visible:ring-2')
  })

  test('no modifica el arreglo que recibe', () => {
    const filas = [...ALUMNOS]
    tabla({ filas })
    fireEvent.click(screen.getByRole('button', { name: 'Alumno' }))
    expect(filas.map((a) => a.id)).toEqual(ALUMNOS.map((a) => a.id))
  })

  test('sin filas muestra el estado vacío por defecto, en una fila de ancho completo', () => {
    tabla({ filas: [] })
    expect(screen.getByText('No hay datos para mostrar.')).toBeInTheDocument()
    expect(screen.getByRole('cell')).toHaveAttribute('colspan', '4')
  })

  test('acepta su propio estado vacío', () => {
    tabla({
      filas: [],
      vacio: <EmptyState mensaje="Aún no hay alumnos inscritos." />,
    })
    expect(
      screen.getByText('Aún no hay alumnos inscritos.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No hay datos para mostrar.')).toBeNull()
  })

  test('cargando muestra esqueletos en vez de filas, lo anuncia y marca la tabla como ocupada', () => {
    const { container } = tabla({ cargando: true, filasDeCarga: 3 })
    expect(
      container.querySelectorAll('[data-slot="data-table-carga"]'),
    ).toHaveLength(3)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      12,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Ana Soto')).toBeNull()
    expect(screen.queryByText('No hay datos para mostrar.')).toBeNull()
  })

  test('cargada no queda ocupada ni con el aviso', () => {
    tabla()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy')
  })
})
