import '../pages/Login.css'

// Panel de marca del login del Figma (nodo 66:2). También lo usa la pantalla
// del cambio obligatorio de contraseña (PER-03), que no está en el Figma.
export function PanelMarca() {
  return (
    <aside className="login__brand">
      <div className="login__brand-top">
        <p className="login__logo">CURSUS</p>
        <span className="login__accent" aria-hidden="true" />
      </div>
      <div className="login__brand-message">
        <p className="login__brand-title">
          Gestión académica,
          <br />
          en un solo lugar.
        </p>
        <p className="login__brand-text">
          CURSUS centraliza cursos, materiales, notas y seguimiento académico
          para cada universidad.
        </p>
      </div>
      <p className="login__caption login__caption--brand">
        Sistema de Gestión Académica
      </p>
    </aside>
  )
}
