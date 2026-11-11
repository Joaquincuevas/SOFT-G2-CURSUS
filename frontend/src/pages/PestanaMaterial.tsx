import {
  CATEGORIA_MATERIAL_LABEL,
  CATEGORIAS_MATERIAL,
  LARGO_DESCRIPCION_MATERIAL,
  LARGO_TITULO_MATERIAL,
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_ARCHIVO,
  tipoDeArchivo,
  type ArchivoResumen,
  type CategoriaMaterial,
  type CrearMaterial,
  type DescargaArchivo,
  type Material,
  type SubidaArchivo,
} from '@cursus/shared'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './PestanaMaterial.css'
import { AdministrarSilabo } from './AdministrarSilabo'
import { subirAS3, tamanoLegible } from './subirArchivo'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

const EXTENSIONES = Object.keys(TIPOS_ARCHIVO)
const ACEPTADAS = EXTENSIONES.map((extension) => `.${extension}`).join(',')

// Pasos del flujo de subida (MAT-01 y MAT-04), para mostrarlos mientras
// corren.
type Etapa = 'pidiendo' | 'subiendo' | 'confirmando' | 'registrando'

// Falla un paso del flujo. El mensaje es para mostrar al profesor.
class ErrorDeFlujo extends Error {}

const VACIO = {
  categoria: '' as CategoriaMaterial | '',
  titulo: '',
  descripcion: '',
}

// Mensaje de un 400 del backend: texto, o la lista de validaciones.
async function motivoDe(res: Response): Promise<string | null> {
  const cuerpo = (await res.json().catch(() => null)) as {
    message?: unknown
  } | null
  const mensaje = cuerpo?.message
  if (typeof mensaje === 'string') return mensaje
  return Array.isArray(mensaje) ? mensaje.join('. ') : null
}

