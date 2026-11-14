import {
  TIPOS_EVENTO,
  type EventoAcceso,
  type PaginaEventos,
  type TipoEvento,
  type UniversidadDelFiltro,
} from '@cursus/shared'
import { useSearchParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './RegistroAccesos.css'
import { useDatos } from './useDatos'

// SEG-05: el Director consulta el registro de accesos y acciones sensibles
// (SEG-04). Los filtros y la página viven en la URL, así que se conservan al
// recargar. Solo llega aquí el Director (read RegistroAccesos en navigation.ts).
const TIPOS: Record<TipoEvento, string> = {
  INICIO_SESION: 'Inicio de sesión',
  CAMBIO_NOTA: 'Cambio de nota',
  ASIGNACION: 'Asignación',
  CIERRE_CURSO: 'Cierre de curso',
}
const RESULTADOS: Record<EventoAcceso['resultado'], string> = {
  EXITOSO: 'Exitoso',
  FALLIDO: 'Fallido',
  BLOQUEADO: 'Bloqueado',
}
const SUBTIPOS: Record<string, string> = {
  APROBACION: 'Aprobación',
  DEVOLUCION: 'Devolución',
  RECORRECCION: 'Recorrección',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  // SEG-02: el paso del código TOTP del login.
  MFA: 'Verificación en dos pasos',
}
const ROLES: Record<string, string> = {
  DIRECTOR: 'Director',
  ADMINISTRATIVO: 'Administrativo',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  ALUMNO: 'Alumno',
  SUPERADMIN: 'Superadmin',
}
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
// Un día que existe: el patrón solo revisa la forma, y Date corrige en silencio
// lo imposible (2026-02-30 sería el 2 de marzo), así que se compara de vuelta.
const DIA = /^\d{4}-\d{2}-\d{2}$/
const diaExiste = (dia: string) => {
  if (!DIA.test(dia)) return false
  const fecha = new Date(`${dia}T00:00:00Z`)
  // Un mes 13 da Date inválida: toISOString lanzaría.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(dia)
}

// Las fechas se muestran en la zona horaria del navegador, y la zona va en
// cada fecha y en el aviso de arriba.
const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone
const formatoFecha = new Intl.DateTimeFormat('es-CL', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})

// Un día elegido (AAAA-MM-DD) son sus 24 horas en la zona del navegador:
// la API recibe instantes con zona (UTC).
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()
const finDelDia = (dia: string) => new Date(`${dia}T23:59:59.999`).toISOString()

