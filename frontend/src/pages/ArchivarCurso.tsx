import type { CursoDetalle } from '@cursus/shared'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'

export function ArchivarCurso({ curso }: { curso: CursoDetalle }) {
  const { fetchConSesion } = useAuth()
  const navegar = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [error, setError] = useState<string>()
  const titulo = useRef<HTMLHeadingElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmando) titulo.current?.focus()
  }, [confirmando])

  async function archivar() {
    setArchivando(true)
    setError(undefined)
    try {
      const respuesta = await fetchConSesion(
        `/api/cursos/${curso.id}/archivar`,
        {
          method: 'PATCH',
        },
      )
      if (respuesta.status === 409) {
        setError('Solo se pueden archivar cursos cerrados.')
        return
      }
      if (!respuesta.ok) throw new Error()
      await navegar('/cursos', {
        replace: true,
        state: { archivado: curso.codigo },
      })
    } catch {
      setError('No se pudo archivar el curso. Intenta nuevamente.')
    } finally {
      setArchivando(false)
    }
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
        Archivar curso
      </button>
      {confirmando && (
        <section
          className="cursos__tarjeta"
          aria-labelledby="confirmar-archivo"
        >
          <h3 id="confirmar-archivo" ref={titulo} tabIndex={-1}>
            Confirmar archivo del curso
          </h3>
          <p>
            El curso dejará de aparecer en el listado. Se conservará su registro
            académico.
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
              disabled={archivando}
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
              disabled={archivando}
              onClick={() => void archivar()}
            >
              {archivando ? 'Archivando…' : 'Confirmar archivo'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
