import {
  type ErrorEstadoRevision,
  type ErrorNotasFaltantes,
  LARGO_COMENTARIO_DEVOLUCION,
  type ErrorNotasInvalidas,
  type EstadoNota,
  type EstadoRevisionNotas,
  type GuardarNotas,
  MENSAJES_NOTA_INVALIDA,
  motivoNotaInvalida,
  type NotaAlumno,
  type NotasEvaluacion,
  type Rol,
} from '@cursus/shared'
import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type FormEvent,
} from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'
import { ComentarioDevolucion } from './ComentarioDevolucion'
import { ESTADO_REVISION } from './estados-notas'
import { RecorreccionesNotas } from './RecorreccionesNotas'

interface Props {
  rol: Rol
  seccionId: string
  evaluacionId: string
  // NOT-09: actualiza el resumen de la lista con lo que acaba de responder
  // el servidor, sin recargar ni desmontar el formulario y perder su edición.
  alActualizar?: (notas: NotasEvaluacion) => void
  // NOT-11 y NOT-12: en la vista de pendientes del profesor, muestra
  // "Aprobar y publicar" y "Devolver" mientras la evaluación está en
  // revisión. Recibe el aviso para quien la abrió (éxito o el 409 de estado),
  // que recarga su lista.
  alRevisar?: (aviso: string) => void
}

// NOT-05 (RN-10): el ayudante ingresa la nota de cada alumno de la sección.
// Se guardan como propuesta, que el alumno no ve; se pueden guardar unas
// pocas y volver después por el resto. NOT-06: cada campo se valida al
// escribir con la escala de 1,0 a 7,0 y se marca en rojo con su motivo; el
// backend vuelve a validar y devuelve el motivo por alumno. NOT-07: lo
// guardado es un borrador, que el profesor no ve como pendiente. NOT-08: con
// todas las notas guardadas se envía a revisión, y desde ahí los campos
// quedan de solo lectura hasta que el profesor responda.
export function NotasDeEvaluacion({
  rol,
  seccionId,
  evaluacionId,
  alActualizar,
  alRevisar,
}: Props) {
  const ruta = `/api/espacio/secciones/${seccionId}/evaluaciones/${evaluacionId}/notas`
  const [datos, recargar, , fijar] = useDatos<NotasEvaluacion>(ruta)
  const [aviso, setAviso] = useState<string | null>(null)
  const notificarLectura = useEffectEvent((notas: NotasEvaluacion) =>
    alActualizar?.(notas),
  )
  useEffect(() => {
    if (datos) notificarLectura(datos)
  }, [datos])

  if (datos === undefined) {
    return <Cargando texto="Cargando notas…" />
  }
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar las notas de la evaluación."
        onReintentar={recargar}
      />
    )
  }
  return (
    <section
      className="notas__evaluacion"
      aria-label={`Notas de ${datos.evaluacion.nombre}`}
    >
      <h4 className="vista-seccion__subtitulo">
        Notas de {datos.evaluacion.nombre}
      </h4>
      <p className="dashboard__texto">
        Estado: {ESTADO_REVISION[datos.estado]}
      </p>
      {datos.estado === 'DEVUELTA' && (
        <ComentarioDevolucion comentario={datos.comentarioDevolucion} />
      )}
      {datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">
          La sección no tiene alumnos inscritos
        </p>
      ) : rol === 'PROFESOR' && datos.estado === 'APROBADA' ? (
        <RecorreccionesNotas
          ruta={ruta}
          alumnos={datos.alumnos}
          alGuardar={fijar}
          alRecargar={recargar}
        />
      ) : (
        <FormularioNotas
          // Un cambio de estado (el envío) reinicia el formulario con las
          // notas que lo trajeron.
          key={datos.estado}
          ruta={ruta}
          inicial={datos.alumnos}
          editable={rol === 'AYUDANTE' && EDITABLE.includes(datos.estado)}
          alGuardar={() => setAviso('Borrador guardado.')}
          // El POST devuelve la evaluación ya en revisión: se aplica sin
          // esperar otra recarga, en la que los campos volverían a editarse.
          alEnviar={(enviada) => {
            setAviso('Notas enviadas a revisión.')
            if (enviada) fijar(enviada)
            else recargar()
          }}
          alSincronizar={fijar}
          alEditar={() => setAviso(null)}
          // 409: otro ayudante la envió mientras tanto. El formulario se
          // bloquea al recibirlo; la recarga trae el estado nuevo y el aviso
          // explica por qué.
          alBloquear={(mensaje) => {
            setAviso(mensaje)
            recargar()
          }}
        />
      )}
      {alRevisar &&
        datos.estado === 'EN_REVISION' &&
        datos.alumnos.length > 0 && (
          <RevisarNotas ruta={ruta} alTerminar={alRevisar} />
        )}
      {aviso && (
        <p className="notas__aviso" role="status">
          {aviso}
        </p>
      )}
    </section>
  )
}

