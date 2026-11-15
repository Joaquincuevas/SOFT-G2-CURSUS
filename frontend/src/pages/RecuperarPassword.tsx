import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import { CircleCheck, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { AlertaAcceso } from '@/components/AlertaAcceso'
import { AuthLayout } from '@/components/AuthLayout'
import { CampoPassword } from '@/components/CampoPassword'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RecuperarPassword({
  restablecer = false,
}: {
  restablecer?: boolean
}) {
  const token = useLocation().hash.slice(1)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string>()
  // Las contraseñas que no coinciden marcan la confirmación como inválida.
  const [noCoincide, setNoCoincide] = useState(false)
  const invalido = restablecer && !/^[a-f0-9]{64}$/.test(token)
  const titulo = restablecer
    ? 'Define tu nueva contraseña'
    : 'Recupera tu contraseña'

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const passwordNueva = datos.get('passwordNueva')
    if (restablecer && passwordNueva !== datos.get('confirmacion')) {
      setNoCoincide(true)
      setError('Las contraseñas deben coincidir.')
      return
    }
    setNoCoincide(false)
    setEnviando(true)
    setError(undefined)
    try {
      const ruta = restablecer ? 'restablecer-password' : 'recuperar-password'
      const respuesta = await fetch(`/api/auth/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          restablecer
            ? { token, passwordNueva }
            : { correo: String(datos.get('correo')).trim() },
        ),
      })
      if (!respuesta.ok) {
        setError(
          restablecer && respuesta.status === 400
            ? 'El enlace es inválido o expiró. Solicita uno nuevo.'
            : 'No pudimos completar la solicitud. Intenta nuevamente.',
        )
        return
      }
      setEnviado(true)
      if (restablecer)
        window.history.replaceState(
          window.history.state,
          '',
          '/restablecer-password',
        )
    } catch {
      setError('No pudimos completar la solicitud. Intenta nuevamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      titulo={titulo}
      descripcion={
        restablecer
          ? 'Elige una contraseña nueva para tu cuenta.'
          : 'Ingresa tu correo institucional y te enviaremos un enlace para elegir una contraseña nueva.'
      }
      pie={
        <div className="grid justify-items-start gap-1">
          {restablecer && !enviado && (
            <Button
              asChild
              variant="link"
              className="h-auto p-0 text-base font-medium underline"
            >
              <Link to="/recuperar-password">Solicitar un nuevo enlace</Link>
            </Button>
          )}
          <Button
            asChild
            variant="link"
            className="h-auto p-0 text-base font-medium underline"
          >
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </div>
      }
    >
      {enviado ? (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>
            {restablecer
              ? 'Contraseña actualizada. Ya puedes iniciar sesión.'
              : 'Si existe una cuenta asociada a ese correo, recibirás un enlace de recuperación.'}
          </AlertDescription>
        </Alert>
      ) : invalido ? (
        <AlertaAcceso variante="danger">
          El enlace es inválido o expiró. Solicita uno nuevo.
        </AlertaAcceso>
      ) : (
        <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
          <CardContent className="px-0">
            <form
              className="grid gap-6"
              onSubmit={(event) => void enviar(event)}
            >
              {error && (
                <AlertaAcceso variante="danger" id="recuperar-error">
                  {error}
                </AlertaAcceso>
              )}
              {restablecer ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="restablecer-nueva" className="text-base">
                      Nueva contraseña
                    </Label>
                    <CampoPassword
                      id="restablecer-nueva"
                      etiqueta="Nueva contraseña"
                      name="passwordNueva"
                      autoComplete="new-password"
                      minLength={LARGO_MINIMO_PASSWORD}
                      maxLength={LARGO_MAXIMO_PASSWORD}
                      aria-describedby="restablecer-requisito"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="restablecer-confirmacion"
                      className="text-base"
                    >
                      Confirma la contraseña
                    </Label>
                    <CampoPassword
                      id="restablecer-confirmacion"
                      etiqueta="Confirma la contraseña"
                      name="confirmacion"
                      autoComplete="new-password"
                      maxLength={LARGO_MAXIMO_PASSWORD}
                      aria-invalid={noCoincide ? true : undefined}
                      aria-describedby={error ? 'recuperar-error' : undefined}
                      required
                    />
                  </div>
                  <p
                    id="restablecer-requisito"
                    className="m-0 text-sm text-muted-foreground"
                  >
                    Debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres.
                  </p>
                </>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="recuperar-correo" className="text-base">
                    Correo institucional
                  </Label>
                  <Input
                    id="recuperar-correo"
                    name="correo"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    className="h-14 px-4 text-base md:text-base"
                    aria-describedby={error ? 'recuperar-error' : undefined}
                    required
                  />
                </div>
              )}
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
                {restablecer ? 'Guardar contraseña' : 'Enviar enlace'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </AuthLayout>
  )
}
