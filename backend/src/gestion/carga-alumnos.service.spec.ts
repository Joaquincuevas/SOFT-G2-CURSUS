import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { GestionService } from './gestion.service.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

afterEach(() => vi.restoreAllMocks())

it.each([
  new Error('consulta privada con b@u.cl y password'),
  new InternalServerErrorException('detalle privado de b@u.cl'),
])(
  'registra la fila del fallo interno sin datos personales y conserva éxitos: %s',
  async (error) => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const gestion = new GestionService(new BaseDeDatos())
    vi.spyOn(gestion, 'validarSeccionInscripcion').mockResolvedValue()
    vi.spyOn(gestion, 'agregarAlumno')
      .mockResolvedValueOnce({
        alumno: { id: '1', correo: 'a@u.cl', nombre: 'Ana' },
        cuentaCreada: false,
      })
      .mockRejectedValueOnce(error)
    const resultado = await new CargaAlumnosService(gestion).cargar(
      { universidadId: 'u', rol: 'ADMINISTRATIVO' },
      'admin',
      'seccion',
      'correo,nombre\na@u.cl,Ana\nb@u.cl,Beto',
    )
    expect(resultado).toMatchObject({ total: 2, cargados: 1, errores: 1 })
    expect(resultado.filas[1]).toMatchObject({
      estado: 'error',
      mensaje: 'No se pudo cargar esta fila. Intenta nuevamente.',
    })
    expect(log).toHaveBeenCalledExactlyOnceWith({
      mensaje: 'Error interno al cargar una fila del CSV',
      fila: 3,
      seccionId: 'seccion',
      universidadId: 'u',
      estado: 500,
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/@|password|privad/)
  },
)
it('no registra como error interno una fila inválida ni una excepción 400', async () => {
  const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  const gestion = new GestionService(new BaseDeDatos())
  vi.spyOn(gestion, 'validarSeccionInscripcion').mockResolvedValue()
  vi.spyOn(gestion, 'agregarAlumno').mockRejectedValue(
    new BadRequestException('Regla de inscripción'),
  )
  const resultado = await new CargaAlumnosService(gestion).cargar(
    { universidadId: 'u', rol: 'ADMINISTRATIVO' },
    'admin',
    'seccion',
    'correo,nombre\ninvalido,Ana\nb@u.cl,Beto',
  )
  expect(resultado).toMatchObject({ total: 2, cargados: 0, errores: 2 })
  expect(resultado.filas[1]).toMatchObject({ mensaje: 'Regla de inscripción' })
  expect(log).not.toHaveBeenCalled()
})
