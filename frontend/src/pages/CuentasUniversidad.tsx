import {
  type CuentaCreada,
  type CuentaUniversidad,
  type GuardarCuenta,
  LARGO_NOMBRE_USUARIO,
  ROLES_CUENTA,
  type RolCuenta,
  type UniversidadElegible,
} from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import '../components/estados.css'
import { ROL_LABEL } from '../session/roles'
import './AdministrarUniversidad.css'
import './Carreras.css'
import './CuentasUniversidad.css'
import './Cursos.css'
import { PasswordProvisoria } from './PasswordProvisoria'
import {
  enviar,
  rutaAdministrarUniversidad,
  RUTA_UNIVERSIDADES,
} from './superadmin'
import { useDatos } from './useDatos'

// GES-24: el superadmin crea, edita y archiva cuentas de cualquier rol en una
// universidad. Se llega desde "Administrar universidad" y funciona sin
// universidad elegida. No tiene vista en el Figma: sigue el estilo de Carreras.
export function CuentasUniversidad() {
  const { id = '' } = useParams()
  const [universidades, recargarUniversidades] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)

  if (universidades === undefined) return <Cargando />
  if (universidades === null) {
    return (
      <ErrorEstado
        mensaje="No se pudo cargar la universidad."
        onReintentar={recargarUniversidades}
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
  return <Cuentas key={universidad.id} universidad={universidad} />
}

function Cuentas({ universidad }: { universidad: UniversidadElegible }) {
  const { fetchConSesion } = useAuth()
  const ruta = `${RUTA_UNIVERSIDADES}/${universidad.id}/cuentas`
  const [cuentas, recargar] = useDatos<CuentaUniversidad[]>(ruta)
  const [editando, setEditando] = useState<CuentaUniversidad | null>(null)
  const [porArchivar, setPorArchivar] = useState<CuentaUniversidad | null>(null)
  const [archivando, setArchivando] = useState(false)
  const [creada, setCreada] = useState<CuentaCreada | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [rol, setRol] = useState<RolCuenta | ''>('')
  // Reinicia el formulario después de crear una cuenta.
  const [formulario, setFormulario] = useState(0)

  async function guardar(datos: GuardarCuenta): Promise<string | null> {
    setAviso(null)
    if (editando) {
      const resultado = await enviar<CuentaUniversidad>(
        fetchConSesion,
        `${ruta}/${editando.id}`,
        'PATCH',
        datos,
      )
      if (!resultado.ok) return resultado.error
      setAviso(`Cuenta de ${resultado.datos.nombre} guardada`)
      setEditando(null)
    } else {
      const resultado = await enviar<CuentaCreada>(
        fetchConSesion,
        ruta,
        'POST',
        datos,
      )
      if (!resultado.ok) return resultado.error
      setCreada(resultado.datos)
      setFormulario((n) => n + 1)
    }
    recargar()
    return null
  }

  async function archivar(cuenta: CuentaUniversidad) {
    setArchivando(true)
    setError(null)
    setAviso(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `${ruta}/${cuenta.id}/archivar`,
      'PATCH',
    )
    setArchivando(false)
    setPorArchivar(null)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    if (editando?.id === cuenta.id) setEditando(null)
    setAviso(`Cuenta de ${cuenta.nombre} archivada`)
    recargar()
  }

  const texto = buscar.trim().toLowerCase()
  const visibles = (cuentas ?? []).filter(
    (cuenta) =>
      (!rol || cuenta.rol === rol) &&
      (!texto ||
        cuenta.nombre.toLowerCase().includes(texto) ||
        cuenta.correo.includes(texto)),
  )

  return (
    <section className="carreras" aria-label="Cuentas de la universidad">
      <div className="carreras__intro">
        <div>
          <h2>Cuentas de {universidad.nombre}</h2>
          <p>
            Correos @{universidad.dominioCorreo}. Cada cambio queda registrado.
          </p>
        </div>
        <Link
          className="administrar-universidad__volver"
          to={rutaAdministrarUniversidad(universidad.id)}
        >
          Volver a la universidad
        </Link>
      </div>
      {aviso && (
        <p className="carreras__aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="carreras__columnas">
        <div className="carreras__panel">
          <h2>Cuentas vigentes</h2>
          {error && (
            <p className="carreras__error" role="alert">
              {error}
            </p>
          )}
          <div className="cuentas__filtros">
            <label>
              Buscar
              <input
                type="search"
                value={buscar}
                onChange={(event) => setBuscar(event.target.value)}
                placeholder="Nombre o correo"
              />
            </label>
            <label>
              Filtrar por rol
              <select
                value={rol}
                onChange={(event) =>
                  setRol(event.target.value as RolCuenta | '')
                }
              >
                <option value="">Todos</option>
                {ROLES_CUENTA.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {ROL_LABEL[opcion]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {porArchivar && (
            <p className="administrar-universidad__afectados" role="status">
              {porArchivar.nombre} dejará de poder iniciar sesión, y sus datos
              se conservan. Si tiene secciones a cargo, seguirán mostrándola
              hasta que se asigne a otra persona.
            </p>
          )}
          {cuentas === undefined ? (
            <Cargando texto="Cargando las cuentas…" />
          ) : cuentas === null ? (
            <ErrorEstado
              mensaje="No se pudieron cargar las cuentas."
              onReintentar={recargar}
            />
          ) : visibles.length === 0 ? (
            <p>
              {cuentas.length === 0
                ? 'Esta universidad todavía no tiene cuentas.'
                : 'Ninguna cuenta coincide con la búsqueda.'}
            </p>
          ) : (
            <table className="carreras__tabla">
              <caption>Cuentas de {universidad.nombre}</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Facultad</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((cuenta) => (
                  <tr key={cuenta.id}>
                    <td>{cuenta.nombre}</td>
                    <td>{cuenta.correo}</td>
                    <td>{ROL_LABEL[cuenta.rol]}</td>
                    <td>{cuenta.facultad?.nombre ?? 'Sin facultad'}</td>
                    <td>
                      {porArchivar?.id === cuenta.id ? (
                        <div className="carreras__acciones">
                          <button
                            type="button"
                            className="carreras__primario"
                            disabled={archivando}
                            onClick={() => void archivar(cuenta)}
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            className="carreras__secundario"
                            disabled={archivando}
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
                            disabled={archivando}
                            aria-label={`Editar ${cuenta.nombre}`}
                            onClick={() => {
                              setEditando(cuenta)
                              setAviso(null)
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="carreras__secundario"
                            disabled={archivando}
                            aria-label={`Archivar ${cuenta.nombre}`}
                            onClick={() => {
                              setPorArchivar(cuenta)
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
        </div>
        <FormularioCuenta
          // La key vuelve a los datos iniciales al cambiar de cuenta.
          key={editando?.id ?? `nueva-${formulario}`}
          universidad={universidad}
          inicial={editando}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
        />
      </div>
      {creada && (
        <DialogoCuentaCreada creada={creada} onCerrar={() => setCreada(null)} />
      )}
    </section>
  )
}

// Crear o editar una cuenta. La facultad se pide solo para un Administrativo.
function FormularioCuenta({
  universidad,
  inicial,
  onGuardar,
  onCancelar,
}: {
  universidad: UniversidadElegible
  inicial: CuentaUniversidad | null
  onGuardar: (datos: GuardarCuenta) => Promise<string | null>
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [correo, setCorreo] = useState(inicial?.correo ?? '')
  const [rol, setRol] = useState<RolCuenta>(inicial?.rol ?? 'DIRECTOR')
  const [facultadId, setFacultadId] = useState(inicial?.facultad?.id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esAdministrativo = rol === 'ADMINISTRATIVO'

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const mensaje = await onGuardar({
      nombre: nombre.trim().replace(/\s+/gu, ' '),
      correo: correo.trim(),
      rol,
      ...(esAdministrativo ? { facultadId } : {}),
    })
    // Al guardar bien, la key del formulario lo reemplaza por uno nuevo.
    setGuardando(false)
    setError(mensaje)
  }

  return (
    <form
      className="carreras__panel carreras__formulario"
      aria-label={inicial ? 'Editar cuenta' : 'Nueva cuenta'}
      onSubmit={(event) => void guardar(event)}
    >
      <h2>{inicial ? `Editar a ${inicial.nombre}` : 'Nueva cuenta'}</h2>
      <label htmlFor="cuenta-nombre">Nombre</label>
      <input
        id="cuenta-nombre"
        value={nombre}
        onChange={(event) => setNombre(event.target.value)}
        maxLength={LARGO_NOMBRE_USUARIO}
        required
        disabled={guardando}
        autoComplete="off"
      />
      <label htmlFor="cuenta-correo">Correo institucional</label>
      <input
        id="cuenta-correo"
        type="email"
        value={correo}
        onChange={(event) => setCorreo(event.target.value)}
        placeholder={`nombre@${universidad.dominioCorreo}`}
        required
        disabled={guardando}
        autoComplete="off"
      />
      <label htmlFor="cuenta-rol">Rol</label>
      <select
        id="cuenta-rol"
        className="cuentas__select"
        value={rol}
        onChange={(event) => setRol(event.target.value as RolCuenta)}
        disabled={guardando}
      >
        {ROLES_CUENTA.map((opcion) => (
          <option key={opcion} value={opcion}>
            {ROL_LABEL[opcion]}
          </option>
        ))}
      </select>
      {esAdministrativo && (
        <>
          <label htmlFor="cuenta-facultad">Facultad</label>
          <select
            id="cuenta-facultad"
            className="cuentas__select"
            value={facultadId}
            onChange={(event) => setFacultadId(event.target.value)}
            required
            disabled={guardando}
          >
            <option value="" disabled>
              Selecciona una facultad
            </option>
            {universidad.facultades.map((facultad) => (
              <option key={facultad.id} value={facultad.id}>
                {facultad.nombre}
              </option>
            ))}
          </select>
          {universidad.facultades.length === 0 && (
            <p>Primero crea una facultad en esta universidad.</p>
          )}
        </>
      )}
      <p>
        {inicial
          ? 'Si cambias el rol, se cerrarán sus sesiones abiertas.'
          : 'Recibirá una contraseña provisoria, que deberá cambiar al entrar.'}
      </p>
      {error && (
        <p className="carreras__error" role="alert">
          {error}
        </p>
      )}
      <div className="carreras__acciones">
        <button
          className="carreras__primario"
          type="submit"
          disabled={guardando}
        >
          {inicial ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
        {inicial && (
          <button
            className="carreras__secundario"
            type="button"
            disabled={guardando}
            onClick={onCancelar}
          >
            Cancelar edición
          </button>
        )}
      </div>
    </form>
  )
}

// La contraseña provisoria se muestra una sola vez: se descarta del estado al
// cerrar el diálogo.
function DialogoCuentaCreada({
  creada,
  onCerrar,
}: {
  creada: CuentaCreada
  onCerrar: () => void
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const { cuenta, passwordProvisoria } = creada

  // Modal nativo: atrapa el foco y cierra con Escape (evento close).
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="cuenta-universidad-creada"
      onClose={onCerrar}
    >
      <h3 id="cuenta-universidad-creada" className="cursos__titulo-dialogo">
        Cuenta de {ROL_LABEL[cuenta.rol]} creada
      </h3>
      <PasswordProvisoria
        nombre={cuenta.nombre}
        correo={cuenta.correo}
        password={passwordProvisoria}
        destinatario="a esa persona"
        onCerrar={onCerrar}
      />
    </dialog>
  )
}
