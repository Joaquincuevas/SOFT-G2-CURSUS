import {
  type ErrorNotasInvalidas,
  MAX_NOTAS_GUARDADO,
  MENSAJES_NOTA_INVALIDA,
  motivoNotaInvalida,
} from '@cursus/shared'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsUUID,
  ValidateBy,
  ValidateNested,
  type ValidationError,
} from 'class-validator'
import { OPCIONES_VALIDACION } from '../config/configurar-app.js'

const ES_NOTA = 'esNota'

// NOT-06: un número de 1,0 a 7,0 con a lo más un decimal. El mensaje es el
// motivo (formato o rango) que se devuelve por alumno.
const EsNota = () =>
  ValidateBy({
    name: ES_NOTA,
    validator: {
      validate: (valor) => motivoNotaInvalida(valor) === null,
      defaultMessage: (argumentos) =>
        MENSAJES_NOTA_INVALIDA[
          motivoNotaInvalida(argumentos?.value) ?? 'formato'
        ],
    },
  })

class NotaAlumnoDto {
  @IsUUID('all')
  alumnoId!: string

  // Vacía, nula o ausente también es un formato inválido.
  @EsNota()
  nota!: number
}

// NOT-05: notas de cualquier subconjunto de los alumnos activos. Que estén
// inscritos y no se repitan lo revisa el servicio, que conoce la sección.
export class GuardarNotasDto {
  @IsArray()
  @ArrayMaxSize(MAX_NOTAS_GUARDADO)
  // Sin esto, una lista de listas ([[{...}]]) pasaría la validación anidada.
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => NotaAlumnoDto)
  notas!: NotaAlumnoDto[]
}

// Las notas inválidas del cuerpo (solo la regla de la escala), o null si hay
// otro error: un cuerpo mal formado responde el 400 de siempre.
function notasInvalidas(
  errores: ValidationError[],
): ErrorNotasInvalidas['invalidas'] | null {
  const invalidas: ErrorNotasInvalidas['invalidas'] = []
  for (const error of errores) {
    if (error.property !== 'notas' || error.constraints) return null
    for (const fila of error.children ?? []) {
      if (fila.constraints) return null
      for (const campo of fila.children ?? []) {
        const motivos = Object.entries(campo.constraints ?? {})
        if (
          campo.property !== 'nota' ||
          campo.children?.length ||
          motivos.length !== 1 ||
          motivos[0][0] !== ES_NOTA
        ) {
          return null
        }
        // Sin el objeto validado (por ejemplo, con validationError.target en
        // false) responde el 400 de siempre.
        const alumnoId = (campo.target as Partial<NotaAlumnoDto> | undefined)
          ?.alumnoId
        if (typeof alumnoId !== 'string') return null
        invalidas.push({ alumnoId, motivo: motivos[0][1] })
      }
    }
  }
  return invalidas.length ? invalidas : null
}

const errorPorDefecto = new ValidationPipe(
  OPCIONES_VALIDACION,
).createExceptionFactory()

// Pipe del cuerpo del PUT, con las mismas opciones que el global
// (OPCIONES_VALIDACION). Lo usa el controlador con el cuerpo tipado como la interfaz
// GuardarNotas: el pipe global no valida una interfaz (su metatipo es
// Object), así que este es el único que valida y puede responder qué alumnos
// tienen una nota inválida y por qué (NOT-06).
export const validarGuardarNotas = new ValidationPipe({
  ...OPCIONES_VALIDACION,
  expectedType: GuardarNotasDto,
  exceptionFactory: (errores) => {
    const invalidas = notasInvalidas(errores)
    if (!invalidas) return errorPorDefecto(errores)
    const cuerpo: ErrorNotasInvalidas = {
      statusCode: 400,
      message: 'Nota inválida',
      invalidas,
    }
    return new BadRequestException(cuerpo)
  },
})
