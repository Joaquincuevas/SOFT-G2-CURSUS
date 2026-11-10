import {
  colorConContraste,
  type CrearUniversidad,
  type FacultadElegible,
  LARGO_MOTIVO_ARCHIVAR,
  LARGO_NOMBRE_FACULTAD,
  type UniversidadElegible,
  type UsuariosAfectados,
} from '@cursus/shared'
import { type FormEvent, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import '../components/estados.css'
import { pedirUsuario, useSession } from '../session/session'
import './AdministrarUniversidad.css'
import './Carreras.css'
import { FormularioUniversidad } from './FormularioUniversidad'
import { CuentasUniversidad } from './CuentasUniversidad'
import {
  enviar,
  RUTA_UNIVERSIDADES,
  rutaCuentasUniversidad,
} from './superadmin'
import { useDatos } from './useDatos'

// GES-23: el superadmin edita los datos de una universidad, la archiva y
// administra sus facultades. Se llega desde el Dashboard ("Administrar") y
// funciona sin universidad elegida. No tiene vista en el Figma: sigue el
// estilo de Carreras.
export function AdministrarUniversidad() {
  const { id } = useParams()
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const [universidades, recargar] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)
  const [aviso, setAviso] = useState<string | null>(null)

  if (universidades === undefined) return <Cargando />
  if (universidades === null) {
    return (
      <ErrorEstado
        mensaje="No se pudo cargar la universidad."
        onReintentar={recargar}
      />
    )
  }
  const universidad = universidades.find((u) => u.id === id)
  if (!universidad) {
    return (
      <section className="estado" role="status">
        <h2 className="estado__titulo">Universidad no disponible</h2>
        <p className="estado__texto">
          La universidad no existe o está archivada.
        </p>
        <Link className="estado__boton" to="/">
          Volver al Dashboard
        </Link>
      </section>
    )
  }

  async function guardarDatos(datos: CrearUniversidad): Promise<string | null> {
    const resultado = await enviar<UniversidadElegible>(
      fetchConSesion,
      `${RUTA_UNIVERSIDADES}/${universidad?.id}`,
      'PATCH',
      datos,
    )
    if (!resultado.ok) return resultado.error
    // UI-04: si está trabajando en esta universidad, el cambio de color se
    // ve de inmediato. Las sesiones de otros usuarios lo leen al recargar.
    if (user.universidadId === resultado.datos.id) {
      reemplazarUsuario({
        ...user,
        universidadNombre: resultado.datos.nombre,
        universidadColor: resultado.datos.color,
      })
    }
    setAviso('Datos de la universidad guardados')
    recargar()
    return null
  }

  return (
    <section className="carreras" aria-label="Administrar universidad">
      <div className="carreras__intro">
        <div>
          <h2>{universidad.nombre}</h2>
          <p>
            Correos @{universidad.dominioCorreo}. Cada cambio queda registrado.
          </p>
        </div>
        <div className="carreras__acciones">
          <Link
            className="administrar-universidad__volver"
            to={rutaCuentasUniversidad(universidad.id)}
          >
            Administrar cuentas
          </Link>
          <Link className="administrar-universidad__volver" to="/">
            Volver al Dashboard
          </Link>
        </div>
      </div>
      {aviso && (
        <p className="carreras__aviso" role="status">
          {aviso}
        </p>
      )}
      {!colorConContraste(universidad.color) && (
        <p
          className="carreras__aviso"
          role="status"
          aria-label="Color institucional"
        >
          El color guardado no tiene contraste suficiente. Las sesiones de esta
          universidad usan el tema de CURSUS como respaldo. Elige un color más
          oscuro en Datos de la universidad.
        </p>
      )}
      <div className="carreras__columnas">
        <Facultades
          universidad={universidad}
          onCambio={(mensaje) => {
            setAviso(mensaje)
            recargar()
          }}
        />
        <div>
          <FormularioUniversidad
            key={`${universidad.nombre}-${universidad.dominioCorreo}-${universidad.color}`}
            inicial={universidad}
            titulo="Datos de la universidad"
            textoBoton="Guardar cambios"
            onGuardar={guardarDatos}
          />
          <ArchivarUniversidad universidad={universidad} />
        </div>
      </div>
    </section>
  )
}

