import type {
  CrearCurso,
  CursoCreado,
  Carrera,
  CursoListado,
  OpcionPeriodo,
} from '@cursus/shared'
import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede, useSession } from '../session/session'
import './Cursos.css'

// Gestión de cursos del Figma: listado (nodo 97:102, GES-03) y creación (nodo
// 97:202, GES-05).
export function Cursos() {
  const opciones = useOpciones()
  return (
    <Routes>
      <Route index element={<InicioCursos opciones={opciones} />} />
      <Route path="nuevo" element={<NuevoCurso opciones={opciones} />} />
      <Route path="*" element={<Navigate to="/cursos" replace />} />
    </Routes>
  )
}

// State con el que NuevoCurso vuelve a /cursos después de crear.
interface EstadoCreado {
  creado?: string
}

// GET con la sesión: undefined mientras carga y null si falla. `recargar`
// vuelve a pedir, para el botón Reintentar. Con `ruta` null no pide nada.
function useDatos<T>(ruta: string | null) {
  const { fetchConSesion } = useAuth()
  const [datos, setDatos] = useState<T | null>()
  const [intento, setIntento] = useState(0)
  // fetchConSesion cambia de identidad al navegar (useNavigate en
  // BrowserRouter); fuera de las dependencias, solo se pide de nuevo cuando
  // cambia la ruta o se reintenta.
  const pedir = useEffectEvent((url: string) => fetchConSesion(url))
  useEffect(() => {
    if (ruta === null) return
    let vigente = true
    void pedir(ruta)
      .then(async (respuesta) =>
        respuesta.ok ? ((await respuesta.json()) as T) : null,
      )
      .catch(() => null)
      .then((resultado) => {
        if (vigente) setDatos(resultado)
      })
    return () => {
      vigente = false
    }
  }, [ruta, intento])
  const recargar = () => {
    setDatos(undefined)
    setIntento((n) => n + 1)
  }
  return [datos, recargar] as const
}

// Carreras y períodos para los filtros del listado (GES-04) y el formulario
// de creación (GES-05). Se cargan una vez en Cursos y los usan las dos rutas,
// sin pedirlos de nuevo al pasar del listado al formulario. Solo los pide quien
// gestiona los cursos de su facultad.
interface Opciones {
  carreras: Carrera[] | null | undefined
  periodos: OpcionPeriodo[] | null | undefined
  recargar: () => void
}

function useOpciones(): Opciones {
  const gestiona = usePuede('create', 'Curso')
  const [carreras, recargarCarreras] = useDatos<Carrera[]>(
    gestiona ? '/api/carreras' : null,
  )
  const [periodos, recargarPeriodos] = useDatos<OpcionPeriodo[]>(
    gestiona ? '/api/periodos' : null,
  )
  return {
    carreras,
    periodos,
    recargar: () => {
      recargarCarreras()
      recargarPeriodos()
    },
  }
}

// Query de GET /api/cursos: solo los filtros elegidos ('' = todos).
function rutaCursos(carreraId: string, periodoId: string) {
  const query = new URLSearchParams()
  if (carreraId) query.set('carreraId', carreraId)
  if (periodoId) query.set('periodoId', periodoId)
  const texto = query.toString()
  return texto ? `/api/cursos?${texto}` : '/api/cursos'
}

