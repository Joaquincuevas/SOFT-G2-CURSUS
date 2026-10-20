import { CargaAlumnosService } from './carga-alumnos.service.js'
import { GestionService } from './gestion.service.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

it('conserva resultados previos y no expone detalles internos si falla una fila', async () => {
  const gestion = new GestionService(new BaseDeDatos())
  vi.spyOn(gestion, 'validarSeccionInscripcion').mockResolvedValue()
  vi.spyOn(gestion, 'agregarAlumno')
    .mockResolvedValueOnce({
      alumno: { id: '1', correo: 'a@u.cl', nombre: 'Ana' },
      cuentaCreada: false,
    })
    .mockRejectedValueOnce(new Error('detalle privado de PostgreSQL'))
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
})
