import {
  COLOR_CURSUS,
  type CrearUniversidad,
  LARGO_DOMINIO_CORREO,
  LARGO_NOMBRE_UNIVERSIDAD,
} from '@cursus/shared'
import { type FormEvent, useId, useState } from 'react'

interface Props {
  // Datos actuales al editar; sin ellos, el formulario crea una universidad.
  inicial?: CrearUniversidad
  titulo: string
  textoBoton: string
  // Devuelve el error a mostrar, o null si se guardó.
  onGuardar: (datos: CrearUniversidad) => Promise<string | null>
  onCancelar?: () => void
}

// GES-23: nombre, dominio de correo y color de una universidad. Usa los
// estilos de Carreras (la página que la contiene importa Carreras.css).
export function FormularioUniversidad({
  inicial,
  titulo,
  textoBoton,
  onGuardar,
  onCancelar,
}: Props) {
  const id = useId()
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [dominio, setDominio] = useState(inicial?.dominioCorreo ?? '')
  const [color, setColor] = useState(inicial?.color ?? COLOR_CURSUS)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const resultado = await onGuardar({
      nombre: nombre.trim().replace(/\s+/gu, ' '),
      dominioCorreo: dominio.trim().toLowerCase(),
      color: color.toLowerCase(),
    })
    setError(resultado)
    setGuardando(false)
  }

  return (
    <form
      className="carreras__panel carreras__formulario"
      aria-label={titulo}
      onSubmit={(event) => void guardar(event)}
    >
      <h2>{titulo}</h2>
      {error && (
        <p className="carreras__error" role="alert">
          {error}
        </p>
      )}
      <label htmlFor={`${id}-nombre`}>Nombre</label>
      <input
        id={`${id}-nombre`}
        value={nombre}
        onChange={(event) => setNombre(event.target.value)}
        maxLength={LARGO_NOMBRE_UNIVERSIDAD}
        required
        disabled={guardando}
      />
      <label htmlFor={`${id}-dominio`}>Dominio del correo</label>
      <input
        id={`${id}-dominio`}
        value={dominio}
        onChange={(event) => setDominio(event.target.value)}
        maxLength={LARGO_DOMINIO_CORREO}
        placeholder="universidad.cl"
        aria-describedby={`${id}-dominio-ayuda`}
        required
        disabled={guardando}
      />
      <p id={`${id}-dominio-ayuda`}>
        Los correos de sus usuarios terminan en @dominio. Solo se puede cambiar
        mientras la universidad no tenga usuarios.
      </p>
      <label htmlFor={`${id}-color`}>Color</label>
      <input
        id={`${id}-color`}
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        disabled={guardando}
      />
      <div className="carreras__acciones">
        <button
          className="carreras__primario"
          type="submit"
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        {onCancelar && (
          <button
            className="carreras__secundario"
            type="button"
            disabled={guardando}
            onClick={onCancelar}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