function Encabezado({ titulo }: { titulo: string }) {
  const { user } = useSession()
  const periodo = user.periodoActivo
  const subtitulo = [
    user.facultadNombre ?? user.universidadNombre,
    periodo && `Período ${periodo.anio}-${periodo.semestre}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="cursos__encabezado">
      <h2 className="cursos__titulo">{titulo}</h2>
      <p className="cursos__subtitulo">{subtitulo}</p>
    </div>
  )
}

function BotonCrear() {
  return (
    <Link className="cursos__boton" to="/cursos/nuevo">
      Crear curso
    </Link>
  )
}

function InicioCursos({ opciones }: { opciones: Opciones }) {
  const puedeCrear = usePuede('create', 'Curso')
  const creado = (useLocation().state as EstadoCreado | null)?.creado
  const { carreras, periodos } = opciones
  const [carreraId, setCarreraId] = useState('')
  // Hasta que el usuario elige uno, el período es el activo (o todos si no
  // hay activo).
  const [periodoElegido, setPeriodoElegido] = useState<string>()
  const periodoId =
    periodoElegido ?? periodos?.find((periodo) => periodo.activo)?.id ?? ''

  // Quien filtra espera las opciones para pedir el listado ya con el período
  // activo; quien no filtra (el Director) lo pide sin filtros.
  const ruta = !puedeCrear
    ? '/api/cursos'
    : carreras && periodos
      ? rutaCursos(carreraId, periodoId)
      : null
  const [cursos, recargar] = useDatos<CursoListado[]>(ruta)
  // La API solo manda la universidad al Director, que ve todas.
  const conUniversidad = !!cursos?.some((curso) => curso.universidadNombre)
  const conFiltros = carreraId !== '' || periodoId !== ''

  let contenido
  if (puedeCrear && (carreras === null || periodos === null)) {
    contenido = (
      <ErrorEstado
        mensaje="No se pudieron cargar las carreras y los períodos."
        onReintentar={opciones.recargar}
      />
    )
  } else if (cursos === undefined) {
    contenido = <Cargando texto="Cargando cursos…" />
  } else if (cursos === null) {
    contenido = (
      <ErrorEstado
        mensaje="No se pudieron cargar los cursos."
        onReintentar={recargar}
      />
    )
  } else if (cursos.length === 0 && conFiltros) {
    contenido = (
      <div className="cursos__tarjeta cursos__vacio">
        <p className="cursos__mensaje">No hay cursos con estos filtros.</p>
      </div>
    )
  } else if (cursos.length === 0) {
    contenido = (
      <div className="cursos__tarjeta cursos__vacio">
        <p className="cursos__mensaje">Aún no hay cursos en tu facultad.</p>
        {puedeCrear && <BotonCrear />}
      </div>
    )
  } else {
    contenido = (
      <div className="cursos__tarjeta cursos__tabla-contenedor">
        <table className="cursos__tabla">
          <thead>
            <tr>
              {conUniversidad && <th scope="col">Universidad</th>}
              <th scope="col">Código</th>
              <th scope="col">Curso</th>
              <th scope="col">Carrera</th>
              <th scope="col">Período</th>
              <th scope="col">Secciones</th>
            </tr>
          </thead>
          <tbody>
            {cursos.map((curso) => (
              <tr key={curso.id}>
                {conUniversidad && <td>{curso.universidadNombre}</td>}
                <td>{curso.codigo}</td>
                <td>{curso.nombre}</td>
                <td>{curso.carreraNombre}</td>
                <td>
                  {curso.periodo.anio}-{curso.periodo.semestre}
                </td>
                <td>{curso.secciones}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section className="cursos" aria-label="Gestión de cursos">
      <Encabezado titulo="Gestión de cursos" />
      {creado && (
        <p className="cursos__exito" role="status">
          Curso {creado} creado.
        </p>
      )}
      {/* Con la lista vacía y sin filtros, el botón va solo en el estado vacío. */}
      {puedeCrear && (!!cursos?.length || conFiltros) && (
        <div>
          <BotonCrear />
        </div>
      )}
      {puedeCrear && carreras && periodos && (
        <div className="cursos__filtros" role="search" aria-label="Filtros">
          <label className="cursos__campo">
            Carrera
            <select
              className="cursos__input"
              value={carreraId}
              onChange={(event) => setCarreraId(event.target.value)}
            >
              <option value="">Todas</option>
              {carreras.map((carrera) => (
                <option key={carrera.id} value={carrera.id}>
                  {carrera.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cursos__campo">
            Período
            <select
              className="cursos__input"
              value={periodoId}
              onChange={(event) => setPeriodoElegido(event.target.value)}
            >
              <option value="">Todos</option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.anio}-{periodo.semestre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {contenido}
    </section>
  )
}

function NuevoCurso({ opciones }: { opciones: Opciones }) {
  const puedeCrear = usePuede('create', 'Curso')
  const { fetchConSesion } = useAuth()
  const navigate = useNavigate()
  const { carreras, periodos } = opciones
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!puedeCrear) {
    return <Navigate to="/cursos" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const curso: CrearCurso = {
      codigo: String(datos.get('codigo')),
      nombre: String(datos.get('nombre')),
      carreraId: String(datos.get('carreraId')),
      periodoId: String(datos.get('periodoId')),
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(curso),
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        CursoCreado & { message: string }
      >
      if (respuesta.ok) {
        navigate('/cursos', {
          state: { creado: cuerpo.codigo } satisfies EstadoCreado,
        })
        return
      }
      // El 409 (código repetido) y el 404 traen un mensaje para el usuario.
      setError(
        typeof cuerpo.message === 'string'
          ? cuerpo.message
          : 'No se pudo crear el curso.',
      )
    } catch {
      setError('No se pudo crear el curso.')
    }
    setEnviando(false)
  }

  let contenido
  if (carreras === undefined || periodos === undefined) {
    contenido = <Cargando texto="Cargando carreras y períodos…" />
  } else if (carreras === null || periodos === null) {
    contenido = (
      <ErrorEstado
        mensaje="No se pudieron cargar las carreras y los períodos."
        onReintentar={opciones.recargar}
      />
    )
  } else {
    // La API devuelve el período activo primero.
    const activo = periodos.find((periodo) => periodo.activo)
    contenido = (
      <form className="cursos__tarjeta" onSubmit={handleSubmit}>
        <div className="cursos__campos">
          <label className="cursos__campo">
            Código
            <input
              className="cursos__input"
              name="codigo"
              maxLength={20}
              placeholder="ICC4103"
              required
            />
          </label>
          <label className="cursos__campo">
            Nombre del curso
            <input
              className="cursos__input"
              name="nombre"
              maxLength={200}
              placeholder="Tecnologías Web"
              required
            />
          </label>
          <label className="cursos__campo">
            Carrera
            <select
              className="cursos__input"
              name="carreraId"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Selecciona una carrera
              </option>
              {carreras.map((carrera) => (
                <option key={carrera.id} value={carrera.id}>
                  {carrera.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cursos__campo">
            Período académico
            <select
              className="cursos__input"
              name="periodoId"
              defaultValue={activo?.id ?? ''}
              required
            >
              <option value="" disabled>
                Selecciona un período
              </option>
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.anio}-{periodo.semestre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="cursos__error" role="alert">
            {error}
          </p>
        )}
        <div className="cursos__acciones">
          <button className="cursos__boton" type="submit" disabled={enviando}>
            Crear curso
          </button>
          <Link
            className="cursos__boton cursos__boton--secundario"
            to="/cursos"
          >
            Cancelar
          </Link>
        </div>
      </form>
    )
  }

  return (
    <section className="cursos" aria-label="Crear curso">
      <div className="cursos__encabezado">
        <h2 className="cursos__titulo">Información del curso</h2>
      </div>
      {contenido}
    </section>
  )
}
