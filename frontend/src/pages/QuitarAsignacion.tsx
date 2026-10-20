import {
  LARGO_MOTIVO_ASIGNACION,
  type AsignacionQuitada,
  type AyudanteOpcion,
  type AyudanteQuitado,
  type QuitarAsignacion,
  type SeccionDetalle,
} from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export type TipoAsignacion = 'PROFESOR' | 'AYUDANTE'

// Mensaje de un 400 o 404 de la API (el ValidationPipe manda una lista).
function mensajeDe(cuerpo: { message?: unknown }): string | null {
  const [mensaje] = [cuerpo.message].flat()
  return typeof mensaje === 'string' ? mensaje : null
}

// Confirmación para quitar al profesor o a un ayudante de una sección (GES-14).
// El motivo es obligatorio: queda en el historial de asignaciones. Para un
// ayudante, se elige cuál quitar entre los asignados.
export function QuitarAsignacionDialogo({
  seccion,
  tipo,
  onQuitada,
  onCerrar,
}: {
  seccion: SeccionDetalle
  tipo: TipoAsignacion
  onQuitada: (resultado: AsignacionQuitada | AyudanteQuitado) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const esAyudante = tipo === 'AYUDANTE'
  const [opciones, recargar] = useDatos<AyudanteOpcion[]>(
    esAyudante ? `/api/secciones/${seccion.id}/ayudantes` : null,
  )
  // undefined mientras carga y null si falló, como useDatos.
  const asignados =
    opciones === null ? null : opciones?.filter((ayudante) => ayudante.asignado)
  const [ayudanteId, setAyudanteId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  const elegido = asignados?.find((ayudante) => ayudante.id === ayudanteId)
  const listo = !!motivo.trim() && (!esAyudante || !!elegido)

  async function quitar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!listo) return
    setQuitando(true)
    setError(null)
    try {
      const ruta = esAyudante
        ? `/api/secciones/${seccion.id}/ayudantes/${ayudanteId}/quitar`
        : `/api/secciones/${seccion.id}/profesor/quitar`
      const respuesta = await fetchConSesion(ruta, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo } satisfies QuitarAsignacion),
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        message?: unknown
      }
      if (respuesta.ok) {
        onQuitada(cuerpo as AsignacionQuitada | AyudanteQuitado)
        return
      }
      setError(
        (respuesta.status < 500 && mensajeDe(cuerpo)) ||
          'No se pudo quitar la asignación. Inténtalo nuevamente.',
      )
    } catch {
      setError('No se pudo quitar la asignación. Inténtalo nuevamente.')
    }
    setQuitando(false)
  }

  const titulo = `Quitar ${esAyudante ? 'ayudante' : 'profesor'} de la sección ${seccion.numero}`

  let persona
  if (!esAyudante) {
    persona = (
      <p id="quitar-asignacion-detalle" className="cursos__mensaje">
        ¿Quitar a {seccion.profesor} como profesor a cargo de la sección{' '}
        {seccion.numero}? La sección quedará sin profesor asignado.
      </p>
    )
  } else if (asignados === undefined) {
    persona = <Cargando texto="Cargando ayudantes…" />
  } else if (asignados === null) {
    persona = (
      <ErrorEstado
        mensaje="No se pudieron cargar los ayudantes."
        onReintentar={recargar}
      />
    )
  } else if (asignados.length === 0) {
    persona = (
      <p id="quitar-asignacion-detalle" className="cursos__mensaje">
        La sección {seccion.numero} no tiene ayudantes asignados.
      </p>
    )
  } else {
    persona = (
      <fieldset className="cursos__opciones-ayudantes" disabled={quitando}>
        <legend id="quitar-asignacion-detalle">
          ¿A quién quitas de la sección {seccion.numero}?
        </legend>
        {asignados.map((ayudante) => (
          <label className="cursos__opcion-ayudante" key={ayudante.id}>
            <input
              type="radio"
              name="ayudanteId"
              value={ayudante.id}
              checked={ayudanteId === ayudante.id}
              onChange={() => setAyudanteId(ayudante.id)}
            />
            <span>
              {ayudante.nombre}
              <span className="cursos__correo-ayudante">{ayudante.correo}</span>
            </span>
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="quitar-asignacion-titulo"
      aria-describedby="quitar-asignacion-detalle"
      // Mientras el PATCH está pendiente no se cierra (ni con Escape), para
      // no perder su respuesta ni su error.
      onCancel={(event) => {
        if (quitando) event.preventDefault()
      }}
      onClose={onCerrar}
    >
      <h3 id="quitar-asignacion-titulo" className="cursos__titulo-dialogo">
        {titulo}
      </h3>
      <form
        className="cursos__formulario"
        onSubmit={(event) => void quitar(event)}
      >
        {persona}
        <label className="cursos__campo">
          Motivo
          <textarea
            className="cursos__input"
            name="motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={LARGO_MOTIVO_ASIGNACION}
            rows={3}
            required
            disabled={quitando}
            placeholder="Por ejemplo: se asignó a la sección equivocada"
          />
        </label>
        <p className="cursos__mensaje">
          El cambio queda registrado en el historial con la fecha, tu nombre y
          el motivo.
        </p>
        {error && (
          <p className="cursos__error" role="alert">
            {error}
          </p>
        )}
        <div className="cursos__acciones">
          <button
            className="cursos__boton cursos__boton--secundario"
            type="button"
            onClick={onCerrar}
            disabled={quitando}
          >
            Cancelar
          </button>
          <button
            className="cursos__boton"
            type="submit"
            disabled={quitando || !listo}
          >
            {quitando ? 'Quitando…' : 'Quitar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
