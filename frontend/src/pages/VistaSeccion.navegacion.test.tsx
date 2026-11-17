import type { SeccionResumen } from '@cursus/shared'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { describe, expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { SessionProvider } from '../session/SessionProvider'
import { json, simularBackend } from '../test/sesion'

const resumen = (
  id: string,
  numero: number,
  codigo: string,
): SeccionResumen => ({
  id,
  numero,
  curso: { id: `curso-${id}`, codigo, nombre: `Curso ${codigo}` },
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: null,
  profesores: [],
  ayudantes: [],
})
const A = resumen('seccion-a', 1, 'AAA101')
const B = resumen('seccion-b', 2, 'BBB202')

function IrAB() {
  const navegar = useNavigate()
  return (
    <button onClick={() => void navegar('/mis-cursos/secciones/seccion-b')}>
      Ir a B
    </button>
  )
}
const menu = () =>
  within(
    screen.getByRole('navigation', { name: 'Navegación principal' }),
  ).queryByRole('listitem', { name: /Menú del curso/ })

describe('el menú del curso al pasar de una sección a otra', () => {
  test('mientras llega el resumen de B no muestra el nombre de A con los enlaces de B', async () => {
    let responderB!: (r: Response) => void
    simularBackend('PROFESOR', {
      '/api/espacio/secciones/seccion-a/resumen': () => A,
      '/api/espacio/secciones/seccion-b/resumen': () =>
        new Promise<Response>((resolve) => {
          responderB = resolve
        }),
    })
    render(
      <MemoryRouter initialEntries={['/mis-cursos/secciones/seccion-a']}>
        <AuthProvider initialToken="jwt-de-prueba">
          <SessionProvider>
            <App />
            <IrAB />
          </SessionProvider>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(
      await within(
        await screen.findByRole('navigation', { name: 'Navegación principal' }),
      ).findByRole('listitem', { name: /Menú del curso AAA101/ }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a B' }))
    // Estado intermedio: B todavía no llega. Nada del curso A en el menú, ni
    // enlaces del curso con el id de B.
    expect(await screen.findByText('Cargando…')).toBeInTheDocument()
    expect(menu()).toBeNull()
    expect(screen.queryByRole('region', { name: 'Vista del curso' })).toBeNull()
    expect(
      document.querySelector('a[href^="/mis-cursos/secciones/seccion-b"]'),
    ).toBeNull()

    await act(async () => responderB(json(B)))
    const bloque = within(
      await within(
        screen.getByRole('navigation', { name: 'Navegación principal' }),
      ).findByRole('listitem', { name: /Menú del curso BBB202/ }),
    )
    expect(bloque.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/mis-cursos/secciones/seccion-b',
    )
    expect(bloque.getByText(/Sección 2/)).toBeInTheDocument()
  })
})