export function RegistroAccesos() {
  const [params, fijarParams] = useSearchParams()
  const valor = (nombre: string) => params.get(nombre) ?? ''
  const tipo = valor('tipo')
  const universidadId = valor('universidad')
  const usuarioId = valor('usuario')
  const desde = valor('desde')
  const hasta = valor('hasta')
  const pagina = Math.max(1, Math.floor(Number(valor('pagina'))) || 1)

  const filtrosValidos =
    (!tipo || (TIPOS_EVENTO as readonly string[]).includes(tipo)) &&
    (!universidadId || UUID.test(universidadId)) &&
    (!usuarioId || UUID.test(usuarioId)) &&
    (!desde || diaExiste(desde)) &&
    (!hasta || diaExiste(hasta))
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  const consulta = new URLSearchParams()
  if (tipo) consulta.set('tipo', tipo)
  if (universidadId) consulta.set('universidadId', universidadId)
  if (usuarioId) consulta.set('usuarioId', usuarioId)
  // Con un filtro inválido no se arma la consulta (toISOString lanzaría).
  if (filtrosValidos && desde) consulta.set('desde', inicioDelDia(desde))
  if (filtrosValidos && hasta) consulta.set('hasta', finDelDia(hasta))
  if (pagina > 1) consulta.set('pagina', String(pagina))
  const texto = consulta.toString()

  const [resultado, recargar] = useDatos<PaginaEventos>(
    filtrosValidos && !rangoInvalido
      ? `/api/auditoria/eventos${texto ? `?${texto}` : ''}`
      : null,
  )
  const [universidades] = useDatos<UniversidadDelFiltro[]>(
    '/api/auditoria/universidades',
  )

  // Cambiar un filtro vuelve a la primera página.
  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params)
    nuevos.delete('pagina')
    for (const [nombre, v] of Object.entries(cambios)) {
      if (v) nuevos.set(nombre, v)
      else nuevos.delete(nombre)
    }
    fijarParams(nuevos)
  }
  const irA = (n: number) => {
    const nuevos = new URLSearchParams(params)
    if (n > 1) nuevos.set('pagina', String(n))
    else nuevos.delete('pagina')
    fijarParams(nuevos)
  }
  const nombreDelUsuario =
    resultado?.eventos.find((e) => e.usuario?.id === usuarioId)?.usuario
      ?.nombre ?? 'seleccionado'

  return (
    <section className="accesos" aria-label="Registro de accesos">
      <p className="accesos__zona">
        Fechas en tu zona horaria ({ZONA}). Del evento más reciente al más
        antiguo.
      </p>
      <form
        className="accesos__filtros"
        role="search"
        aria-label="Filtros"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="accesos__campo">
          Tipo de evento
          <select
            value={tipo}
            onChange={(e) => cambiar({ tipo: e.target.value })}
          >
            <option value="">Todos</option>
            {TIPOS_EVENTO.map((t) => (
              <option key={t} value={t}>
                {TIPOS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="accesos__campo">
          Universidad
          <select
            value={universidadId}
            disabled={!universidades}
            onChange={(e) => cambiar({ universidad: e.target.value })}
          >
            <option value="">
              {universidades === undefined
                ? 'Cargando universidades…'
                : universidades === null
                  ? 'No se pudieron cargar'
                  : 'Todas'}
            </option>
            {universidades?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="accesos__campo">
          Desde
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
        </label>
        <label className="accesos__campo">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </label>
        {usuarioId && (
          <button
            type="button"
            className="accesos__chip"
            onClick={() => cambiar({ usuario: '' })}
          >
            Usuario: {nombreDelUsuario} ×
          </button>
        )}
      </form>

      {!filtrosValidos ? (
        <p role="alert">Los filtros de la dirección no son válidos.</p>
      ) : rangoInvalido ? (
        <p role="alert">La fecha «desde» no puede ser posterior a «hasta».</p>
      ) : resultado === undefined ? (
        <Cargando texto="Cargando el registro…" />
      ) : resultado === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar el registro de accesos."
          onReintentar={recargar}
        />
      ) : resultado.eventos.length === 0 ? (
        resultado.total === 0 ? (
          <p className="accesos__vacio">No hay eventos con estos filtros.</p>
        ) : (
          // Página fuera de rango (un enlace viejo): la salida conserva los
          // filtros y solo quita la página.
          <div className="accesos__vacio" role="status">
            <p>
              Esta página no tiene eventos: con estos filtros hay{' '}
              {Math.ceil(resultado.total / resultado.tamano)}{' '}
              {Math.ceil(resultado.total / resultado.tamano) === 1
                ? 'página'
                : 'páginas'}
              .
            </p>
            <button type="button" onClick={() => irA(1)}>
              Volver a la primera página
            </button>
          </div>
        )
      ) : (
        <>
          <div className="accesos__tabla">
            <table>
              <caption className="accesos__resumen">
                {resultado.total} {resultado.total === 1 ? 'evento' : 'eventos'}{' '}
                · página {resultado.pagina} de{' '}
                {Math.max(1, Math.ceil(resultado.total / resultado.tamano))}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">Universidad</th>
                  <th scope="col">IP</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {resultado.eventos.map((e) => (
                  <Fila
                    key={e.id}
                    evento={e}
                    filtrarUsuario={(id) => cambiar({ usuario: id })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <nav className="accesos__paginas" aria-label="Paginación">
            <button
              type="button"
              disabled={resultado.pagina <= 1}
              onClick={() => irA(resultado.pagina - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={resultado.pagina * resultado.tamano >= resultado.total}
              onClick={() => irA(resultado.pagina + 1)}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  )
}

function Fila({
  evento: e,
  filtrarUsuario,
}: {
  evento: EventoAcceso
  filtrarUsuario: (id: string) => void
}) {
  const detalle = [
    typeof e.detalle.subtipo === 'string'
      ? (SUBTIPOS[e.detalle.subtipo] ?? e.detalle.subtipo)
      : null,
    e.detalle.credencialProvisoria ? 'Credencial provisoria' : null,
  ].filter(Boolean)
  return (
    <tr>
      <td>
        <time dateTime={e.fecha}>{formatoFecha.format(new Date(e.fecha))}</time>
      </td>
      <td>{TIPOS[e.tipo]}</td>
      <td>
        <span
          className={`accesos__resultado accesos__resultado--${e.resultado.toLowerCase()}`}
        >
          {RESULTADOS[e.resultado]}
        </span>
      </td>
      <td>
        {e.usuario ? (
          <>
            <button
              type="button"
              className="accesos__enlace"
              title="Filtrar por este usuario"
              onClick={() => filtrarUsuario(e.usuario!.id)}
            >
              {e.usuario.nombre}
            </button>{' '}
            <span className="accesos__rol">
              {ROLES[e.usuario.rol] ?? e.usuario.rol}
            </span>
          </>
        ) : (
          'Sin cuenta'
        )}
      </td>
      <td>{e.universidad?.nombre ?? '—'}</td>
      <td>{e.ip ?? '—'}</td>
      <td>{detalle.length ? detalle.join(' · ') : '—'}</td>
    </tr>
  )
}