// NOT-11 y NOT-12: el profesor aprueba y publica, o devuelve al ayudante con
// un comentario obligatorio, siempre con confirmación. Si falla, la
// confirmación sigue abierta para reintentar. Solo el 409 de estado (ya
// aprobada o devuelta, o ya no en revisión) se avisa como el éxito, porque la
// evaluación ya no está pendiente; los otros 409 la dejan en revisión y se
// muestran aquí.
function RevisarNotas({
  ruta,
  alTerminar,
}: {
  ruta: string
  alTerminar: (aviso: string) => void
}) {
  const { fetchConSesion } = useAuth()
  const [accion, setAccion] = useState<'aprobar' | 'devolver' | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idContador = useId()
  const idExceso = useId()
  // En caracteres, como el backend (DTO y CHECK) y length() de PostgreSQL,
  // no en unidades UTF-16 como .length y maxLength: un emoji cuenta uno. El
  // límite se revisa sin los espacios de los extremos, que no se envían.
  const largo = Array.from(comentario).length
  const excedido =
    Array.from(comentario.trim()).length > LARGO_COMENTARIO_DEVOLUCION

  async function revisar(
    destino: string,
    init: RequestInit,
    textos: { exito: string; error: string },
  ) {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetchConSesion(destino, { method: 'POST', ...init })
      if (res.ok) {
        alTerminar(textos.exito)
        return
      }
      const cuerpo = (await res.json().catch(() => null)) as
        | (Partial<Pick<ErrorEstadoRevision, 'estado'>> & {
            message?: unknown
          })
        | null
      if (res.status === 409 && cuerpo?.estado) {
        alTerminar(mensajeDe(cuerpo, 'Las notas ya no están en revisión'))
        return
      }
      setError(
        res.status === 409 || res.status === 400
          ? mensajeDe(cuerpo, `No se pudieron ${textos.error} las notas`)
          : `No pudimos ${textos.error} las notas. Inténtalo nuevamente.`,
      )
    } catch {
      setError(
        `No pudimos ${textos.error} las notas. Comprueba tu conexión e inténtalo nuevamente.`,
      )
    } finally {
      // Siempre se desbloquea, también si la respuesta no llegó.
      setEnviando(false)
    }
  }

  const aprobar = () =>
    revisar(
      `${ruta}/aprobacion`,
      {},
      { exito: 'Notas aprobadas y publicadas.', error: 'aprobar' },
    )
  const devolver = () =>
    revisar(
      `${ruta}/devolucion`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario: comentario.trim() }),
      },
      { exito: 'Notas devueltas al ayudante.', error: 'devolver' },
    )
  const cancelar = () => {
    setAccion(null)
    setError(null)
  }

  return (
    <>
      <div className="notas__acciones">
        <button
          className="notas__boton"
          type="button"
          disabled={accion !== null}
          onClick={() => setAccion('aprobar')}
        >
          Aprobar y publicar
        </button>
        <button
          className="notas__boton"
          type="button"
          disabled={accion !== null}
          onClick={() => setAccion('devolver')}
        >
          Devolver
        </button>
      </div>
      {accion === 'aprobar' && (
        <section
          className="notas__confirmacion"
          aria-label="Confirmar aprobación"
        >
          <p>
            ¿Aprobar y publicar las notas? Los alumnos podrán verlas y ya no se
            podrán editar.
          </p>
          <button
            className="notas__boton"
            type="button"
            disabled={enviando}
            onClick={() => void aprobar()}
          >
            {enviando ? 'Publicando…' : 'Publicar'}
          </button>
          <button
            className="notas__boton"
            type="button"
            disabled={enviando}
            onClick={cancelar}
          >
            Cancelar
          </button>
        </section>
      )}
      {accion === 'devolver' && (
        <section
          className="notas__confirmacion"
          aria-label="Devolver al ayudante"
        >
          <p>
            Las notas vuelven al ayudante para que las corrija y las envíe de
            nuevo. No se publica nada.
          </p>
          <label className="notas__campo">
            Comentario para el ayudante (obligatorio)
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              required
              aria-invalid={excedido}
              aria-describedby={
                excedido ? `${idContador} ${idExceso}` : idContador
              }
              disabled={enviando}
            />
          </label>
          <p id={idContador} className="notas__contador">
            {largo}/{LARGO_COMENTARIO_DEVOLUCION} caracteres
          </p>
          {excedido && (
            <p id={idExceso} className="notas__error">
              El comentario puede tener hasta {LARGO_COMENTARIO_DEVOLUCION}{' '}
              caracteres.
            </p>
          )}
          <button
            className="notas__boton"
            type="button"
            disabled={enviando || !comentario.trim() || excedido}
            onClick={() => void devolver()}
          >
            {enviando ? 'Devolviendo…' : 'Confirmar devolución'}
          </button>
          <button
            className="notas__boton"
            type="button"
            disabled={enviando}
            onClick={cancelar}
          >
            Cancelar
          </button>
        </section>
      )}
      {error && (
        <p className="notas__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

const textoDe = (nota: number | null) => (nota === null ? '' : String(nota))

const valoresDe = (alumnos: NotaAlumno[]) =>
  Object.fromEntries(alumnos.map((a) => [a.id, textoDe(a.nota)]))

// NOT-06: lo escrito en un campo, con coma o punto como separador decimal
// ("5,5" y "5.5"). Un separador al final ("5,") se lee como el entero: es el
// paso intermedio al escribir "5,5" y no se marca como error.
const NOTA_ESCRITA = /^\d+(?:[.,]\d*)?$/
const leerNota = (texto: string) => Number(texto.trim().replace(',', '.'))

// Por qué lo escrito no es una nota, o null si lo es o si el campo está
// vacío (un campo vacío no se envía).
function motivoDe(texto: string): string | null {
  const limpio = texto.trim()
  if (limpio === '') return null
  const motivo = NOTA_ESCRITA.test(limpio)
    ? motivoNotaInvalida(leerNota(limpio))
    : 'formato'
  return motivo && MENSAJES_NOTA_INVALIDA[motivo]
}

// NOT-08: el ayudante escribe y envía solo en borrador o devuelta.
const EDITABLE: readonly EstadoRevisionNotas[] = ['BORRADOR', 'DEVUELTA']

// El mensaje del backend con punto final, o el dado si no trae uno. La
// validación del cuerpo (NOT-12) trae una lista: se muestra el primero.
function mensajeDe(cuerpo: { message?: unknown } | null, otro: string) {
  const mensaje = Array.isArray(cuerpo?.message)
    ? (cuerpo.message as unknown[])[0]
    : cuerpo?.message
  return `${typeof mensaje === 'string' ? mensaje : otro}.`
}

const ESTADO: Record<EstadoNota, string> = {
  PROPUESTA: 'Propuesta',
  PUBLICADA: 'Publicada',
}

function FormularioNotas({
  ruta,
  inicial,
  editable: editableEnServidor,
  alGuardar,
  alEnviar,
  alSincronizar,
  alEditar,
  alBloquear,
}: {
  ruta: string
  inicial: NotaAlumno[]
  editable: boolean
  alGuardar: () => void
  alEnviar: (enviada: NotasEvaluacion | null) => void
  alSincronizar: (notas: NotasEvaluacion) => void
  alEditar: () => void
  alBloquear: (mensaje: string) => void
}) {
  const { fetchConSesion } = useAuth()
  // Las notas como están en el servidor y lo que muestra cada campo. Después
  // de guardar, las dos se reinician con lo que devuelve el servidor, cambie
  // o no: otro ayudante pudo restaurar la misma nota antes de la recarga.
  const [alumnos, setAlumnos] = useState(inicial)
  const [valores, setValores] = useState<Record<string, string>>(() =>
    valoresDe(inicial),
  )
  const [guardando, setGuardando] = useState(false)
  // Un 409 bloquea en el acto, sin esperar la recarga: el servidor ya no
  // acepta cambios y lo escrito mientras tanto se perdería. Dura hasta que
  // el estado nuevo reinicia el formulario.
  const [bloqueada, setBloqueada] = useState(false)
  const editable = editableEnServidor && !bloqueada
  const [error, setError] = useState<string | null>(null)
  // Motivos que devolvió el último 400, por alumno; se borra al editar el
  // campo.
  const [rechazadas, setRechazadas] = useState<Record<string, string>>({})
  const idMotivo = useId()
  // Solo se envían los campos con un valor distinto del guardado, comparados
  // como número: "5.50" sobre un 5,5 no es un cambio. Un campo vacío no borra
  // la nota: nada se elimina.
  const cambios = alumnos.filter(
    (a) => valores[a.id].trim() !== '' && leerNota(valores[a.id]) !== a.nota,
  )
  const motivos: Record<string, string | null> = Object.fromEntries(
    alumnos.map((a) => [
      a.id,
      motivoDe(valores[a.id]) ?? rechazadas[a.id] ?? null,
    ]),
  )
  const hayInvalidas = alumnos.some((a) => motivos[a.id] !== null)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Se envía lo guardado: todas las notas guardadas y nada pendiente.
  const faltanNotas = alumnos.some((a) => a.nota === null)
  const puedeEnviar =
    !faltanNotas && cambios.length === 0 && !hayInvalidas && !guardando

  async function enviar() {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetchConSesion(`${ruta}/envio`, { method: 'POST' })
      if (res.ok) {
        // La confirmación sigue abierta (y los campos en solo lectura) hasta
        // que el estado nuevo reinicia el formulario.
        alEnviar((await res.json().catch(() => null)) as NotasEvaluacion | null)
        return
      }
      const cuerpo = (await res.json().catch(() => null)) as
        | (Partial<Pick<ErrorNotasFaltantes, 'faltantes'>> & {
            message?: unknown
          })
        | null
      if (res.status === 409) {
        setBloqueada(true)
        setConfirmando(false)
        alBloquear(mensajeDe(cuerpo, 'Las notas ya no se pueden enviar'))
        return
      }
      // 400: otro ayudante cambió la lista o falta una nota.
      const faltantes = Array.isArray(cuerpo?.faltantes)
        ? alumnos
            .filter((a) => cuerpo.faltantes?.includes(a.id))
            .map((a) => a.nombre)
        : []
      setError(
        faltantes.length
          ? `Faltan notas de: ${faltantes.join(', ')}.`
          : res.status === 400 && typeof cuerpo?.message === 'string'
            ? `${cuerpo.message}.`
            : 'No pudimos enviar las notas. Inténtalo nuevamente.',
      )
    } catch {
      setError(
        'No pudimos enviar las notas. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  function reiniciar(delServidor: NotaAlumno[]) {
    setAlumnos(delServidor)
    setValores(valoresDe(delServidor))
    setRechazadas({})
  }

  // Aplica la respuesta completa: otro ayudante pudo enviar la evaluación
  // entre el PUT y la recarga, y el estado nuevo la deja en solo lectura.
  function sincronizar(notas: NotasEvaluacion) {
    reiniciar(notas.alumnos)
    alSincronizar(notas)
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Enter en un campo de solo lectura también envía el formulario.
    if (!editable || confirmando || cambios.length === 0) return
    setGuardando(true)
    setError(null)
    const datos: GuardarNotas = {
      notas: cambios.map((a) => ({
        alumnoId: a.id,
        nota: leerNota(valores[a.id]),
      })),
    }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as
          | (Partial<Pick<ErrorNotasInvalidas, 'invalidas'>> & {
              message?: unknown
            })
          | null
        // NOT-08: 409, la evaluación se envió o se aprobó mientras tanto.
        if (res.status === 409) {
          setBloqueada(true)
          alBloquear(mensajeDe(cuerpo, 'Las notas ya no se pueden editar'))
          return
        }
        // 400: una nota inválida (con su motivo por alumno, NOT-06) o la lista
        // de alumnos cambió.
        if (res.status === 400 && Array.isArray(cuerpo?.invalidas)) {
          setRechazadas(
            Object.fromEntries(
              cuerpo.invalidas.map(({ alumnoId, motivo }) => [
                alumnoId,
                motivo,
              ]),
            ),
          )
        }
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? `${cuerpo.message}.`
            : 'No pudimos guardar las notas. Inténtalo nuevamente.',
        )
        return
      }
      alGuardar()
      // El PUT devuelve las notas como quedaron; la recarga trae además lo que
      // otros guardaron después. Si la recarga falla, queda lo que confirmó el
      // PUT: ningún campo conserva un valor que el servidor no confirmó.
      const guardadas = (await res
        .json()
        .catch(() => null)) as NotasEvaluacion | null
      try {
        const recarga = await fetchConSesion(ruta)
        if (!recarga.ok) throw new Error(`GET ${recarga.status}`)
        sincronizar((await recarga.json()) as NotasEvaluacion)
      } catch {
        if (guardadas) sincronizar(guardadas)
        else reiniciar(alumnos)
        setError(
          'Las notas se guardaron, pero no pudimos recargarlas. Vuelve a abrir la evaluación para ver la lista actualizada.',
        )
      }
    } catch {
      setError(
        'No pudimos guardar las notas. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      // Hasta aquí Guardar sigue deshabilitado (un segundo clic no envía otro
      // PUT); con éxito, error del PUT o error de la recarga, se desbloquea.
      setGuardando(false)
    }
  }

  return (
    <form
      className="notas__ingreso"
      aria-label="Ingresar notas"
      onSubmit={(event) => void guardar(event)}
    >
      <table className="notas__tabla">
        <thead>
          <tr>
            <th scope="col">Alumno</th>
            <th scope="col">Nota</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map((alumno) => {
            const motivo = motivos[alumno.id]
            return (
              <tr key={alumno.id}>
                <td>{alumno.nombre}</td>
                <td>
                  {/* Texto y no number: el navegador descartaría "5,5". */}
                  <input
                    className={
                      motivo
                        ? 'notas__nota notas__nota--invalida'
                        : 'notas__nota'
                    }
                    type="text"
                    inputMode="decimal"
                    aria-label={`Nota de ${alumno.nombre}`}
                    aria-invalid={motivo ? true : undefined}
                    aria-describedby={
                      motivo ? `${idMotivo}-${alumno.id}` : undefined
                    }
                    value={valores[alumno.id]}
                    // Una nota publicada la cambia el profesor (NOT-15). Mientras
                    // guarda tampoco: la recarga reinicia el formulario y
                    // borraría lo escrito después de enviar.
                    disabled={guardando || alumno.estado === 'PUBLICADA'}
                    // NOT-08: enviada a revisión o aprobada, solo se lee.
                    // Tampoco mientras se confirma el envío: se envía lo
                    // guardado.
                    readOnly={!editable || confirmando}
                    onChange={(event) => {
                      alEditar()
                      setValores((actuales) => ({
                        ...actuales,
                        [alumno.id]: event.target.value,
                      }))
                      setRechazadas((actuales) =>
                        Object.fromEntries(
                          Object.entries(actuales).filter(
                            ([id]) => id !== alumno.id,
                          ),
                        ),
                      )
                    }}
                  />
                  {/* Siempre montado: un lector de pantalla anuncia el motivo
                      cuando aparece (aria-live), mientras se escribe. */}
                  <span
                    id={`${idMotivo}-${alumno.id}`}
                    className="notas__motivo"
                    aria-live="polite"
                  >
                    {motivo}
                  </span>
                </td>
                <td>
                  {alumno.estado === null ? 'Sin nota' : ESTADO[alumno.estado]}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {editable && (
        <div className="notas__acciones">
          <button
            className="notas__boton"
            type="submit"
            // NOT-06: mientras haya una nota inválida no se guarda ninguna.
            disabled={
              cambios.length === 0 ||
              guardando ||
              hayInvalidas ||
              enviando ||
              confirmando
            }
          >
            Guardar borrador
          </button>
          <button
            className="notas__boton"
            type="button"
            disabled={!puedeEnviar || enviando || confirmando}
            onClick={() => setConfirmando(true)}
          >
            Enviar a revisión
          </button>
        </div>
      )}
      {editable && faltanNotas && (
        <p className="dashboard__texto">
          Para enviar a revisión, todos los alumnos deben tener una nota
          guardada.
        </p>
      )}
      {confirmando && (
        <section className="notas__confirmacion" aria-label="Confirmar envío">
          <p>
            ¿Enviar las notas a revisión? No podrás editarlas hasta que el
            profesor responda.
          </p>
          <button
            className="notas__boton"
            type="button"
            disabled={enviando || !puedeEnviar}
            onClick={() => void enviar()}
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
          <button
            className="notas__boton"
            type="button"
            disabled={enviando}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </button>
        </section>
      )}
      {error && (
        <p className="notas__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
