import {
  type AsignarProfesor,
  LARGO_MOTIVO_ASIGNACION,
  type ProfesorAsignable,
  type ProfesorOpcion,
  type ProfesorQuitado,
  type ProfesorResumen,
  type QuitarAsignacion,
  type QuitarProfesor,
  type SeccionDetalle,
} from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

// Mensaje de un 400, 404 o 409 de la API (el ValidationPipe manda una lista).
function mensajeDe(cuerpo: { message?: unknown }): string | null {
  const [mensaje] = [cuerpo.message].flat()
  return typeof mensaje === 'string' ? mensaje : null
}

// GES-25: profesores de una sección. Lista los asignados, agrega otro y quita
// uno con motivo (queda en el historial, GES-14). onCambio recibe los profesores
// de los asignados después de cada cambio, para la tabla del curso.
//
// Con anterior (el curso llegó sin profesores: un backend anterior a GES-25
// durante un deploy desfasado), usa los endpoints de GES-12 y GES-14, que
// admiten un solo profesor: agregar reemplaza al actual. Se retira junto con
// seccion.profesor_id (docs/ges-25-varios-profesores.md).
export function ProfesoresSeccionDialogo({
  seccionId,
  numero,
  anterior,
  onCambio,
  onCerrar,
}: {
  seccionId: string
  numero: number
  anterior?: ProfesorOpcion | null
  onCambio: (profesores: ProfesorResumen[]) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/secciones/${seccionId}/profesores`
  const esAnterior = anterior !== undefined
  const [respuesta, recargar] = useDatos<
    (ProfesorAsignable | ProfesorOpcion)[]
  >(esAnterior ? '/api/profesores' : ruta)
  // GET /api/profesores (GES-12) no trae correo ni asignado.
  // undefined mientras carga y null si falló, como useDatos.
  const opciones: ProfesorAsignable[] | null | undefined =
    respuesta === null
      ? null
      : respuesta?.map((opcion) => ({
          correo: '',
          ...opcion,
          asignado: esAnterior
            ? opcion.id === anterior?.id
            : (opcion as ProfesorAsignable).asignado,
        }))
  const dialogo = useRef<HTMLDialogElement>(null)
  // Los asignados después de agregar o quitar; antes, los de las opciones.
  const [asignados, setAsignados] = useState<ProfesorResumen[] | null>(null)
  const [nuevoId, setNuevoId] = useState('')
  const [quitando, setQuitando] = useState<ProfesorResumen | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  const lista =
    asignados ?? opciones?.filter((profesor) => profesor.asignado) ?? []
  const disponibles =
    opciones?.filter((o) => !lista.some((p) => p.id === o.id)) ?? []

  function actualizar(profesores: ProfesorResumen[], texto: string) {
    setAsignados(profesores)
    onCambio(profesores)
    setAviso(texto)
  }

  async function enviar(
    destino: string,
    init: RequestInit,
    alTerminar: (cuerpo: unknown) => void,
    errorPorDefecto: string,
  ) {
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await fetchConSesion(destino, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        message?: unknown
      }
      if (respuesta.ok) {
        alTerminar(cuerpo)
        return
      }
      setError((respuesta.status < 500 && mensajeDe(cuerpo)) || errorPorDefecto)
      // 404 o 409: otro cambió la sección mientras tanto (ya lo quitaron o
      // ya lo agregaron). Se vuelve a pedir la lista para no mostrarla vieja.
      if (respuesta.status === 404 || respuesta.status === 409) {
        setAsignados(null)
        setQuitando(null)
        setMotivo('')
        recargar()
      }
    } catch {
      setError(errorPorDefecto)
    } finally {
      // Siempre se desbloquea, también si la respuesta no llegó.
      setEnviando(false)
    }
  }

  function agregar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const elegido = disponibles.find((p) => p.id === nuevoId)
    if (!elegido) return
    const body = JSON.stringify({
      profesorId: nuevoId,
    } satisfies AsignarProfesor)
    void enviar(
      esAnterior ? `/api/secciones/${seccionId}/profesor` : ruta,
      { method: esAnterior ? 'PUT' : 'POST', body },
      (cuerpo) => {
        setNuevoId('')
        // PUT anterior: la sección con su único profesor.
        const seccion = cuerpo as SeccionDetalle
        actualizar(
          esAnterior
            ? seccion.profesorId && seccion.profesor
              ? [
                  {
                    id: seccion.profesorId,
                    nombre: seccion.profesor,
                    correo: '',
                  },
                ]
              : []
            : (cuerpo as ProfesorResumen[]),
          `${elegido.nombre} quedó como profesor de la sección ${numero}.`,
        )
      },
      'No se pudo agregar el profesor. Inténtalo nuevamente.',
    )
  }

  function quitar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quitando || !motivo.trim()) return
    void enviar(
      esAnterior
        ? `/api/secciones/${seccionId}/profesor/quitar`
        : `${ruta}/${quitando.id}/quitar`,
      {
        method: 'PATCH',
        body: JSON.stringify(
          esAnterior
            ? ({ motivo, profesorId: quitando.id } satisfies QuitarProfesor)
            : ({ motivo } satisfies QuitarAsignacion),
        ),
      },
      (cuerpo) => {
        const resultado = cuerpo as ProfesorQuitado
        setQuitando(null)
        setMotivo('')
        actualizar(
          // PATCH anterior: la sección queda sin profesor.
          resultado.profesores ?? [],
          `${resultado.quitado.nombre} ya no es profesor de la sección ${numero}.`,
        )
      },
      'No se pudo quitar el profesor. Inténtalo nuevamente.',
    )
  }

  let contenido
  if (opciones === undefined) {
    contenido = <Cargando texto="Cargando profesores…" />
  } else if (opciones === null) {
    contenido = (
      <ErrorEstado
        mensaje="No se pudieron cargar los profesores."
        onReintentar={recargar}
      />
    )
  } else {
    contenido = (
      <>
        {lista.length === 0 ? (
          <p className="cursos__mensaje">
            La sección {numero} no tiene profesores asignados.
          </p>
        ) : (
          <ul
            className="cursos__lista-profesores"
            aria-label="Profesores asignados"
          >
            {lista.map((profesor) => (
              <li key={profesor.id}>
                <span>
                  {profesor.nombre}
                  {profesor.correo && (
                    <span className="cursos__correo-ayudante">
                      {profesor.correo}
                    </span>
                  )}
                </span>
                <button
                  className="cursos__boton cursos__boton--secundario"
                  type="button"
                  aria-label={`Quitar a ${profesor.nombre}`}
                  disabled={enviando || quitando !== null}
                  onClick={() => {
                    setError(null)
                    setAviso(null)
                    setQuitando(profesor)
                  }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        {quitando ? (
          <form
            className="cursos__formulario"
            aria-label={`Quitar a ${quitando.nombre}`}
            onSubmit={quitar}
          >
            <p className="cursos__mensaje">
              ¿Quitar a {quitando.nombre} de la sección {numero}? El cambio
              queda en el historial con la fecha, tu nombre y el motivo.
            </p>
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
                disabled={enviando}
                placeholder="Por ejemplo: se asignó a la sección equivocada"
              />
            </label>
            <div className="cursos__acciones">
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                disabled={enviando}
                onClick={() => {
                  setQuitando(null)
                  setMotivo('')
                }}
              >
                Cancelar
              </button>
              <button
                className="cursos__boton"
                type="submit"
                disabled={enviando || !motivo.trim()}
              >
                {enviando ? 'Quitando…' : 'Quitar profesor'}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="cursos__formulario"
            aria-label="Agregar profesor"
            onSubmit={agregar}
          >
            <label className="cursos__campo">
              Profesor a agregar
              <select
                className="cursos__input"
                name="profesorId"
                value={nuevoId}
                onChange={(event) => setNuevoId(event.target.value)}
                disabled={enviando || disponibles.length === 0}
              >
                <option value="">
                  {disponibles.length === 0
                    ? 'No hay más profesores disponibles'
                    : 'Selecciona un profesor'}
                </option>
                {disponibles.map((profesor) => (
                  <option key={profesor.id} value={profesor.id}>
                    {profesor.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="cursos__boton"
              type="submit"
              disabled={enviando || !nuevoId}
            >
              {enviando
                ? 'Agregando…'
                : esAnterior && lista.length > 0
                  ? 'Reemplazar'
                  : 'Agregar'}
            </button>
            {esAnterior && lista.length > 0 && (
              <p className="cursos__mensaje">
                Por ahora la sección admite un solo profesor: agregar otro
                reemplaza a {lista[0].nombre}.
              </p>
            )}
          </form>
        )}
      </>
    )
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="profesores-seccion-titulo"
      // Mientras hay un cambio pendiente no se cierra (ni con Escape).
      onCancel={(event) => {
        if (enviando) event.preventDefault()
      }}
      onClose={onCerrar}
    >
      <h3 id="profesores-seccion-titulo" className="cursos__titulo-dialogo">
        Profesores de la sección {numero}
      </h3>
      {contenido}
      {aviso && (
        <p className="cursos__exito" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="cursos__error" role="alert">
          {error}
        </p>
      )}
      <div className="cursos__acciones">
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          disabled={enviando}
          onClick={onCerrar}
        >
          Cerrar
        </button>
      </div>
    </dialog>
  )
}
