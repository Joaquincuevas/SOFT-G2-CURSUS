import {
  LARGO_MOTIVO_ASIGNACION,
  type BusquedaIntegrantes,
  type IntegrantesSeccion as DatosIntegrantes,
  type PersonaIntegrante,
  type RolIntegrante,
} from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import { CargarAlumnosCsvDialogo } from './CargarAlumnosCsv'
import { useDatos } from './useDatos'
import './Cursos.css'
import './IntegrantesSeccion.css'

const TIPOS: { rol: RolIntegrante; nombre: string }[] = [
  { rol: 'PROFESOR', nombre: 'Profesores' },
  { rol: 'AYUDANTE', nombre: 'Ayudantes' },
  { rol: 'ALUMNO', nombre: 'Alumnos' },
]

export function IntegrantesSeccion() {
  const { id = '' } = useParams()
  const puede = usePuede('update', 'Seccion')
  return puede ? (
    <Integrantes key={id} id={id} />
  ) : (
    <Navigate to="/cursos" replace />
  )
}
function Integrantes({ id }: { id: string }) {
  const [datos, recargar, status, fijar] = useDatos<DatosIntegrantes>(
    `/api/secciones/${id}/integrantes`,
  )
  const [parametros, cambiarParametros] = useSearchParams()
  const rol =
    TIPOS.find((t) => t.rol === parametros.get('rol'))?.rol ?? 'PROFESOR'
  const [ocupado, setOcupado] = useState(false)
  if (datos === undefined) return <Cargando texto="Cargando integrantes…" />
  if (datos === null && (status === 404 || status === 400))
    return (
      <section className="cursos">
        <Link to="/cursos" className="cursos__enlace">
          ← Volver a cursos
        </Link>
        <h2 className="cursos__titulo">Sección no encontrada</h2>
        <p>La sección no existe o no pertenece a tu facultad.</p>
      </section>
    )
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No se pudieron cargar los integrantes."
        onReintentar={recargar}
      />
    )
  const { seccion, integrantes } = datos
  return (
    <section className="cursos" aria-label="Integrantes de la sección">
      <Link
        className="cursos__enlace"
        to={`/cursos/${seccion.curso.id}`}
        onClick={(e) => {
          if (ocupado) e.preventDefault()
        }}
      >
        ← Volver al curso
      </Link>
      <header className="cursos__encabezado">
        <h2 className="cursos__titulo">
          Integrantes · Sección {seccion.numero}
        </h2>
        <p className="cursos__subtitulo">
          {seccion.curso.codigo} · {seccion.curso.nombre}
        </p>
      </header>
      <div
        className="integrantes__tipos"
        role="group"
        aria-label="Tipo de integrante"
      >
        {TIPOS.map((tipo) => (
          <button
            key={tipo.rol}
            type="button"
            className={`cursos__boton ${rol === tipo.rol ? '' : 'cursos__boton--secundario'}`}
            aria-pressed={rol === tipo.rol}
            disabled={ocupado}
            onClick={() => cambiarParametros({ rol: tipo.rol })}
          >
            {tipo.nombre} (
            {integrantes.filter((p) => p.rol === tipo.rol).length})
          </button>
        ))}
      </div>
      <GrupoIntegrantes
        key={rol}
        seccion={seccion}
        rol={rol}
        personas={integrantes.filter((p) => p.rol === rol)}
        alOcupar={setOcupado}
        alRecargar={recargar}
        alCambiar={(persona, agregar) => {
          fijar({
            ...datos,
            integrantes: agregar
              ? [
                  ...integrantes.filter(
                    (p) => p.id !== persona.id || p.rol !== persona.rol,
                  ),
                  persona,
                ]
              : integrantes.filter(
                  (p) => p.id !== persona.id || p.rol !== persona.rol,
                ),
          })
          recargar()
        }}
      />
    </section>
  )
}
function GrupoIntegrantes({
  seccion,
  rol,
  personas,
  alOcupar,
  alRecargar,
  alCambiar,
}: {
  seccion: DatosIntegrantes['seccion']
  rol: RolIntegrante
  personas: PersonaIntegrante[]
  alOcupar: (valor: boolean) => void
  alRecargar: () => void
  alCambiar: (persona: PersonaIntegrante, agregar: boolean) => void
}) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/secciones/${seccion.id}/integrantes`
  const [busqueda, setBusqueda] = useState('')
  const [consulta, setConsulta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<PersonaIntegrante | null>(null)
  const [csv, setCsv] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  function ocupar(valor: boolean) {
    setOcupado(valor)
    alOcupar(valor)
  }
  async function agregar(persona: PersonaIntegrante) {
    if (ocupado) return
    ocupar(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol, usuarioId: persona.id }),
      })
      if (!res.ok) {
        setError(await mensajeError(res, 'No se pudo agregar al integrante.'))
        if ([400, 404, 409].includes(res.status)) {
          setConsulta(null)
          alRecargar()
        }
        return
      }
      alCambiar(persona, true)
      setConsulta(null)
      setBusqueda('')
      setAviso(`${persona.nombre} agregado a la sección.`)
    } catch {
      setError(
        'No se pudo agregar al integrante. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      ocupar(false)
    }
  }
  const nombre = TIPOS.find((t) => t.rol === rol)!.nombre
  return (
    <>
      <div className="cursos__tarjeta integrantes__panel">
        <h3 className="cursos__titulo-dialogo">{nombre}</h3>
        <form
          className="integrantes__buscar"
          aria-label="Buscar integrantes"
          onSubmit={(e) => {
            e.preventDefault()
            if (busqueda.trim().length >= 2 && !ocupado) {
              setError(null)
              setAviso(null)
              setConsulta(busqueda.trim())
            }
          }}
        >
          <label className="cursos__campo">
            Buscar por correo o nombre
            <input
              className="cursos__input"
              type="search"
              value={busqueda}
              minLength={2}
              maxLength={150}
              required
              disabled={ocupado}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setConsulta(null)
              }}
              placeholder="Escribe al menos dos caracteres"
            />
          </label>
          <button
            className="cursos__boton"
            type="submit"
            disabled={ocupado || busqueda.trim().length < 2}
          >
            Buscar
          </button>
        </form>
        {consulta !== null && (
          <Resultados
            key={consulta}
            ruta={`${ruta}/buscar?rol=${rol}&q=${encodeURIComponent(consulta)}`}
            ocupado={ocupado}
            alAgregar={(persona) => void agregar(persona)}
          />
        )}
        {rol === 'ALUMNO' && (
          <div className="cursos__acciones">
            <button
              type="button"
              className="cursos__boton cursos__boton--secundario"
              disabled={ocupado}
              onClick={() => setNuevo(true)}
            >
              Crear alumno e inscribir
            </button>
            <button
              type="button"
              className="cursos__boton cursos__boton--secundario"
              aria-label={`Cargar CSV en la sección ${seccion.numero}`}
              disabled={ocupado}
              onClick={() => setCsv(true)}
            >
              Cargar CSV
            </button>
          </div>
        )}
        {rol === 'ALUMNO' ? (
          <p className="cursos__mensaje">
            Busca una cuenta existente. Si el alumno aún no tiene cuenta, puedes
            crearla e inscribirlo o usar la carga CSV.
          </p>
        ) : (
          <p className="cursos__mensaje">
            Busca una cuenta existente de tu universidad. Si aún no existe,
            créala en{' '}
            <Link className="cursos__enlace" to="/docentes">
              Profesores y ayudantes
            </Link>
            .
          </p>
        )}
      </div>
      {error && (
        <p className="cursos__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="cursos__exito" role="status">
          {aviso}
        </p>
      )}
      <div className="cursos__tarjeta cursos__tabla-contenedor">
        {personas.length === 0 ? (
          <p className="cursos__mensaje">
            No hay {nombre.toLowerCase()} en esta sección.
          </p>
        ) : (
          <table className="cursos__tabla" aria-label={nombre}>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td>{persona.nombre}</td>
                  <td>{persona.correo}</td>
                  <td>
                    <button
                      type="button"
                      className="cursos__boton cursos__boton--secundario"
                      disabled={ocupado || quitando !== null}
                      aria-label={`Quitar a ${persona.nombre}`}
                      onClick={() => {
                        setError(null)
                        setAviso(null)
                        setQuitando(persona)
                      }}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {quitando && (
        <RetirarIntegrante
          ruta={ruta}
          persona={quitando}
          numero={seccion.numero}
          alOcupar={ocupar}
          alCerrar={() => setQuitando(null)}
          alRecargar={alRecargar}
          alRetirar={() => {
            alCambiar(quitando, false)
            setAviso(`${quitando.nombre} fue quitado de la sección.`)
            setQuitando(null)
          }}
        />
      )}
      {csv && (
        <CargarAlumnosCsvDialogo
          seccionId={seccion.id}
          numero={seccion.numero}
          onCargados={alRecargar}
          onCerrar={() => setCsv(false)}
        />
      )}
      {nuevo && (
        <AgregarAlumnoDialogo
          seccionId={seccion.id}
          numero={seccion.numero}
          correoInicial={busqueda.includes('@') ? busqueda : ''}
          onAgregado={alRecargar}
          onCerrar={() => setNuevo(false)}
        />
      )}
    </>
  )
}
function Resultados({
  ruta,
  ocupado,
  alAgregar,
}: {
  ruta: string
  ocupado: boolean
  alAgregar: (persona: PersonaIntegrante) => void
}) {
  const [datos, recargar] = useDatos<BusquedaIntegrantes>(ruta)
  if (datos === undefined) return <Cargando texto="Buscando personas…" />
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No se pudo realizar la búsqueda."
        onReintentar={recargar}
      />
    )
  return (
    <div className="integrantes__resultados">
      {datos.personas.length === 0 ? (
        <p role="status">
          No hay personas disponibles que coincidan con la búsqueda.
        </p>
      ) : (
        <ul aria-label="Resultados de búsqueda">
          {datos.personas.map((persona) => (
            <li key={persona.id}>
              <span>
                <strong>{persona.nombre}</strong>
                <span className="integrantes__correo">{persona.correo}</span>
              </span>
              <button
                className="cursos__boton"
                type="button"
                aria-label={`Agregar a ${persona.nombre}`}
                disabled={ocupado}
                onClick={() => alAgregar(persona)}
              >
                Agregar
              </button>
            </li>
          ))}
        </ul>
      )}
      {datos.hayMas && (
        <p className="cursos__mensaje">
          Hay más coincidencias. Escribe más caracteres para acotar la búsqueda.
        </p>
      )}
    </div>
  )
}
async function mensajeError(res: Response, defecto: string) {
  const cuerpo = (await res.json().catch(() => null)) as {
    message?: unknown
  } | null
  const mensaje = Array.isArray(cuerpo?.message)
    ? cuerpo.message[0]
    : cuerpo?.message
  return res.status < 500 && typeof mensaje === 'string' ? mensaje : defecto
}
function RetirarIntegrante({
  ruta,
  persona,
  numero,
  alOcupar,
  alCerrar,
  alRetirar,
  alRecargar,
}: {
  ruta: string
  persona: PersonaIntegrante
  numero: number
  alOcupar: (valor: boolean) => void
  alCerrar: () => void
  alRetirar: () => void
  alRecargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])
  async function retirar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado || !motivo.trim()) return
    setOcupado(true)
    alOcupar(true)
    setError(null)
    try {
      const res = await fetchConSesion(`${ruta}/${persona.id}/quitar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: persona.rol, motivo: motivo.trim() }),
      })
      if (res.ok) {
        alRetirar()
        return
      }
      setError(await mensajeError(res, 'No se pudo quitar al integrante.'))
      if ([404, 409].includes(res.status)) alRecargar()
    } catch {
      setError('No se pudo quitar al integrante. Inténtalo nuevamente.')
    } finally {
      setOcupado(false)
      alOcupar(false)
    }
  }
  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="retirar-integrante-titulo"
      onClose={alCerrar}
      onCancel={(e) => {
        if (ocupado) e.preventDefault()
      }}
    >
      <h3 id="retirar-integrante-titulo" className="cursos__titulo-dialogo">
        Quitar integrante
      </h3>
      <p className="cursos__mensaje">
        ¿Quitar a {persona.nombre} ({persona.correo}) de la sección {numero}? Su
        cuenta se conserva y el retiro queda registrado.
      </p>
      <form className="cursos__formulario" onSubmit={(e) => void retirar(e)}>
        <label className="cursos__campo">
          Motivo
          <textarea
            className="cursos__input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            maxLength={LARGO_MOTIVO_ASIGNACION}
            rows={3}
            disabled={ocupado}
          />
        </label>
        {error && (
          <p className="cursos__error" role="alert">
            {error}
          </p>
        )}
        <div className="cursos__acciones">
          <button
            type="button"
            className="cursos__boton cursos__boton--secundario"
            disabled={ocupado}
            onClick={alCerrar}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="cursos__boton"
            disabled={ocupado || !motivo.trim()}
          >
            {ocupado ? 'Quitando…' : 'Quitar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
