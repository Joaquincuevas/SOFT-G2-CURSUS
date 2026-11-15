import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { AlertaAcceso } from '@/components/AlertaAcceso'
import { AuthLayout } from '@/components/AuthLayout'
import { CampoPassword } from '@/components/CampoPassword'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '../auth/auth'
import { useSession } from '../session/session'
import { useCambiarPassword } from './useCambiarPassword'

const CAMPOS = [
  {
    clave: 'actual',
    etiqueta: 'Contraseña provisoria',
    name: 'passwordActual',
    autoComplete: 'current-password',
  },
  {
    clave: 'nueva',
    etiqueta: 'Contraseña nueva',
    name: 'passwordNueva',
    autoComplete: 'new-password',
  },
  {
    clave: 'repetida',
    etiqueta: 'Repetir contraseña nueva',
    name: 'passwordRepetida',
    autoComplete: 'new-password',
  },
] as const

// Cambio obligatorio de la contraseña provisoria (PER-03). Es la única
// pantalla a la que entra un usuario con la marca (ver RequireAuth). El
// Figma no la tiene: usa el panel de marca y la tarjeta del login (nodo 66:2).
export function CambioObligatorio() {
  const { cerrarSesion } = useAuth()
  const { marcarPasswordCambiada } = useSession()
  const navigate = useNavigate()
  const { campos, cambiar, enviando, error, campoInvalido, handleSubmit } =
    useCambiarPassword(() => {
      marcarPasswordCambiada()
      void navigate('/', { replace: true })
    })
  // Demasiados intentos fallidos es un bloqueo; cualquier otro mensaje, un error.
  const bloqueado = error?.startsWith('Demasiados intentos') ?? false

  return (
    <AuthLayout
      titulo="Cambia tu contraseña"
      descripcion="Ingresaste con una contraseña provisoria. Para continuar, elige una nueva que solo tú conozcas."
      pie={
        <Button
          type="button"
          variant="link"
          className="justify-self-center text-base underline"
          onClick={() => void cerrarSesion()}
        >
          Cerrar sesión
        </Button>
      }
    >
      <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
        <CardContent className="px-0">
          <form onSubmit={handleSubmit} className="grid gap-6">
            {error && (
              <AlertaAcceso
                variante={bloqueado ? 'warning' : 'danger'}
                id="cambio-error"
              >
                {error}
              </AlertaAcceso>
            )}
            {CAMPOS.map(({ clave, etiqueta, name, autoComplete }) => (
              <div key={clave} className="grid gap-2">
                <Label htmlFor={`cambio-${clave}`}>{etiqueta}</Label>
                <CampoPassword
                  id={`cambio-${clave}`}
                  etiqueta={etiqueta}
                  name={name}
                  autoComplete={autoComplete}
                  value={campos[clave]}
                  onChange={(event) => cambiar(clave, event.target.value)}
                  maxLength={LARGO_MAXIMO_PASSWORD}
                  aria-invalid={campoInvalido === clave ? true : undefined}
                  aria-describedby={
                    [
                      clave === 'nueva' ? 'cambio-requisito' : null,
                      error ? 'cambio-error' : null,
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  required
                />
              </div>
            ))}
            <p
              id="cambio-requisito"
              className="m-0 text-sm text-muted-foreground"
            >
              Debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres.
            </p>
            <Button
              type="submit"
              disabled={enviando}
              className="h-14 w-full text-base"
            >
              {enviando && (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {enviando ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
