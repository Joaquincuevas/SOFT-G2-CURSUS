import {
  DIAS_SEMANA,
  LARGO_SALA,
  MAX_BLOQUES_HORARIO,
  type BloqueHorario,
  type DiaSemana,
  type GuardarHorario,
  type HorarioSeccion,
} from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'
import './EditarHorario.css'

interface Props {
  seccionId: string
  numero: number
  onGuardado: (horario: HorarioSeccion) => void
  onCerrar: () => void
}

export function EditarHorarioDialogo(props: Props) {
  const [datos, recargar] = useDatos<HorarioSeccion>(
    `/api/secciones/${props.seccionId}/horario`,
  )
  const dialogo = useRef<HTMLDialogElement>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo horario__dialogo"
      aria-labelledby="horario-titulo"
      onCancel={(event) => {
        if (guardando) event.preventDefault()
      }}
      onClose={props.onCerrar}
    >
      <h3 id="horario-titulo" className="cursos__titulo-dialogo">
        Horario de la sección {props.numero}
      </h3>
      <p className="cursos__mensaje">
        Define el día, las horas y la sala de cada bloque semanal.
      </p>
      {datos === undefined ? (
        <Cargando texto="Cargando horario…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No se pudo cargar el horario."
          onReintentar={recargar}
        />
      ) : (
        <FormularioHorario
          key={datos.version}
          {...props}
          datos={datos}
          guardando={guardando}
          setGuardando={setGuardando}
          onRecargar={recargar}
        />
      )}
      {!datos && (
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          onClick={props.onCerrar}
        >
          Cancelar
        </button>
      )}
    </dialog>
  )
}

type BloqueEditor = BloqueHorario & { clave: string }
const paraEditar = (bloque: BloqueHorario): BloqueEditor => ({
  ...bloque,
  clave: crypto.randomUUID(),
})
const sinClaves = (bloques: BloqueEditor[]): BloqueHorario[] =>
  bloques.map(({ dia, inicio, termino, sala }) => ({
    dia,
    inicio,
    termino,
    sala: sala.trim().replace(/\s+/g, ' '),
  }))

function FormularioHorario({
  seccionId,
  datos,
  guardando,
  setGuardando,
  onRecargar,
  onGuardado,
  onCerrar,
}: Props & {
  datos: HorarioSeccion
  guardando: boolean
  setGuardando: (estado: boolean) => void
  onRecargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [bloques, setBloques] = useState(() => datos.bloques.map(paraEditar))
  const [error, setError] = useState<string | null>(null)
  const [conflicto, setConflicto] = useState(false)
  const sinCambios =
    JSON.stringify(sinClaves(bloques)) === JSON.stringify(datos.bloques)

  function cambiar(clave: string, cambio: Partial<BloqueHorario>) {
    setBloques((actuales) =>
      actuales.map((b) => (b.clave === clave ? { ...b, ...cambio } : b)),
    )
    if (!conflicto) setError(null)
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando || conflicto || sinCambios) return
    const entrada = sinClaves(bloques)
    if (entrada.some((b) => b.inicio >= b.termino)) {
      setError('La hora de término debe ser posterior al inicio.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const cuerpo: GuardarHorario = {
        version: datos.version,
        bloques: entrada,
      }
      const respuesta = await fetchConSesion(
        `/api/secciones/${seccionId}/horario`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        },
      )
      if (respuesta.ok) {
        onGuardado((await respuesta.json()) as HorarioSeccion)
        onCerrar()
      } else {
        const detalle = (await respuesta.json().catch(() => ({}))) as {
          message?: unknown
        }
        setConflicto(respuesta.status === 409)
        setError(
          typeof detalle.message === 'string' && respuesta.status < 500
            ? detalle.message
            : 'No se pudo guardar el horario. Revisa los campos e inténtalo nuevamente.',
        )
      }
    } catch {
      setError('No se pudo guardar el horario. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="cursos__formulario"
      aria-label="Bloques del horario"
      onSubmit={(event) => void guardar(event)}
    >
      {bloques.length === 0 && (
        <p className="cursos__mensaje">
          Esta sección no tiene bloques asignados.
        </p>
      )}
      <fieldset className="horario__campos" disabled={guardando}>
        <legend>Bloques semanales</legend>
        {bloques.map((bloque, i) => (
          <fieldset className="horario__bloque" key={bloque.clave}>
            <legend>Bloque {i + 1}</legend>
            <div className="horario__grilla">
              <label className="cursos__campo">
                Día
                <select
                  className="cursos__input"
                  aria-label={`Día del bloque ${i + 1}`}
                  value={bloque.dia}
                  onChange={(e) =>
                    cambiar(bloque.clave, {
                      dia: Number(e.target.value) as DiaSemana,
                    })
                  }
                >
                  {DIAS_SEMANA.map((dia, indice) => (
                    <option key={dia} value={indice + 1}>
                      {dia}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cursos__campo">
                Sala
                <input
                  className="cursos__input"
                  aria-label={`Sala del bloque ${i + 1}`}
                  value={bloque.sala}
                  maxLength={LARGO_SALA}
                  required
                  onChange={(e) =>
                    cambiar(bloque.clave, { sala: e.target.value })
                  }
                />
              </label>
              <label className="cursos__campo">
                Inicio
                <input
                  className="cursos__input"
                  type="time"
                  step="60"
                  aria-label={`Inicio del bloque ${i + 1}`}
                  value={bloque.inicio}
                  required
                  onChange={(e) =>
                    cambiar(bloque.clave, { inicio: e.target.value })
                  }
                />
              </label>
              <label className="cursos__campo">
                Término
                <input
                  className="cursos__input"
                  type="time"
                  step="60"
                  aria-label={`Término del bloque ${i + 1}`}
                  value={bloque.termino}
                  required
                  onChange={(e) =>
                    cambiar(bloque.clave, { termino: e.target.value })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="cursos__boton cursos__boton--secundario"
              aria-label={`Quitar bloque ${i + 1}`}
              onClick={() =>
                setBloques((actuales) =>
                  actuales.filter((b) => b.clave !== bloque.clave),
                )
              }
            >
              Quitar bloque
            </button>
          </fieldset>
        ))}
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          disabled={bloques.length >= MAX_BLOQUES_HORARIO}
          onClick={() =>
            setBloques((actuales) => [
              ...actuales,
              paraEditar({ dia: 1, inicio: '', termino: '', sala: '' }),
            ])
          }
        >
          Agregar bloque
        </button>
      </fieldset>
      {error && (
        <p className="cursos__error" role="alert">
          {error}
        </p>
      )}
      {conflicto && (
        <div>
          <p className="cursos__mensaje">
            Recargar descarta los cambios sin guardar.
          </p>
          <button
            className="cursos__boton cursos__boton--secundario"
            type="button"
            onClick={onRecargar}
          >
            Recargar horario
          </button>
        </div>
      )}
      <div className="cursos__acciones">
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          disabled={guardando}
          onClick={onCerrar}
        >
          Cancelar
        </button>
        <button
          className="cursos__boton"
          type="submit"
          disabled={guardando || sinCambios || conflicto}
        >
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
      </div>
    </form>
  )
}
