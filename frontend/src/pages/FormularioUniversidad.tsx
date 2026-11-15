import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  COLOR_CURSUS,
  colorConContraste,
  type CrearUniversidad,
  LARGO_DOMINIO_CORREO,
  LARGO_NOMBRE_UNIVERSIDAD,
  MENSAJE_COLOR_CONTRASTE,
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

// GES-23: nombre, dominio de correo y color de una universidad.
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
    if (!colorConContraste(color)) {
      setError(MENSAJE_COLOR_CONTRASTE)
      return
    }
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
      className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_p]:m-0 [&_p]:text-sm"
      aria-label={titulo}
      onSubmit={(event) => void guardar(event)}
    >
      <h2>{titulo}</h2>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Label htmlFor={`${id}-nombre`}>Nombre</Label>
      <Input
        id={`${id}-nombre`}
        value={nombre}
        onChange={(event) => setNombre(event.target.value)}
        maxLength={LARGO_NOMBRE_UNIVERSIDAD}
        required
        disabled={guardando}
      />
      <Label htmlFor={`${id}-dominio`}>Dominio del correo</Label>
      <Input
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
      <Label htmlFor={`${id}-color`}>Color</Label>
      <Input
        id={`${id}-color`}
        type="color"
        aria-describedby={`${id}-color-ayuda`}
        value={color}
        onChange={(event) => setColor(event.target.value)}
        disabled={guardando}
      />
      <p id={`${id}-color-ayuda`}>
        Se usa en botones, menú y encabezado. Elige un tono oscuro para mantener
        el texto legible; el contraste mínimo es 4,5:1 (WCAG AA).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </Button>
        {onCancelar && (
          <Button
            variant="outline"
            type="button"
            disabled={guardando}
            onClick={onCancelar}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
