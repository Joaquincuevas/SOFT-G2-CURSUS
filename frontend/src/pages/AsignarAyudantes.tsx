import type {
  AsignarAyudantes,
  AyudanteOpcion,
  AyudanteResumen,
} from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export function AsignarAyudantesDialogo({
  seccionId,
  numero,
  onAsignados,
  onCerrar,
}: {
  seccionId: string
  numero: number
  onAsignados: (ayudantes: AyudanteResumen[]) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/secciones/${seccionId}/ayudantes`
  const [opciones, recargar] = useDatos<AyudanteOpcion[]>(ruta)
  const dialogo = useRef<HTMLDialogElement>(null)
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  async function asignar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const datos: AsignarAyudantes = { ayudanteIds: seleccionados }
      const respuesta = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!respuesta.ok) {
        setError(
          respuesta.status === 400
            ? 'La selección ya no está disponible. Vuelve a cargar los ayudantes.'
            : 'No se pudieron asignar los ayudantes. Inténtalo nuevamente.',
        )
      } else {
        onAsignados((await respuesta.json()) as AyudanteResumen[])
        onCerrar()
      }
    } catch {
      setError('No se pudieron asignar los ayudantes. Inténtalo nuevamente.')
    }
    setEnviando(false)
  }

  function volverACargar() {
    setSeleccionados([])
    setError(null)
    recargar()
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="asignar-ayudantes-titulo"
      onCancel={(event) => {
        if (enviando) event.preventDefault()
      }}
      onClose={onCerrar}
    >
      <h3 id="asignar-ayudantes-titulo" className="cursos__titulo-dialogo">
        Asignar ayudantes a la sección {numero}
      </h3>
      <p className="cursos__mensaje">
        Selecciona uno o más ayudantes de tu universidad.
      </p>
      {opciones === undefined ? (
        <Cargando texto="Cargando ayudantes…" />
      ) : opciones === null ? (
        <ErrorEstado
          mensaje="No se pudieron cargar los ayudantes."
          onReintentar={volverACargar}
        />
      ) : (
        <form
          className="cursos__formulario"
          onSubmit={(event) => void asignar(event)}
        >
          {opciones.length === 0 ? (
            <p className="cursos__mensaje">
              No hay ayudantes disponibles en tu universidad.
            </p>
          ) : (
            <fieldset
              className="cursos__opciones-ayudantes"
              disabled={enviando}
            >
              <legend>Ayudantes</legend>
              {opciones.map((ayudante) => (
                <label className="cursos__opcion-ayudante" key={ayudante.id}>
                  <input
                    type="checkbox"
                    checked={
                      ayudante.asignado || seleccionados.includes(ayudante.id)
                    }
                    disabled={ayudante.asignado}
                    onChange={(event) =>
                      setSeleccionados((actuales) =>
                        event.target.checked
                          ? [...actuales, ayudante.id]
                          : actuales.filter((id) => id !== ayudante.id),
                      )
                    }
                  />
                  <span>
                    {ayudante.nombre}
                    <span className="cursos__correo-ayudante">
                      {ayudante.correo}
                      {ayudante.asignado ? ' · Ya asignado' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p className="cursos__error" role="alert">
              {error}
            </p>
          )}
          {error && (
            <button
              className="cursos__boton cursos__boton--secundario"
              type="button"
              onClick={volverACargar}
              disabled={enviando}
            >
              Volver a cargar ayudantes
            </button>
          )}
          <div className="cursos__acciones">
            <button
              className="cursos__boton cursos__boton--secundario"
              type="button"
              onClick={onCerrar}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              className="cursos__boton"
              type="submit"
              disabled={enviando || seleccionados.length === 0}
            >
              {enviando ? 'Asignando…' : 'Asignar ayudantes'}
            </button>
          </div>
        </form>
      )}
      {(opciones === undefined || opciones === null) && (
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          onClick={onCerrar}
        >
          Cancelar
        </button>
      )}
    </dialog>
  )
}
