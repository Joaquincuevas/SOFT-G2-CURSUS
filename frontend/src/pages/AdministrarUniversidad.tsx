import {
  type CrearUniversidad,
  type FacultadElegible,
  LARGO_NOMBRE_FACULTAD,
  type UniversidadElegible,
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
import { enviar, RUTA_UNIVERSIDADES } from './superadmin'
import { useDatos } from './useDatos'

// GES-23: el superadmin edita los datos de una universidad, la archiva y
// administra sus facultades. Se llega desde el Dashboard ("Administrar") y
// funciona sin universidad elegida. No tiene vista en el Figma: sigue el
// estilo de Carreras.
export function AdministrarUniversidad() {
  const { id } = useParams()
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [universidades, recargar] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [errorArchivar, setErrorArchivar] = useState<string | null>(null)

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
    setAviso('Datos de la universidad guardados')
    recargar()
    return null
  }

  async function archivar() {
    setErrorArchivar(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `${RUTA_UNIVERSIDADES}/${universidad?.id}/archivar`,
      'PATCH',
    )
    if (!resultado.ok) {
      setErrorArchivar(resultado.error)
      return
    }
    // Si trabajaba en ella, su elección dejó de valer: se pide la sesión de
    // nuevo para que la barra muestre la vista global.
    if (user.universidadId === universidad?.id) {
      const nuevo = await pedirUsuario(fetchConSesion)
      if (nuevo) reemplazarUsuario(nuevo)
    }
    void navigate('/')
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
        <Link className="administrar-universidad__volver" to="/">
          Volver al Dashboard
        </Link>
      </div>
      {aviso && (
        <p className="carreras__aviso" role="status">
          {aviso}
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
          <div className="carreras__panel">
            <h2>Archivar universidad</h2>
            <p>
              Deja de aparecer en las listas y sus usuarios ya no pueden iniciar
              sesión. Sus datos se conservan.
            </p>
            {errorArchivar && (
              <p className="carreras__error" role="alert">
                {errorArchivar}
              </p>
            )}
            {confirmando ? (
              <div className="carreras__acciones">
                <button
                  type="button"
                  className="carreras__primario"
                  onClick={() => void archivar()}
                >
                  Sí, archivar {universidad.nombre}
                </button>
                <button
                  type="button"
                  className="carreras__secundario"
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="carreras__secundario"
                onClick={() => setConfirmando(true)}
              >
                Archivar universidad
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
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

// Subrutas de /superadmin: por ahora, solo administrar una universidad.
export function RutasSuperadmin() {
  return (
    <Routes>
      <Route path="universidades/:id" element={<AdministrarUniversidad />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
