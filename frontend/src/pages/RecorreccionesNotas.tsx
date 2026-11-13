import {
  LARGO_MOTIVO_NOTA,
  MENSAJES_NOTA_INVALIDA,
  motivoNotaInvalida,
  type NotaAlumno,
  type NotasEvaluacion,
  type RecorregirNota,
} from '@cursus/shared'
import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'

const formato = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function RecorreccionesNotas({
  ruta,
  alumnos,
  editable = true,
  alGuardar,
  alRecargar,
}: {
  ruta: string
  alumnos: NotaAlumno[]
  editable?: boolean
  alGuardar: (notas: NotasEvaluacion) => void
  alRecargar: () => void
}) {
  const [elegido, setElegido] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const alumno = alumnos.find((a) => a.id === elegido)
  return (
    <>
      <div className="notas__listado">
        <table className="notas__tabla" aria-label="Notas publicadas">
          <thead>
            <tr>
              <th scope="col">Alumno</th>
              <th scope="col">Nota</th>
              <th scope="col">Estado</th>
              {editable && <th scope="col">Recorrección</th>}
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => (
              <tr key={a.id}>
                <td>{a.nombre}</td>
                <td>{a.nota === null ? 'Sin nota' : formato.format(a.nota)}</td>
                <td>
                  {a.estado === 'PUBLICADA' ? 'Publicada' : 'Sin publicar'}
                  {a.recorregida && (
                    <span className="notas__recorregida">Recorregida</span>
                  )}
                </td>
                {editable && (
                  <td>
                    {a.estado === 'PUBLICADA' && a.nota !== null && (
                      <button
                        type="button"
                        className="notas__enlace"
                        aria-label={`Recorregir nota de ${a.nombre}`}
                        disabled={elegido !== null}
                        onClick={() => {
                          setAviso(null)
                          setElegido(a.id)
                        }}
                      >
                        Recorregir
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && alumno && alumno.nota !== null && (
        <FormularioRecorreccion
          key={`${alumno.id}-${alumno.nota}`}
          ruta={`${ruta}/${alumno.id}/recorreccion`}
          alumno={alumno}
          notaAnterior={alumno.nota}
          alCancelar={() => setElegido(null)}
          alGuardar={(notas) => {
            alGuardar(notas)
            setElegido(null)
            setAviso(
              `Recorrección guardada para ${alumno.nombre}. El alumno verá la nota nueva.`,
            )
          }}
          alRecargar={() => {
            setElegido(null)
            alRecargar()
          }}
        />
      )}
      {aviso && (
        <p className="notas__aviso" role="status">
          {aviso}
        </p>
      )}
    </>
  )
}

function FormularioRecorreccion({
  ruta,
  alumno,
  notaAnterior,
  alCancelar,
  alGuardar,
  alRecargar,
}: {
  ruta: string
  alumno: NotaAlumno
  notaAnterior: number
  alCancelar: () => void
  alGuardar: (notas: NotasEvaluacion) => void
  alRecargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const id = useId()
  const [nota, setNota] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [desactualizada, setDesactualizada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valor = Number(nota.trim().replace(',', '.'))
  const motivoNota =
    nota.trim() === ''
      ? null
      : /^\d+(?:[.,]\d*)?$/.test(nota.trim())
        ? motivoNotaInvalida(valor)
        : 'formato'
  const largo = [...motivo].length
  const excedido = [...motivo.trim()].length > LARGO_MOTIVO_NOTA
  const invalida =
    !nota.trim() ||
    motivoNota !== null ||
    valor === notaAnterior ||
    !motivo.trim() ||
    excedido

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando || desactualizada || invalida) return
    setGuardando(true)
    setError(null)
    const datos: RecorregirNota = {
      notaAnterior,
      notaNueva: valor,
      motivo: motivo.trim(),
    }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (res.ok) {
        alGuardar((await res.json()) as NotasEvaluacion)
        return
      }
      const cuerpo = (await res.json().catch(() => null)) as {
        message?: unknown
      } | null
      if (res.status === 409) setDesactualizada(true)
      const mensaje = Array.isArray(cuerpo?.message)
        ? cuerpo.message[0]
        : cuerpo?.message
      setError(
        typeof mensaje === 'string' && [400, 403, 404, 409].includes(res.status)
          ? mensaje
          : 'No pudimos guardar la recorrección. Inténtalo nuevamente.',
      )
    } catch {
      setError(
        'No pudimos guardar la recorrección. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="notas__recorreccion"
      aria-label={`Recorregir nota de ${alumno.nombre}`}
      onSubmit={(event) => void guardar(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !guardando) alCancelar()
      }}
    >
      <h5 className="vista-seccion__subtitulo">
        Recorrección de {alumno.nombre}
      </h5>
      <p>
        Nota publicada: <strong>{formato.format(notaAnterior)}</strong>. La nota
        nueva será visible para el alumno.
      </p>
      <label className="notas__campo">
        Nota nueva
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          className="notas__nota"
          value={nota}
          disabled={guardando || desactualizada}
          required
          aria-invalid={motivoNota ? true : undefined}
          aria-describedby={motivoNota ? `${id}-nota` : undefined}
          onChange={(event) => {
            setNota(event.target.value)
            setError(null)
          }}
        />
      </label>
      {motivoNota && (
        <p id={`${id}-nota`} className="notas__error">
          {MENSAJES_NOTA_INVALIDA[motivoNota]}
        </p>
      )}
      {nota.trim() && !motivoNota && valor === notaAnterior && (
        <p className="notas__error">
          La nota nueva debe ser distinta de la publicada.
        </p>
      )}
      <label className="notas__campo">
        Motivo de la recorrección
        <textarea
          value={motivo}
          required
          rows={3}
          disabled={guardando || desactualizada}
          aria-invalid={excedido ? true : undefined}
          aria-describedby={`${id}-contador`}
          onChange={(event) => {
            setMotivo(event.target.value)
            setError(null)
          }}
        />
      </label>
      <p
        id={`${id}-contador`}
        className={excedido ? 'notas__error' : 'dashboard__texto'}
      >
        {largo}/{LARGO_MOTIVO_NOTA} caracteres
      </p>
      <div className="notas__acciones">
        <button
          type="submit"
          className="notas__boton"
          disabled={guardando || desactualizada || invalida}
        >
          {guardando ? 'Guardando…' : 'Guardar recorrección'}
        </button>
        <button
          type="button"
          className="notas__enlace"
          disabled={guardando}
          onClick={alCancelar}
        >
          Cancelar
        </button>
        {desactualizada && (
          <button type="button" className="notas__boton" onClick={alRecargar}>
            Recargar notas
          </button>
        )}
      </div>
      {error && (
        <p className="notas__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
