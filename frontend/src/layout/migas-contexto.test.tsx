import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { MigasProvider } from './MigasProvider'
import { useMigaActual, usePublicarMigaActual } from './migas-contexto'

function Sonda() {
  return <p data-testid="actual">{useMigaActual() ?? 'ninguna'}</p>
}
function Publica({ etiqueta }: { etiqueta: string }) {
  usePublicarMigaActual(etiqueta)
  return null
}

describe('último paso del breadcrumb', () => {
  test('fuera del AppShell no hay ninguno', () => {
    render(<Sonda />)
    expect(screen.getByTestId('actual')).toHaveTextContent('ninguna')
  })

  test('el encabezado lo publica, lo actualiza y lo retira al desmontarse', () => {
    const { rerender } = render(
      <MigasProvider>
        <Publica etiqueta="Mis Cursos" />
        <Sonda />
      </MigasProvider>,
    )
    expect(screen.getByTestId('actual')).toHaveTextContent('Mis Cursos')
    rerender(
      <MigasProvider>
        <Publica etiqueta="Períodos" />
        <Sonda />
      </MigasProvider>,
    )
    expect(screen.getByTestId('actual')).toHaveTextContent('Períodos')
    rerender(
      <MigasProvider>
        <Sonda />
      </MigasProvider>,
    )
    expect(screen.getByTestId('actual')).toHaveTextContent('ninguna')
  })
})