// MAT-04 y MAT-06: materiales del curso de la sección. Solo el profesor sube
// materiales; el profesor, el ayudante y el alumno los ven y los descargan. El
// material es del curso: aquí se ven también los que subió el profesor de otra
// sección.
export function PestanaMaterial({ seccionId, rol }: PropsPestana) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/espacio/secciones/${seccionId}`
  const [materiales, recargar] = useDatos<Material[]>(`${ruta}/materiales`)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  // MAT-06: la API revisa que sea integrante y firma una URL de S3 que vence a
  // los 5 minutos. Se abre de inmediato y no se guarda: S3 entrega el archivo
  // con su nombre original.
  async function descargar(material: Material) {
    setDescargando(material.id)
    setErrorDescarga(null)
    try {
      const res = await fetchConSesion(
        `${ruta}/materiales/${material.id}/descarga`,
      )
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.click()
    } catch {
      setErrorDescarga(
        `No pudimos descargar «${material.titulo}». Inténtalo nuevamente.`,
      )
    } finally {
      // Siempre se desbloquea, también si la descarga falló.
      setDescargando(null)
    }
  }

  return (
    <section className="material" aria-label="Materiales del curso">
      <AdministrarSilabo ruta={ruta} />
      <h3 className="vista-seccion__subtitulo">Materiales del curso</h3>
      {rol === 'PROFESOR' && (
        <FormularioMaterial ruta={ruta} alSubir={recargar} />
      )}
      {errorDescarga && (
        <p className="material__error" role="alert">
          {errorDescarga}
        </p>
      )}
      {materiales === undefined ? (
        <Cargando texto="Cargando materiales…" />
      ) : materiales === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar los materiales."
          onReintentar={recargar}
        />
      ) : materiales.length === 0 ? (
        <p className="dashboard__texto">Aún no hay materiales del curso</p>
      ) : (
        <ul className="material__lista" aria-label="Materiales">
          {materiales.map((material) => (
            <li key={material.id} className="material__item">
              <article aria-label={material.titulo}>
                <div className="material__encabezado">
                  <h4 className="material__titulo">{material.titulo}</h4>
                  <span className="material__categoria">
                    {CATEGORIA_MATERIAL_LABEL[material.categoria]}
                  </span>
                </div>
                {material.descripcion && (
                  <p className="material__descripcion">
                    {material.descripcion}
                  </p>
                )}
                <div className="material__pie">
                  <p className="material__archivo">
                    {material.archivo.nombre} ·{' '}
                    {tamanoLegible(material.archivo.tamano)}
                  </p>
                  <button
                    type="button"
                    className="material__descargar"
                    aria-label={`Descargar ${material.titulo}`}
                    disabled={descargando === material.id}
                    onClick={() => void descargar(material)}
                  >
                    {descargando === material.id ? 'Descargando…' : 'Descargar'}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FormularioMaterial({
  ruta,
  alSubir,
}: {
  ruta: string
  alSubir: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [campos, setCampos] = useState(VACIO)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Para reiniciar el input de archivo, que no se controla.
  const [versionInput, setVersionInput] = useState(0)
  // Archivo que ya quedó subido y confirmado, pero cuyo registro falló: al
  // reintentar con el mismo archivo se registra ese, sin subirlo otra vez.
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  // Un segundo clic antes de que React deshabilite el botón no envía otra vez.
  const enCurso = useRef(false)

  const ocupado = etapa !== null

  // Valida lo que el backend también valida, para avisar antes de subir.
  function validar(): string | null {
    if (!archivo) return 'Elige un archivo'
    if (!tipoDeArchivo(archivo.name)) {
      return `El archivo debe ser de uno de estos tipos: ${EXTENSIONES.join(', ')}`
    }
    if (archivo.size === 0) return 'El archivo está vacío'
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      return `El archivo pesa más de ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}`
    }
    if (!campos.categoria) return 'Elige una categoría'
    if (campos.titulo.trim() === '') return 'Ingresa el título del material'
    return null
  }

  // Pide la subida, sube a S3 y confirma. Devuelve el id del archivo
  // confirmado.
  async function subirArchivo(elegido: File): Promise<string> {
    setEtapa('pidiendo')
    setProgreso(0)
    const pedida = await fetchConSesion(`${ruta}/archivos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: elegido.name, tamano: elegido.size }),
    })
    if (!pedida.ok) {
      throw new ErrorDeFlujo(
        pedida.status === 503
          ? 'El almacenamiento de archivos no está disponible por ahora. Inténtalo más tarde.'
          : pedida.status === 403
            ? 'Ya no eres profesor de esta sección.'
            : ((pedida.status === 400 ? await motivoDe(pedida) : null) ??
              'No pudimos preparar la subida del archivo. Inténtalo nuevamente.'),
      )
    }
    const { archivo: registrado, subida } =
      (await pedida.json()) as SubidaArchivo

    setEtapa('subiendo')
    try {
      await subirAS3(subida, elegido, setProgreso)
    } catch {
      throw new ErrorDeFlujo(
        'No pudimos subir el archivo. Comprueba tu conexión e inténtalo nuevamente.',
      )
    }

    setEtapa('confirmando')
    const confirmada = await fetchConSesion(
      `${ruta}/archivos/${registrado.id}/confirmar`,
      { method: 'POST' },
    )
    if (!confirmada.ok) {
      throw new ErrorDeFlujo(
        'No pudimos confirmar el archivo subido. Inténtalo nuevamente.',
      )
    }
    return ((await confirmada.json()) as ArchivoResumen).id
  }

  // Si el listado de la sección ya tiene un material con ese archivo; null
  // si el listado no respondió y no se sabe.
  async function yaRegistrado(archivoId: string): Promise<boolean | null> {
    try {
      const res = await fetchConSesion(`${ruta}/materiales`)
      if (!res.ok) return null
      return ((await res.json()) as Material[]).some(
        (m) => m.archivo.id === archivoId,
      )
    } catch {
      return null
    }
  }

  async function registrar(archivoId: string, categoria: CategoriaMaterial) {
    setEtapa('registrando')
    const datos: CrearMaterial = {
      archivoId,
      categoria,
      titulo: campos.titulo,
      ...(campos.descripcion.trim() !== '' && {
        descripcion: campos.descripcion,
      }),
    }
    const res = await fetchConSesion(`${ruta}/materiales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    if (res.ok) return
    if (res.status === 409) {
      // El archivo ya es un material. Si es el de este reintento (el registro
      // anterior se guardó pero su respuesta se perdió), ya quedó subido:
      // se trata como éxito y el listado lo muestra.
      const registrado = await yaRegistrado(archivoId)
      if (registrado) return
      // Sin listado no se sabe: se conserva el archivo para volver a
      // verificar sin subirlo otra vez.
      if (registrado === null) {
        throw new ErrorDeFlujo(
          'No pudimos comprobar si el material quedó registrado. Inténtalo nuevamente.',
        )
      }
      // Otro registro ganó: ese archivo ya no sirve para reintentar.
      confirmado.current = null
    }
    throw new ErrorDeFlujo(
      res.status === 409
        ? 'Ese archivo ya está registrado como material.'
        : res.status === 403
          ? 'Ya no eres profesor de esta sección.'
          : ((res.status === 400 ? await motivoDe(res) : null) ??
            'No pudimos registrar el material. Inténtalo nuevamente.'),
    )
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enCurso.current) return
    setAviso(null)
    const motivo = validar()
    if (motivo || !archivo || !campos.categoria) {
      setError(motivo)
      return
    }
    setError(null)
    enCurso.current = true
    try {
      const previo = confirmado.current
      const archivoId =
        previo?.archivo === archivo ? previo.id : await subirArchivo(archivo)
      confirmado.current = { archivo, id: archivoId }
      await registrar(archivoId, campos.categoria)
      confirmado.current = null
      setArchivo(null)
      setCampos(VACIO)
      setVersionInput((n) => n + 1)
      setAviso('Material subido')
      alSubir()
    } catch (falla) {
      setError(
        falla instanceof ErrorDeFlujo
          ? falla.message
          : 'No pudimos subir el material. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      // Siempre se desbloquea, también si falló a mitad del flujo.
      enCurso.current = false
      setEtapa(null)
    }
  }

  function elegirArchivo(event: ChangeEvent<HTMLInputElement>) {
    setAviso(null)
    setError(null)
    setArchivo(event.target.files?.[0] ?? null)
  }

  const cambiar =
    (campo: keyof typeof VACIO) => (event: { target: { value: string } }) => {
      setAviso(null)
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))
    }

  const TEXTO_ETAPA: Record<Etapa, string> = {
    pidiendo: 'Preparando la subida…',
    subiendo: `Subiendo archivo… ${progreso} %`,
    confirmando: 'Confirmando el archivo…',
    registrando: 'Registrando el material…',
  }

  return (
    <form
      className="material__formulario"
      aria-label="Subir material"
      noValidate
      onSubmit={(event) => void enviar(event)}
    >
      <label className="material__campo material__campo--ancho">
        Archivo
        <input
          key={versionInput}
          type="file"
          accept={ACEPTADAS}
          onChange={elegirArchivo}
          disabled={ocupado}
        />
      </label>
      <label className="material__campo">
        Categoría
        <select
          value={campos.categoria}
          onChange={cambiar('categoria')}
          disabled={ocupado}
        >
          <option value="">Elige una categoría</option>
          {CATEGORIAS_MATERIAL.map((categoria) => (
            <option key={categoria} value={categoria}>
              {CATEGORIA_MATERIAL_LABEL[categoria]}
            </option>
          ))}
        </select>
      </label>
      <label className="material__campo material__campo--crece">
        Título
        <input
          value={campos.titulo}
          onChange={cambiar('titulo')}
          maxLength={LARGO_TITULO_MATERIAL}
          disabled={ocupado}
        />
      </label>
      <label className="material__campo material__campo--ancho">
        Descripción (opcional)
        <textarea
          value={campos.descripcion}
          onChange={cambiar('descripcion')}
          maxLength={LARGO_DESCRIPCION_MATERIAL}
          rows={3}
          disabled={ocupado}
        />
      </label>
      <button className="material__boton" type="submit" disabled={ocupado}>
        Subir material
      </button>
      <p className="material__ayuda">
        Hasta {tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}. Tipos:{' '}
        {EXTENSIONES.join(', ')}.
      </p>
      {etapa && (
        <div className="material__progreso" role="status">
          <span>{TEXTO_ETAPA[etapa]}</span>
          {etapa === 'subiendo' && (
            <progress
              value={progreso}
              max={100}
              aria-label="Progreso de la subida"
            />
          )}
        </div>
      )}
      {error && (
        <p className="material__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="material__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
