import {
  DIGITOS_CODIGO_MFA,
  type ConfirmarMfa,
  type EstadoMfa,
  type InicioMfa,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

const NO_DISPONIBLE =
  'La verificación en dos pasos no está disponible por ahora. Intenta más tarde.'

// La clave de 32 caracteres se lee mejor en grupos de cuatro, como la muestran
// las apps. Los espacios no importan al ingresarla.
const agrupar = (secreto: string) => secreto.match(/.{1,4}/g)?.join(' ') ?? ''

const sinEspacios = (texto: string) => texto.replace(/\s/g, '')

// SEG-01. Activación del MFA desde el perfil, para todos los roles (como el
// cambio de contraseña, también el Director). El Figma no tiene esta
// pantalla: sigue la tarjeta del cambio de contraseña. Pedir el código al
// iniciar sesión es SEG-02.
export function ActivarMfa() {
  const { fetchConSesion } = useAuth()
  const [estado, recargar, , fijarEstado] =
    useDatos<EstadoMfa>('/api/perfil/mfa')
  const [inicio, setInicio] = useState<InicioMfa | null>(null)
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generarQr() {
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/perfil/mfa/inicio', {
        method: 'POST',
      })
      if (respuesta.ok) {
        setInicio((await respuesta.json()) as InicioMfa)
        setCodigo('')
      } else if (respuesta.status === 409) {
        // Se activó en otra pestaña.
        fijarEstado({ activo: true })
      } else if (respuesta.status === 503) {
        setError(NO_DISPONIBLE)
      } else if (respuesta.status !== 401) {
        // Con 401 la sesión ya se cerró y la app volvió al login.
        setError('No se pudo generar el código QR. Intenta de nuevo.')
      }
    } catch {
      setError('No se pudo generar el código QR. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const limpio = sinEspacios(codigo)
    if (!new RegExp(`^\\d{${DIGITOS_CODIGO_MFA}}$`).test(limpio)) {
      setError(
        `Ingresa los ${DIGITOS_CODIGO_MFA} dígitos que muestra tu app autenticadora.`,
      )
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/perfil/mfa/confirmacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: limpio } satisfies ConfirmarMfa),
      })
      if (respuesta.ok) {
        setInicio(null)
        fijarEstado({ activo: true })
        return
      }
      const { message } = (await respuesta.json().catch(() => ({}))) as {
        message?: string
      }
      if (
        respuesta.status === 400 &&
        message === 'Primero genera el código QR'
      ) {
        // El QR pendiente ya no existe: hay que generar uno nuevo.
        setInicio(null)
        setError('El código QR expiró. Genera uno nuevo e intenta de nuevo.')
      } else if (respuesta.status === 400) {
        setCodigo('')
        setError(
          'El código no es válido. Revisa que la hora de tu teléfono esté bien e intenta con el código nuevo.',
        )
      } else if (
        respuesta.status === 409 &&
        message?.includes('ya está activa')
      ) {
        setInicio(null)
        fijarEstado({ activo: true })
      } else if (respuesta.status === 409) {
        // Se generó otro QR en otra pestaña.
        setInicio(null)
        setError(
          'El código QR cambió en otra pestaña. Genera uno nuevo e intenta de nuevo.',
        )
      } else if (respuesta.status === 503) {
        setError(NO_DISPONIBLE)
      } else if (respuesta.status !== 401) {
        setError('No se pudo activar la verificación. Intenta de nuevo.')
      }
    } catch {
      setError('No se pudo activar la verificación. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  function cancelar() {
    setInicio(null)
    setCodigo('')
    setError(null)
  }

  return (
    <section className="perfil__tarjeta" aria-labelledby="titulo-mfa">
      <h2 id="titulo-mfa" className="perfil__titulo">
        Verificación en dos pasos
      </h2>

      {estado === undefined && (
        <Cargando texto="Cargando la verificación en dos pasos…" />
      )}
      {estado === null && (
        <ErrorEstado
          mensaje="No pudimos cargar el estado de la verificación en dos pasos."
          onReintentar={recargar}
        />
      )}

      {/* Mismo estado al confirmar y al volver al perfil. El login todavía no
          pide el código: lo hará SEG-02, y la nota lo dice sin prometer más. */}
      {estado?.activo && (
        <>
          <p className="perfil__exito" role="status">
            App autenticadora configurada
          </p>
          <p className="perfil__nota">
            Cuando se habilite la verificación al iniciar sesión, te pediremos
            el código de tu app autenticadora cada vez que entres.
          </p>
        </>
      )}

      {estado && !estado.activo && !inicio && (
        <>
          <p className="perfil__nota">
            Agrega una capa extra de protección a tu cuenta con una app
            autenticadora, como Google Authenticator o Authy.
          </p>
          {error && (
            <p className="perfil__error" role="alert">
              {error}
            </p>
          )}
          <div>
            <button
              type="button"
              className="perfil__boton"
              onClick={() => void generarQr()}
              disabled={enviando}
            >
              {enviando ? 'Generando…' : 'Activar verificación en dos pasos'}
            </button>
          </div>
        </>
      )}

      {estado && !estado.activo && inicio && (
        <form className="perfil__mfa" onSubmit={confirmar}>
          <p className="perfil__nota">
            1. Escanea este código QR con tu app autenticadora.
          </p>
          <img
            className="perfil__qr"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(inicio.qr)}`}
            alt="Código QR para configurar tu app autenticadora"
            width={192}
            height={192}
          />
          <p className="perfil__nota">
            ¿No puedes escanearlo? Ingresa esta clave en la app:
          </p>
          <code className="perfil__clave">{agrupar(inicio.secreto)}</code>
          <label className="perfil__campo perfil__campo--codigo">
            2. Ingresa el código de {DIGITOS_CODIGO_MFA} dígitos que muestra la
            app
            <input
              className="perfil__input"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={codigo}
              onChange={(event) => {
                setCodigo(event.target.value)
                setError(null)
              }}
              maxLength={DIGITOS_CODIGO_MFA + 2}
              required
            />
          </label>
          {error && (
            <p className="perfil__error" role="alert">
              {error}
            </p>
          )}
          <div className="perfil__acciones">
            <button
              type="submit"
              className="perfil__boton"
              disabled={enviando || !sinEspacios(codigo)}
            >
              {enviando ? 'Confirmando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              className="perfil__boton perfil__boton--secundario"
              onClick={cancelar}
              disabled={enviando}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
