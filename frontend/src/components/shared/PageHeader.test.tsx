import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test } from 'vitest'
import { MigasContext, useMigasDinamica } from '../../layout/migas-contexto'
import { MigasProvider } from '../../layout/MigasProvider'
import { PageHeader } from './PageHeader'

// El AppShell publica el último paso del breadcrumb (el h1 de la página).
function ConEncabezado({
  actual,
  children,
}: {
  actual: string | null
  children: ReactNode
}) {
  return (
    <MigasContext
      value={{
        dinamica: null,
        fijarDinamica: () => {},
        actual,
        fijarActual: () => {},
      }}
    >
      {children}
    </MigasContext>
  )
}

describe('PageHeader', () => {
  test('muestra el título como h2, la descripción y las acciones', () => {
    render(
      <PageHeader
        titulo="Cursos archivados"
        descripcion="Cursos cerrados de períodos anteriores."
        acciones={<button type="button">Exportar</button>}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Cursos archivados' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Cursos cerrados de períodos anteriores.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
  })

  test('no es un h1: ese lo pone el encabezado de la app', () => {
    render(<PageHeader titulo="Cursos archivados" />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  test('si el título repite el h1 del encabezado, no lo dibuja y deja la descripción y las acciones', () => {
    render(
      <ConEncabezado actual="  Mis   Cursos ">
        <PageHeader
          titulo="mis cursos"
          descripcion="Tus cursos del período."
          acciones={<button type="button">Nuevo</button>}
        />
      </ConEncabezado>,
    )
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('Tus cursos del período.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument()
  })

  test('si el título agrega algo al paso del encabezado, se muestra', () => {
    render(
      <ConEncabezado actual="Mis Cursos">
        <PageHeader titulo="Introducción a la Programación" />
      </ConEncabezado>,
    )
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Introducción a la Programación',
      }),
    ).toBeInTheDocument()
  })

  test('sin nada más que mostrar, un título repetido no deja un bloque vacío', () => {
    const { container } = render(
      <ConEncabezado actual="Períodos">
        <PageHeader titulo="Períodos" />
      </ConEncabezado>,
    )
    expect(container.querySelector('[data-slot="page-header"]')).toBeNull()
  })

  test('miga registra el nombre de la página en el breadcrumb mientras está montada', () => {
    function Sonda() {
      return <p data-testid="miga">{useMigasDinamica() ?? 'sin nombre'}</p>
    }
    const { unmount } = render(
      <MigasProvider>
        <Sonda />
        <PageHeader titulo="Sección" miga="ICC101 · Sección 1" />
      </MigasProvider>,
    )
    expect(screen.getByTestId('miga')).toHaveTextContent('ICC101 · Sección 1')
    unmount()
  })

  test('sin miga no pisa el nombre que puso otra parte de la página', () => {
    function Sonda() {
      return <p data-testid="miga">{useMigasDinamica() ?? 'sin nombre'}</p>
    }
    render(
      <MigasProvider>
        <Sonda />
        <PageHeader titulo="Sección" />
      </MigasProvider>,
    )
    expect(screen.getByTestId('miga')).toHaveTextContent('sin nombre')
  })
})
