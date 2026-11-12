import {
  LARGO_MAXIMO_PASSWORD,
  LARGO_MINIMO_PASSWORD,
  LARGO_NOMBRE_USUARIO,
} from '@cursus/shared'
import { hash } from 'argon2'
import { isEmail } from 'class-validator'
import type { DataSource } from 'typeorm'

export interface DatosSuperadmin {
  correo: string
  nombre: string
  password: string
}

// MT-04 (ADR 0002): única forma de crear un superadmin. La API no puede: el
// superadmin no tiene universidad, y las políticas RLS de usuario exigen la de
// la sesión. Corre como dueño de las tablas (npm run superadmin, o
// infra/aws/superadmin.sh en AWS) y la ejecuta una persona.
//
// La contraseña es provisoria: debe cambiarla en su primer ingreso (PER-03).
// Falla sin cambiar nada si el correo ya existe, con cualquier rol, o si es
// del dominio de una universidad: el login no podría distinguirlo de un
// usuario de esa universidad.
export async function crearSuperadmin(
  bd: DataSource,
  datos: DatosSuperadmin,
): Promise<{ id: string; correo: string }> {
  const correo = datos.correo.trim().toLowerCase()
  const nombre = datos.nombre.trim()
  if (!isEmail(correo)) {
    throw new Error('El correo del superadmin no es válido')
  }
  if (!nombre || nombre.length > LARGO_NOMBRE_USUARIO) {
    throw new Error(
      `El nombre del superadmin debe tener entre 1 y ${LARGO_NOMBRE_USUARIO} caracteres`,
    )
  }
  if (
    datos.password.length < LARGO_MINIMO_PASSWORD ||
    datos.password.length > LARGO_MAXIMO_PASSWORD
  ) {
    throw new Error(
      `La contraseña provisoria debe tener entre ${LARGO_MINIMO_PASSWORD} y ${LARGO_MAXIMO_PASSWORD} caracteres`,
    )
  }

  const passwordHash = await hash(datos.password)
  return bd.transaction(async (m) => {
    // Dos ejecuciones simultáneas no crean dos veces el mismo correo.
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('cursus:superadmin'))`)
    const [dominio] = await m.query<{ id: string }[]>(
      `SELECT id FROM universidad WHERE dominio_correo = split_part($1, '@', 2)`,
      [correo],
    )
    if (dominio) {
      throw new Error(
        'El correo del superadmin no puede ser del dominio de una universidad',
      )
    }
    const [existente] = await m.query<{ id: string }[]>(
      `SELECT id FROM usuario WHERE lower(correo) = $1`,
      [correo],
    )
    if (existente) {
      throw new Error('Ya existe un usuario con ese correo')
    }
    const [usuario] = await m.query<{ id: string }[]>(
      `INSERT INTO usuario
         (universidad_id, facultad_id, nombre, correo, password_hash, rol,
          credencial_provisoria)
       VALUES (NULL, NULL, $1, $2, $3, 'SUPERADMIN', true)
       RETURNING id`,
      [nombre, correo, passwordHash],
    )
    return { id: usuario.id, correo }
  })
}
