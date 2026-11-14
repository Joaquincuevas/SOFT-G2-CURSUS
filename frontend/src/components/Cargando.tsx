import { CursusLogo } from '@/components/brand/CursusLogo'
import './estados.css'

interface Props {
  texto?: string
  // Centrado en toda la ventana, para cuando todavía no hay App Shell.
  pantallaCompleta?: boolean
}

// Indicador de carga accesible: los lectores de pantalla anuncian el texto.
export function Cargando({ texto = 'Cargando…', pantallaCompleta }: Props) {
  const indicador = (
    <div className="cargando" role="status" aria-live="polite">
      <span className="cargando__spinner" aria-hidden="true" />
      {texto}
    </div>
  )
  return pantallaCompleta ? (
    <div className="estado-pagina flex-col gap-6">
      <CursusLogo size={56} className="text-primary" />
      {indicador}
    </div>
  ) : (
    indicador
  )
}