// Archivar corta a todos sus usuarios y no se deshace por la API: antes de
// confirmar muestra a cuántos afecta y pide el motivo, que queda en
// superadmin_cambio.
function ArchivarUniversidad({
  universidad,
}: {
  universidad: UniversidadElegible
}) {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [archivando, setArchivando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [afectados, recargarAfectados] = useDatos<UsuariosAfectados>(
    confirmando
      ? `${RUTA_UNIVERSIDADES}/${universidad.id}/usuarios-afectados`
      : null,
  )

  function cancelar() {
    setConfirmando(false)
    setMotivo('')
    setError(null)
  }

  async function archivar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setArchivando(true)
    setError(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `${RUTA_UNIVERSIDADES}/${universidad.id}/archivar`,
      'PATCH',
      { motivo: motivo.trim() },
    )
    if (!resultado.ok) {
      setArchivando(false)
      setError(resultado.error)
      return
    }
    // Si trabajaba en ella, su elección dejó de valer: se pide la sesión de
    // nuevo para que la barra muestre la vista global.
    if (user.universidadId === universidad.id) {
      const nuevo = await pedirUsuario(fetchConSesion)
      if (nuevo) reemplazarUsuario(nuevo)
    }
    void navigate('/')
  }

  return (
    <div className="carreras__panel">
      <h2>Archivar universidad</h2>
      <p>
        Deja de aparecer en las listas y sus usuarios ya no pueden iniciar
        sesión. Sus datos se conservan, pero no se puede deshacer desde CURSUS.
      </p>
      {!confirmando ? (
        <button
          type="button"
          className="carreras__secundario"
          onClick={() => setConfirmando(true)}
        >
          Archivar universidad
        </button>
      ) : (
        <form
          className="carreras__formulario"
          aria-label="Confirmar archivo"
          onSubmit={(event) => void archivar(event)}
        >
          {afectados === undefined && <p role="status">Contando usuarios…</p>}
          {afectados === null && (
            <p className="carreras__error" role="alert">
              No se pudo contar a sus usuarios.{' '}
              <button
                type="button"
                className="carreras__secundario"
                onClick={recargarAfectados}
              >
                Reintentar
              </button>
            </p>
          )}
          {afectados && (
            <p className="administrar-universidad__afectados" role="status">
              {afectados.usuarios === 1
                ? '1 usuario dejará de poder iniciar sesión.'
                : `${afectados.usuarios} usuarios dejarán de poder iniciar sesión.`}
            </p>
          )}
          <label htmlFor="archivar-motivo">Motivo</label>
          <textarea
            id="archivar-motivo"
            className="administrar-universidad__motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={LARGO_MOTIVO_ARCHIVAR}
            rows={3}
            required
            disabled={archivando}
            placeholder="Por ejemplo: la universidad dejó el directorio"
          />
          <p>El motivo queda registrado con la fecha y tu nombre.</p>
          {error && (
            <p className="carreras__error" role="alert">
              {error}
            </p>
          )}
          <div className="carreras__acciones">
            <button
              type="submit"
              className="carreras__primario"
              disabled={archivando || !afectados || !motivo.trim()}
            >
              Sí, archivar {universidad.nombre}
            </button>
            <button
              type="button"
              className="carreras__secundario"
              disabled={archivando}
              onClick={cancelar}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// Facultades vigentes de la universidad: crear, renombrar y archivar.
function Facultades({
  universidad,
  onCambio,
}: {
  universidad: UniversidadElegible
  onCambio: (mensaje: string) => void
}) {
  const { fetchConSesion } = useAuth()
  const [nombre, setNombre] = useState('')
  const [editando, setEditando] = useState<FacultadElegible | null>(null)
  const [porArchivar, setPorArchivar] = useState<FacultadElegible | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function limpiar() {
    setNombre('')
    setEditando(null)
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const resultado = await enviar<FacultadElegible>(
      fetchConSesion,
      editando
        ? `/api/superadmin/facultades/${editando.id}`
        : `${RUTA_UNIVERSIDADES}/${universidad.id}/facultades`,
      editando ? 'PATCH' : 'POST',
      { nombre: nombre.trim().replace(/\s+/gu, ' ') },
    )
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onCambio(editando ? 'Facultad guardada' : 'Facultad creada')
    limpiar()
  }

  async function archivar(facultad: FacultadElegible) {
    setGuardando(true)
    setError(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `/api/superadmin/facultades/${facultad.id}/archivar`,
      'PATCH',
    )
    setGuardando(false)
    setPorArchivar(null)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onCambio(`${facultad.nombre} archivada`)
  }

  return (
    <div className="carreras__panel">
      <h2>Facultades</h2>
      {error && (
        <p className="carreras__error" role="alert">
          {error}
        </p>
      )}
      {universidad.facultades.length === 0 ? (
        <p>Esta universidad todavía no tiene facultades.</p>
      ) : (
        <table className="carreras__tabla">
          <caption>Facultades de {universidad.nombre}</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {universidad.facultades.map((facultad) => (
              <tr key={facultad.id}>
                <td>{facultad.nombre}</td>
                <td>
                  {porArchivar?.id === facultad.id ? (
                    <div className="carreras__acciones">
                      <button
                        type="button"
                        className="carreras__primario"
                        disabled={guardando}
                        onClick={() => void archivar(facultad)}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="carreras__secundario"
                        disabled={guardando}
                        onClick={() => setPorArchivar(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="carreras__acciones">
                      <button
                        type="button"
                        className="carreras__secundario"
                        disabled={guardando}
                        aria-label={`Editar ${facultad.nombre}`}
                        onClick={() => {
                          setEditando(facultad)
                          setNombre(facultad.nombre)
                          setError(null)
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="carreras__secundario"
                        disabled={guardando}
                        aria-label={`Archivar ${facultad.nombre}`}
                        onClick={() => {
                          setPorArchivar(facultad)
                          setError(null)
                        }}
                      >
                        Archivar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="carreras__formulario"
        aria-label={editando ? 'Editar facultad' : 'Nueva facultad'}
        onSubmit={(event) => void guardar(event)}
      >
        <label htmlFor="facultad-nombre">
          {editando ? 'Nuevo nombre de la facultad' : 'Nueva facultad'}
        </label>
        <input
          id="facultad-nombre"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          maxLength={LARGO_NOMBRE_FACULTAD}
          required
          disabled={guardando}
        />
        <div className="carreras__acciones">
          <button
            className="carreras__primario"
            type="submit"
            disabled={guardando}
          >
            {editando ? 'Guardar facultad' : 'Crear facultad'}
          </button>
          {editando && (
            <button
              className="carreras__secundario"
              type="button"
              disabled={guardando}
              onClick={limpiar}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// Subrutas de /superadmin: administrar una universidad y sus cuentas.
export function RutasSuperadmin() {
  return (
    <Routes>
      <Route path="universidades/:id" element={<AdministrarUniversidad />} />
      <Route
        path="universidades/:id/cuentas"
        element={<CuentasUniversidad />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
