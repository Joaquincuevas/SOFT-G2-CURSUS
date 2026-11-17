import { Loader2 } from 'lucide-react'
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { AlertaAcceso } from '@/components/AlertaAcceso'
import { AuthLayout } from '@/components/AuthLayout'
import { CampoPassword } from '@/components/CampoPassword'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Cargando } from '../components/Cargando'
import { AVISO_SESION_EXPIRADA, useAuth, type ResultadoMfa } from '../auth/auth'
import { destinoTrasLogin } from '../auth/retorno'
import { SessionContext } from '../session/session'

const MENSAJE_EXPIRADO =
  'La verificación expiró. Vuelve a ingresar tu correo y contraseña.'
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ErroresDeCampo {
  correo?: string
  password?: string
}

// Tarjeta de las pantallas de acceso, con el aspecto del Figma (nodo 66:2).
function TarjetaAcceso({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  )
}

// Pantalla de login del Figma (nodo 66:2).
export function Login() {
  const { token, aviso, mismoUsuario, iniciarSesion, completarMfa } = useAuth()
  const sesion = useContext(SessionContext)
  const location = useLocation()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Un campo vacío o con un correo mal escrito se avisa junto al campo, sin
  // pedirle nada a la API.
  const [errores, setErrores] = useState<ErroresDeCampo>({})
  // SEG-02: el desafío del paso 1 cuando la cuenta tiene MFA. Con él se pide
  // el código; la contraseña no se guarda.
  const [desafio, setDesafio] = useState<string | null>(null)
  const [correo, setCorreo] = useState('')
  const correoRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Con la sesión lista vuelve a la ruta que pidió RequireAuth si corresponde
  // (ver destinoTrasLogin); si no, al Dashboard.
  if (token) {
    if (!sesion) return <Cargando pantallaCompleta />
    const { from } = (location.state as { from?: unknown } | null) ?? {}
    return (
      <Navigate
        to={destinoTrasLogin(from, mismoUsuario, sesion.ability)}
        replace
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const correoIngresado = String(datos.get('correo'))
    const password = String(datos.get('password'))

    const invalidos: ErroresDeCampo = {}
    if (!correoIngresado.trim()) {
      invalidos.correo = 'Ingresa tu correo institucional.'
    } else if (!FORMATO_CORREO.test(correoIngresado.trim())) {
      invalidos.correo =
        'Ingresa un correo válido, por ejemplo pedro.soto@universidad.cl.'
    }
    if (!password) invalidos.password = 'Ingresa tu contraseña.'
    setErrores(invalidos)
    if (invalidos.correo || invalidos.password) {
      setError(null)
      if (invalidos.correo) correoRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }

    setEnviando(true)
    setError(null)
    const ok = await iniciarSesion(correoIngresado, password)
    if (typeof ok === 'object') {
      setCorreo(correoIngresado)
      setDesafio(ok.desafio)
      setEnviando(false)
      return
    }
    if (!ok) {
      setError(
        'No pudimos iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.',
      )
      setEnviando(false)
      // Conserva el correo para reintentar, pero descarta la contraseña.
      if (passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
    }
  }

  if (desafio) {
    return (
      <VerificacionMfa
        desafio={desafio}
        completarMfa={completarMfa}
        volver={(mensaje) => {
          setDesafio(null)
          setError(mensaje)
          setEnviando(false)
        }}
        aviso={aviso}
      />
    )
  }

  // Un aviso de la sesión (expiró) es informativo; cualquier otro, como el de
  // demasiados intentos, es un bloqueo. Un mensaje de error es un error.
  const mensaje = aviso || error
  const variante: 'danger' | 'warning' | 'info' = aviso
    ? aviso === AVISO_SESION_EXPIRADA
      ? 'info'
      : 'warning'
    : error === MENSAJE_EXPIRADO
      ? 'info'
      : 'danger'
  const idMensaje = mensaje ? 'login-error' : undefined
  const credencialesInvalidas = variante === 'danger' && error !== null
  const descritoPor = (idCampo: string | undefined) =>
    [idCampo, idMensaje].filter(Boolean).join(' ') || undefined

  return (
    <AuthLayout
      titulo="Bienvenido a CURSUS"
      descripcion="Ingresa con tus credenciales institucionales."
      pie={
        <p className="m-0 text-sm text-muted-foreground">
          CURSUS · Plataforma web de gestión académica
        </p>
      }
    >
      <TarjetaAcceso>
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          <p className="m-0 text-sm text-muted-foreground">
            Usa el correo institucional asociado a tu universidad.
          </p>
          {mensaje && (
            <AlertaAcceso variante={variante} id="login-error">
              {mensaje}
            </AlertaAcceso>
          )}
          <div className="grid gap-2">
            <Label htmlFor="login-correo" className="text-base">
              Correo institucional
            </Label>
            <Input
              ref={correoRef}
              id="login-correo"
              name="correo"
              type="email"
              autoComplete="username"
              defaultValue={correo}
              placeholder="pedro.soto@universidad.cl"
              className="h-14 px-4 text-base md:text-base"
              aria-invalid={
                Boolean(errores.correo) || credencialesInvalidas
                  ? true
                  : undefined
              }
              aria-describedby={descritoPor(
                errores.correo ? 'login-correo-error' : undefined,
              )}
              onChange={() => {
                if (errores.correo)
                  setErrores((e) => ({ ...e, correo: undefined }))
              }}
              required
            />
            {errores.correo && (
              <p
                id="login-correo-error"
                className="m-0 text-base text-destructive"
              >
                {errores.correo}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login-password" className="text-base">
              Contraseña
            </Label>
            <CampoPassword
              ref={passwordRef}
              id="login-password"
              etiqueta="Contraseña"
              name="password"
              autoComplete="current-password"
              placeholder="Ingresa tu contraseña"
              aria-invalid={
                Boolean(errores.password) || credencialesInvalidas
                  ? true
                  : undefined
              }
              aria-describedby={descritoPor(
                errores.password ? 'login-password-error' : undefined,
              )}
              onChange={() => {
                if (errores.password)
                  setErrores((e) => ({ ...e, password: undefined }))
              }}
              required
            />
            {errores.password && (
              <p
                id="login-password-error"
                className="m-0 text-base text-destructive"
              >
                {errores.password}
              </p>
            )}
          </div>
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
            Ingresar
          </Button>
          <Button
            asChild
            variant="link"
            className="h-auto justify-start p-0 text-base font-medium underline"
          >
            <Link to="/recuperar-password">¿Olvidaste tu contraseña?</Link>
          </Button>
          <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2 flex-none rounded-full bg-accent"
            />
            Acceso reservado a usuarios autorizados.
          </p>
        </form>
      </TarjetaAcceso>
    </AuthLayout>
  )
}

// SEG-02: segundo paso del login con MFA. El código tiene 6 dígitos (la app lo
// muestra como «123 456»; los espacios se ignoran).
function VerificacionMfa({
  desafio,
  completarMfa,
  volver,
  aviso,
}: {
  desafio: string
  completarMfa: (desafio: string, codigo: string) => Promise<ResultadoMfa>
  volver: (mensaje: string | null) => void
  aviso: string | null
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tras un 429, el formulario queda cerrado: reintentar solo alarga la espera.
  const [bloqueado, setBloqueado] = useState(false)
  const codigoRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    codigoRef.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const codigo = String(
      new FormData(event.currentTarget).get('codigo'),
    ).replace(/\s/g, '')
    if (!/^\d{6}$/.test(codigo)) {
      setError('Ingresa los 6 dígitos del código de tu app autenticadora.')
      codigoRef.current?.focus()
      return
    }
    setEnviando(true)
    setError(null)
    const resultado = await completarMfa(desafio, codigo)
    if (resultado === 'ok') return
    if (resultado === 'desafio') return volver(MENSAJE_EXPIRADO)
    setEnviando(false)
    if (resultado === 'limitado') {
      setBloqueado(true)
      return
    }
    setError(
      resultado === 'codigo'
        ? 'El código no es válido o ya expiró. Ingresa el código actual de tu app.'
        : 'No pudimos verificar el código. Inténtalo nuevamente.',
    )
    if (codigoRef.current) {
      codigoRef.current.value = ''
      codigoRef.current.focus()
    }
  }

  const mensaje = bloqueado ? aviso : error
  return (
    <AuthLayout
      titulo="Verificación en dos pasos"
      descripcion="Ingresa el código de 6 dígitos de tu app autenticadora."
    >
      <TarjetaAcceso>
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          {mensaje && (
            <AlertaAcceso
              variante={bloqueado ? 'warning' : 'danger'}
              id="mfa-error"
            >
              {mensaje}
            </AlertaAcceso>
          )}
          <div className="grid gap-2">
            <Label htmlFor="mfa-codigo" className="text-base">
              Código de verificación
            </Label>
            <Input
              ref={codigoRef}
              id="mfa-codigo"
              name="codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              placeholder="123 456"
              disabled={bloqueado}
              className="h-14 px-4 text-base tracking-widest md:text-base"
              aria-invalid={error ? true : undefined}
              aria-describedby={mensaje ? 'mfa-error' : undefined}
            />
          </div>
          <Button
            type="submit"
            disabled={enviando || bloqueado}
            className="h-14 w-full text-base"
          >
            {enviando && (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {enviando ? 'Verificando…' : 'Verificar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 w-full text-base"
            onClick={() => volver(null)}
          >
            Volver al inicio de sesión
          </Button>
        </form>
      </TarjetaAcceso>
    </AuthLayout>
  )
}
