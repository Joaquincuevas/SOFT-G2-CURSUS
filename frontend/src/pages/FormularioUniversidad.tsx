import {
  COLOR_CURSUS,
  colorConContraste,
  type CrearUniversidad,
  LARGO_DOMINIO_CORREO,
  LARGO_NOMBRE_UNIVERSIDAD,
  MENSAJE_COLOR_CONTRASTE,
} from '@cursus/shared'
import { CircleAlert, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { FormField } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  // Datos actuales al editar; sin ellos, el formulario crea una universidad.
  inicial?: CrearUniversidad
  titulo: string
  textoBoton: string
  // Devuelve el error a mostrar, o null si se guardó.
  onGuardar: (datos: CrearUniversidad) => Promise<string | null>
  onCancelar?: () => void
}

// GES-23: nombre, dominio de correo y color de una universidad. Se usa al
// crearla (Dashboard del superadmin) y al editarla (Administrar universidad).
export function FormularioUniversidad({
  inicial,
  titulo,
  textoBoton,
  onGuardar,
  onCancelar,
}: Props) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [dominio, setDominio] = useState(inicial?.dominioCorreo ?? '')
  const [color, setColor] = useState(inicial?.color ?? COLOR_CURSUS)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [colorInvalido, setColorInvalido] = useState(false)

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!colorConContraste(color)) {
      setError(MENSAJE_COLOR_CONTRASTE)
      setColorInvalido(true)
      return
    }
    setGuardando(true)
    setError(null)
    setColorInvalido(false)
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
      className="grid max-w-2xl gap-5 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
      aria-label={titulo}
      onSubmit={(event) => void guardar(event)}
    >
      <h2 className="m-0 text-lg font-semibold text-foreground">{titulo}</h2>
      {error && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField etiqueta="Nombre">
        {(control) => (
          <Input
            {...control}
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            maxLength={LARGO_NOMBRE_UNIVERSIDAD}
            required
            disabled={guardando}
          />
        )}
      </FormField>
      <FormField
        etiqueta="Dominio del correo"
        ayuda="Los correos de sus usuarios terminan en @dominio. Solo se puede cambiar mientras la universidad no tenga usuarios."
      >
        {(control) => (
          <Input
            {...control}
            value={dominio}
            onChange={(event) => setDominio(event.target.value)}
            maxLength={LARGO_DOMINIO_CORREO}
            placeholder="universidad.cl"
            required
            disabled={guardando}
          />
        )}
      </FormField>
      <FormField
        etiqueta="Color"
        ayuda="Se usa en botones, menú y encabezado. Elige un tono oscuro para mantener el texto legible; el contraste mínimo es 4,5:1 (WCAG AA)."
      >
        {(control) => (
          <div className="flex items-center gap-3">
            <Input
              {...control}
              type="color"
              className="h-10 w-20 cursor-pointer p-1"
              aria-invalid={colorInvalido || undefined}
              value={color}
              onChange={(event) => {
                setColor(event.target.value)
                setColorInvalido(false)
              }}
              disabled={guardando}
            />
            <span className="text-sm text-muted-foreground tabular-nums">
              {color.toLowerCase()}
            </span>
          </div>
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={guardando}>
          {guardando && <Loader2 aria-hidden="true" className="animate-spin" />}
          {guardando ? 'Guardando…' : textoBoton}
        </Button>
        {onCancelar && (
          <Button
            type="button"
            variant="outline"
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
