import type {
  CierreCurso,
  CursoDetalle,
  PendientesCierreCurso,
} from '@cursus/shared'
import { avisoPonderaciones } from '@cursus/shared'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { ArchivarCurso } from './ArchivarCurso'

export function GestionarCierreCurso({ curso }: { curso: CursoDetalle }) {
  const { fetchConSesion } = useAuth()
  const [cierre, setCierre] = useState<CierreCurso>()
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<
    { message: string } & Partial<PendientesCierreCurso>
  >()
  const titulo = useRef<HTMLHeadingElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmando) titulo.current?.focus()
  }, [confirmando])

  async function cerrar() {
    setGuardando(true)
    setError(undefined)
    try {
      const respuesta = await fetchConSesion(`/api/cursos/${curso.id}/cierre`, {
        method: 'POST',
      })
      if (respuesta.status === 409) {
        setError((await respuesta.json()) as NonNullable<typeof error>)
        return
      }
      if (!respuesta.ok) throw new Error()
      setCierre((await respuesta.json()) as CierreCurso)
      setConfirmando(false)
    } catch {
      setError({ message: 'No se pudo cerrar el curso. Intenta nuevamente.' })
    } finally {
      setGuardando(false)
    }
  }

  const registrado = cierre ?? curso.cierre
  if (registrado) {
    return (
      <>
        <p className="cursos__exito" role="status">
          Curso cerrado el{' '}
          <time dateTime={registrado.fecha}>
            {new Date(registrado.fecha).toLocaleString('es-CL', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </time>
          .
        </p>
        <ArchivarCurso curso={curso} />
      </>
    )
  }

  return (
    <div className="cursos__acciones">
      <button
        ref={boton}
        className="cursos__boton cursos__boton--secundario"
        type="button"
        disabled={confirmando}
        onClick={() => setConfirmando(true)}
      >
        Cerrar curso
      </button>
      {confirmando && (
        <section className="cursos__tarjeta" aria-labelledby="confirmar-cierre">
          <h3 id="confirmar-cierre" ref={titulo} tabIndex={-1}>
            Confirmar cierre del curso
          </h3>
          <p>
            El cierre quedará registrado con la fecha y tu usuario. Esta acción
            no se puede deshacer.
          </p>
          {error && (
            <div className="cursos__error" role="alert">
              <p>{error.message}</p>
              {!!error.pendientes?.length && (
                <ul>
                  {error.pendientes.map(
                    ({ evaluacionId, nombre, seccion, notasPendientes }) => (
                      <li key={evaluacionId}>
                        Sección {seccion} · {nombre} ·{' '}
                        {notasPendientes === 0
                          ? 'Sin notas publicadas'
                          : notasPendientes === 1
                            ? '1 nota sin publicar'
                            : `${notasPendientes} notas sin publicar`}
                      </li>
                    ),
                  )}
                </ul>
              )}
              {!!error.ponderaciones?.length && (
                <ul>
                  {error.ponderaciones.map(({ seccion, sumaPonderaciones }) => (
                    <li key={seccion}>
                      Sección {seccion} ·{' '}
                      {avisoPonderaciones(sumaPonderaciones)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="cursos__acciones">
            <button
              className="cursos__boton cursos__boton--secundario"
              type="button"
              disabled={guardando}
              onClick={() => {
                setConfirmando(false)
                setError(undefined)
                requestAnimationFrame(() => boton.current?.focus())
              }}
            >
              Cancelar
            </button>
            <button
              className="cursos__boton"
              type="button"
              disabled={guardando}
              onClick={() => void cerrar()}
            >
              {guardando ? 'Cerrando…' : 'Confirmar cierre'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
