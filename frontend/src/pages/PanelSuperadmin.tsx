import type {
  CrearUniversidad,
  ElegirContexto,
  UniversidadElegible,
  UsuarioSesion,
} from '@cursus/shared'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useSession } from '../session/session'
import './Carreras.css'
import { FormularioUniversidad } from './FormularioUniversidad'
import './PanelSuperadmin.css'
import {
  enviar,
  RUTA_UNIVERSIDADES,
  rutaAdministrarUniversidad,
} from './superadmin'
import { useDatos } from './useDatos'

// MT-04: Dashboard del superadmin. Muestra las universidades con sus
// facultades; al elegir una facultad, la app pasa a trabajar en ella con las
// vistas del Administrativo. Desde aquí crea universidades y entra a
// administrar cada una (GES-23). No tiene vista en el Figma: usa la misma card
// que el resto del Dashboard.
export function PanelSuperadmin() {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [universidades, recargar] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (universidades === undefined) {
    return <Cargando texto="Cargando las universidades…" />
  }
  if (universidades === null) {
    return (
      <ErrorEstado
        mensaje="No se pudieron cargar las universidades."
        onReintentar={recargar}
      />
    )
  }

  async function elegir(eleccion: ElegirContexto) {
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/superadmin/contexto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eleccion),
      })
      if (respuesta.ok) {
        reemplazarUsuario((await respuesta.json()) as UsuarioSesion)
        void navigate('/cursos')
        return
      }
      setError(
        respuesta.status === 404
          ? 'Esa facultad ya no está disponible. Recarga la página y elige otra.'
          : 'No se pudo entrar a la facultad.',
      )
    } catch {
      setError('No se pudo entrar a la facultad.')
    }
    setEnviando(false)
  }

  async function crear(datos: CrearUniversidad): Promise<string | null> {
    const resultado = await enviar<UniversidadElegible>(
      fetchConSesion,
      RUTA_UNIVERSIDADES,
      'POST',
      datos,
    )
    if (!resultado.ok) return resultado.error
    setCreando(false)
    setAviso(`${resultado.datos.nombre} creada`)
    recargar()
    return null
  }

  // La sesión trae el nombre de la facultad elegida, no su id.
  const esLaActual = (universidadId: string, facultad: string) =>
    user.universidadId === universidadId && user.facultadNombre === facultad

  return (
    <>
      <div className="panel-superadmin__intro">
        <div>
          <h2 className="dashboard__titulo">Universidades</h2>
          <p className="dashboard__texto">
            Elige una facultad para trabajar en ella con las vistas del
            Administrativo. Cada cambio que hagas queda registrado.
          </p>
        </div>
        {!creando && (
          <button
            type="button"
            className="panel-superadmin__nueva"
            onClick={() => {
              setCreando(true)
              setAviso(null)
            }}
          >
            Nueva universidad
          </button>
        )}
      </div>
      {aviso && (
        <p className="panel-superadmin__aviso" role="status">
          {aviso}
        </p>
      )}
      {creando && (
        <div className="carreras">
          <FormularioUniversidad
            titulo="Nueva universidad"
            textoBoton="Crear universidad"
            onGuardar={crear}
            onCancelar={() => setCreando(false)}
          />
        </div>
      )}
      {error && (
        <p className="panel-superadmin__error" role="alert">
          {error}
        </p>
      )}
      {universidades.length === 0 ? (
        <p className="dashboard__texto">Todavía no hay universidades.</p>
      ) : (
        <ul className="dashboard__tarjetas">
          {universidades.map((universidad) => (
            <li key={universidad.id}>
              <section
                className="panel-superadmin__tarjeta"
                aria-label={universidad.nombre}
              >
                <div className="panel-superadmin__cabecera">
                  <span
                    className="panel-superadmin__color"
                    style={{ background: universidad.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="dashboard__curso">{universidad.nombre}</h3>
                    <p className="dashboard__texto">
                      @{universidad.dominioCorreo}
                    </p>
                  </div>
                </div>
                {universidad.facultades.length === 0 ? (
                  <p className="dashboard__texto">
                    Esta universidad no tiene facultades.
                  </p>
                ) : (
                  <ul className="panel-superadmin__facultades">
                    {universidad.facultades.map((facultad) => (
                      <li key={facultad.id}>
                        {esLaActual(universidad.id, facultad.nombre) ? (
                          <p className="panel-superadmin__actual">
                            {facultad.nombre}
                            <span className="panel-superadmin__marca">
                              Trabajando aquí
                            </span>
                          </p>
                        ) : (
                          <button
                            type="button"
                            className="panel-superadmin__facultad"
                            disabled={enviando}
                            aria-label={`Trabajar en ${facultad.nombre}, ${universidad.nombre}`}
                            onClick={() =>
                              void elegir({
                                universidadId: universidad.id,
                                facultadId: facultad.id,
                              })
                            }
                          >
                            {facultad.nombre}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  className="panel-superadmin__administrar"
                  to={rutaAdministrarUniversidad(universidad.id)}
                  aria-label={`Administrar ${universidad.nombre}`}
                >
                  Administrar
                </Link>
              </section>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
