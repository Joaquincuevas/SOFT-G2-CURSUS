import {
  csvDeErrores,
  MAX_BYTES_ARCHIVO_CSV,
  MAX_FILAS_ALUMNOS_CSV,
  MENSAJES_MOTIVO_CSV,
  type FilaCargaAlumnos,
  type ResultadoCargaAlumnos,
} from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { descargar } from './csvErrores'

export function CargarAlumnosCsvDialogo({
  seccionId,
  numero,
  onCargados,
  onCerrar,
}: {
  seccionId: string
  numero: number
  onCargados: (cantidad: number) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoCargaAlumnos | null>(null)
  const [copiada, setCopiada] = useState<string | null>(null)
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])
  const errores = (resultado?.filas ?? []).filter(
    (fila): fila is Extract<FilaCargaAlumnos, { estado: 'error' }> =>
      fila.estado === 'error',
  )

  async function cargar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = archivo.current?.files?.[0]
    setError(null)
    if (!file) {
      setError('Selecciona un archivo CSV.')
      return
    }
    // Límite del archivo bruto, que deja volver a subir el CSV de errores
    // (GES-17); el backend aplica los 48 KiB al contenido.
    if (file.size > MAX_BYTES_ARCHIVO_CSV) {
      setError('El archivo supera el máximo de 48 KiB.')
      return
    }
    setEnviando(true)
    let csv: string
    try {
      csv = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
    } catch {
      setError('No pudimos leer el archivo. Guárdalo como CSV UTF-8.')
      setEnviando(false)
      return
    }
    try {
      const res = await fetchConSesion(
        `/api/secciones/${seccionId}/alumnos/csv`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv }),
        },
      )
      const body = (await res
        .json()
        .catch(() => ({}))) as Partial<ResultadoCargaAlumnos> & {
        message?: unknown
      }
      if (!res.ok) {
        setError(
          res.status < 500 && typeof body.message === 'string'
            ? body.message
            : 'No se pudo iniciar la carga del CSV.',
        )
        return
      }
      const carga = body as ResultadoCargaAlumnos
      setResultado(carga)
      onCargados(carga.cargados)
    } catch {
      setError(
        'No pudimos recibir el resultado. Algunas filas podrían haberse cargado. Revisa la lista de alumnos antes de reintentar.',
      )
    } finally {
      setEnviando(false)
    }
  }

  async function copiar(correo: string, password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopiada(correo)
    } catch {
      setError('No se pudo copiar la contraseña; cópiala a mano.')
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo cursos__dialogo--csv"
      aria-labelledby="csv-alumnos-titulo"
      onClose={onCerrar}
      onCancel={(event) => {
        if (enviando) event.preventDefault()
      }}
    >
      <h3 id="csv-alumnos-titulo" className="cursos__titulo-dialogo">
        Cargar CSV en la sección {numero}
      </h3>
      {error && (
        <p role="alert" className="cursos__error">
          {error}
        </p>
      )}
      {resultado ? (
        <>
          <p role="status" className="cursos__exito">
            {resultado.cargados} de {resultado.total} cargados,{' '}
            {resultado.errores} con error.
          </p>
          {resultado.filas.some(
            (fila) => fila.estado === 'cargado' && fila.cuentaCreada,
          ) && (
            <p>
              Las contraseñas provisorias se muestran solo en este resultado.
              Cópialas antes de cerrar.
            </p>
          )}
          <ol className="cursos__resultado-csv">
            {resultado.filas.map(
              (fila) =>
                fila.estado === 'cargado' && (
                  <li key={fila.fila}>
                    <strong>
                      Fila {fila.fila}: {fila.correo}
                    </strong>
                    <p>
                      {fila.cuentaCreada
                        ? 'Cuenta creada e inscripción realizada.'
                        : 'Cuenta vinculada a la sección.'}
                    </p>
                    {fila.passwordProvisoria && (
                      <>
                        <p>
                          Contraseña provisoria:{' '}
                          <code>{fila.passwordProvisoria}</code>
                        </p>
                        <button
                          type="button"
                          className="cursos__boton cursos__boton--secundario"
                          aria-label={`Copiar contraseña de ${fila.correo}`}
                          onClick={() =>
                            void copiar(fila.correo, fila.passwordProvisoria!)
                          }
                        >
                          Copiar contraseña
                        </button>
                        {copiada === fila.correo && (
                          <p role="status">Contraseña copiada.</p>
                        )}
                      </>
                    )}
                  </li>
                ),
            )}
          </ol>
          {errores.length > 0 && (
            <>
              <div className="cursos__tabla-contenedor">
                <table className="cursos__tabla" aria-label="Filas con error">
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">Correo</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errores.map((fila) => (
                      <tr key={fila.fila}>
                        <td>{fila.fila}</td>
                        <td>{fila.correo || 'Sin correo'}</td>
                        <td>{fila.nombre}</td>
                        <td>{MENSAJES_MOTIVO_CSV[fila.motivo]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="cursos__boton cursos__boton--secundario"
                onClick={() =>
                  descargar(
                    `errores-seccion-${numero}.csv`,
                    csvDeErrores(errores),
                  )
                }
              >
                Descargar errores (CSV)
              </button>
            </>
          )}
          <button type="button" className="cursos__boton" onClick={onCerrar}>
            Cerrar
          </button>
        </>
      ) : (
        <>
          <p>
            CSV UTF-8, separado por comas, con encabezado{' '}
            <code>correo,nombre</code>. El nombre es obligatorio solo para
            cuentas nuevas. Hasta {MAX_FILAS_ALUMNOS_CSV} filas y 48 KiB.
          </p>
          <a className="cursos__enlace" href="/plantilla-alumnos.csv" download>
            Descargar plantilla CSV
          </a>
          <p>
            Las filas válidas se cargan aunque otras fallen. Los alumnos ya
            inscritos se informan como error y no se duplican.
          </p>
          <form
            className="cursos__formulario"
            onSubmit={(event) => void cargar(event)}
          >
            <label className="cursos__campo">
              Archivo CSV
              <input
                ref={archivo}
                className="cursos__input"
                type="file"
                accept=".csv,text/csv"
                required
                disabled={enviando}
              />
            </label>
            {enviando && (
              <p role="status">
                Cargando alumnos… Espera el resultado antes de cerrar.
              </p>
            )}
            <div className="cursos__acciones">
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                disabled={enviando}
                onClick={onCerrar}
              >
                Cancelar
              </button>
              <button
                className="cursos__boton"
                type="submit"
                disabled={enviando}
              >
                Cargar alumnos
              </button>
            </div>
          </form>
        </>
      )}
    </dialog>
  )
}
