import type { CrearPeriodo, Periodo } from '@cursus/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { useSession } from '../session/session'
import './Periodos.css'

const ordenar = (filas: Periodo[]) =>
  [...filas].sort(
    (a, b) =>
      Number(b.activo) - Number(a.activo) ||
      b.anio - a.anio ||
      b.semestre - a.semestre,
  )
const fecha = (valor: string) => valor.split('-').reverse().join('/')

export function Periodos() {
  const { fetchConSesion } = useAuth()
  const { actualizarPeriodoActivo } = useSession()
  const [periodos, setPeriodos] = useState<Periodo[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [errorCarga, setErrorCarga] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [anio, setAnio] = useState('')
  const [semestre, setSemestre] = useState('1')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaTermino, setFechaTermino] = useState('')
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    let vigente = true
    void fetchConSesion('/api/periodos')
      .then(async (res) => {
        if (!res.ok) throw new Error('carga')
        const filas = (await res.json()) as Periodo[]
        if (vigente) setPeriodos(ordenar(filas))
      })
      .catch(() => {
        if (vigente) setErrorCarga(true)
      })
    return () => {
      vigente = false
    }
  }, [fetchConSesion, revision])

  function recargar() {
    setErrorCarga(false)
    setPeriodos(null)
    setRevision((n) => n + 1)
  }

  async function guardar(datos?: CrearPeriodo, id?: string) {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetchConSesion(
        id ? `/api/periodos/${id}/activar` : '/api/periodos',
        {
          method: id ? 'PATCH' : 'POST',
          ...(datos
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos),
              }
            : {}),
        },
      )
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'Ya existe un período con ese año y semestre en tu universidad'
            : res.status === 404
              ? 'El período ya no está disponible. Actualiza el listado.'
              : 'No pudimos guardar el período. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      const periodo = (await res.json()) as Periodo
      setPeriodos((anteriores) =>
        ordenar([
          ...(anteriores ?? [])
            .filter((p) => p.id !== periodo.id)
            .map((p) => (periodo.activo ? { ...p, activo: false } : p)),
          periodo,
        ]),
      )
      if (periodo.activo)
        actualizarPeriodoActivo({
          id: periodo.id,
          anio: periodo.anio,
          semestre: periodo.semestre,
        })
      setAviso(id ? 'Período activo actualizado' : 'Período creado')
      if (!id) {
        setAnio('')
        setSemestre('1')
        setFechaInicio('')
        setFechaTermino('')
        setActivo(false)
      }
    } catch {
      setError(
        'No pudimos guardar el período. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!fechaInicio || !fechaTermino || fechaTermino <= fechaInicio) {
      setError('La fecha de término debe ser posterior a la de inicio')
      return
    }
    void guardar({
      anio: Number(anio),
      semestre: Number(semestre),
      fechaInicio,
      fechaTermino,
      activo,
    })
  }

  return (
    <section className="periodos" aria-label="Gestión de períodos">
      <div className="periodos__intro">
        <div>
          <h2>Períodos de tu universidad</h2>
          <p>
            Organiza los semestres y elige el período activo para toda la
            universidad.
          </p>
        </div>
        <button
          className="periodos__secundario"
          type="button"
          disabled={guardando}
          onClick={recargar}
        >
          Actualizar listado
        </button>
      </div>
      {aviso && (
        <p className="periodos__aviso" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="periodos__error" role="alert" id="periodo-error">
          {error}
        </p>
      )}
      <div className="periodos__columnas">
        <div className="periodos__panel">
          {errorCarga ? (
            <>
              <p role="alert" className="periodos__error">
                No pudimos cargar los períodos.
              </p>
              <button className="periodos__secundario" onClick={recargar}>
                Reintentar
              </button>
            </>
          ) : periodos === null ? (
            <p role="status">Cargando períodos…</p>
          ) : periodos.length === 0 ? (
            <p>Aún no hay períodos en tu universidad. Crea el primero.</p>
          ) : (
            <table className="periodos__tabla">
              <caption>Listado de períodos</caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Inicio</th>
                  <th scope="col">Término</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.anio}-{p.semestre}
                    </th>
                    <td>{fecha(p.fechaInicio)}</td>
                    <td>{fecha(p.fechaTermino)}</td>
                    <td>{p.activo ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      {p.activo ? (
                        '—'
                      ) : (
                        <button
                          className="periodos__secundario"
                          type="button"
                          disabled={guardando}
                          aria-label={`Activar período ${p.anio}-${p.semestre}`}
                          onClick={() => void guardar(undefined, p.id)}
                        >
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form
          className="periodos__panel periodos__formulario"
          aria-label="Nuevo período"
          onSubmit={crear}
          aria-describedby={error ? 'periodo-error' : undefined}
        >
          <h2>Nuevo período</h2>
          <p>
            Solo puede haber un período activo. Al activar otro, el anterior
            quedará inactivo.
          </p>
          <label htmlFor="periodo-anio">Año</label>
          <input
            id="periodo-anio"
            type="number"
            min="1"
            max="9999"
            step="1"
            required
            disabled={guardando}
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
          <label htmlFor="periodo-semestre">Semestre</label>
          <select
            id="periodo-semestre"
            required
            disabled={guardando}
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
          <label htmlFor="periodo-inicio">Fecha de inicio</label>
          <input
            id="periodo-inicio"
            type="date"
            required
            disabled={guardando}
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
          />
          <label htmlFor="periodo-termino">Fecha de término</label>
          <input
            id="periodo-termino"
            type="date"
            required
            disabled={guardando}
            value={fechaTermino}
            onChange={(e) => setFechaTermino(e.target.value)}
          />
          <label className="periodos__checkbox">
            <input
              type="checkbox"
              disabled={guardando}
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Marcar como activo
          </label>
          <button
            className="periodos__primario"
            type="submit"
            disabled={guardando || periodos === null}
          >
            {guardando ? 'Guardando…' : 'Crear período'}
          </button>
        </form>
      </div>
    </section>
  )
}
