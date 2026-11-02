// GES-23: rutas y helpers de la gestión de universidades del superadmin.

export const RUTA_UNIVERSIDADES = '/api/superadmin/universidades'

// Página para administrar una universidad (fuera del menú).
export const rutaAdministrarUniversidad = (id: string) =>
  `/superadmin/universidades/${id}`

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

// Envía un cambio a la API. Un 409 trae el motivo en el mensaje (nombre
// repetido, dominio con usuarios, facultad en uso): se muestra tal cual. Un
// 400 es un dato inválido, y el resto, un error genérico.
export async function enviar<T>(
  fetchConSesion: (ruta: string, init?: RequestInit) => Promise<Response>,
  ruta: string,
  metodo: 'POST' | 'PATCH',
  cuerpo?: unknown,
): Promise<Resultado<T>> {
  try {
    const respuesta = await fetchConSesion(ruta, {
      method: metodo,
      ...(cuerpo === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
          }),
    })
    if (respuesta.ok) {
      const datos =
        respuesta.status === 204 ? undefined : await respuesta.json()
      return { ok: true, datos: datos as T }
    }
    const { message } = (await respuesta.json().catch(() => ({}))) as {
      message?: unknown
    }
    if (respuesta.status === 409 && typeof message === 'string') {
      return { ok: false, error: message }
    }
    return {
      ok: false,
      error:
        respuesta.status === 400
          ? 'Revisa los datos: alguno no tiene el formato correcto.'
          : respuesta.status === 404
            ? 'Ya no está disponible. Vuelve al Dashboard y actualiza la lista.'
            : 'No se pudo guardar. Inténtalo nuevamente.',
    }
  } catch {
    return {
      ok: false,
      error:
        'No se pudo guardar. Comprueba tu conexión e inténtalo nuevamente.',
    }
  }
}
