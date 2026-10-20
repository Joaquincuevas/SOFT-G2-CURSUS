import {
  bytesContenidoCsv,
  csvDeErrores,
  MAX_BYTES_ALUMNOS_CSV,
  MAX_BYTES_ARCHIVO_CSV,
  MAX_FILAS_ALUMNOS_CSV,
} from '@cursus/shared'
import { leerCsvAlumnos } from './csv-alumnos.js'

describe('CSV de alumnos', () => {
  it('lee BOM, CRLF, comas y comillas escapadas', () => {
    expect(
      leerCsvAlumnos(
        '\uFEFFcorreo,nombre\r\na@u.cl,"Pérez, Ana ""María"""\r\n',
      ),
    ).toEqual([{ fila: 2, celdas: ['a@u.cl', 'Pérez, Ana "María"'] }])
  })
  it('admite saltos dentro de comillas, ignora líneas vacías y conserva números de línea', () => {
    expect(
      leerCsvAlumnos('correo,nombre\n\na@u.cl,"Ana\nMaría"\nb@u.cl,\n'),
    ).toEqual([
      { fila: 3, celdas: ['a@u.cl', 'Ana\nMaría'] },
      { fila: 5, celdas: ['b@u.cl', ''] },
    ])
  })
  it('acepta fin de archivo sin salto y CR como separador de línea', () => {
    expect(leerCsvAlumnos('correo,nombre\ra@u.cl,Ana')).toEqual([
      { fila: 2, celdas: ['a@u.cl', 'Ana'] },
    ])
  })
  it.each([
    '',
    'correo,nombre\n',
    'nombre,correo\nAna,a@u.cl',
    'correo;nombre\na@u.cl;Ana',
    'correo,nombre,extra\na@u.cl,Ana,x',
    'correo,nombre\na@u.cl,"Ana',
    'correo,nombre\na@u.cl,A"na',
    'correo,nombre\na@u.cl,"Ana"x',
  ])('rechaza estructura inválida antes de procesar: %j', (csv) => {
    expect(() => leerCsvAlumnos(csv)).toThrow()
  })
  it('deja una fila de columnas incorrectas al validador por fila', () => {
    expect(
      leerCsvAlumnos('correo,nombre\na@u.cl,Ana,extra')[0].celdas,
    ).toHaveLength(3)
  })
  describe('cabecera con motivo (GES-17)', () => {
    it('acepta correo,nombre,motivo e ignora la tercera columna', () => {
      expect(
        leerCsvAlumnos(
          'correo,nombre,motivo\na@u.cl,Ana,Correo inválido\nb@u.cl,Bea\n',
        ),
      ).toEqual([
        { fila: 2, celdas: ['a@u.cl', 'Ana'] },
        { fila: 3, celdas: ['b@u.cl', 'Bea'] },
      ])
    })

    it('lee el CSV de errores descargado (BOM, CRLF y comillas)', () => {
      const descargado =
        '\uFEFFcorreo,nombre,motivo\r\n' +
        'a@u.cl,"Pérez, Ana",Correo repetido en el archivo\r\n' +
        'b@u.cl,"Luis ""Lucho""","Falta el nombre, para crear la cuenta"\r\n'
      expect(leerCsvAlumnos(descargado)).toEqual([
        { fila: 2, celdas: ['a@u.cl', 'Pérez, Ana'] },
        { fila: 3, celdas: ['b@u.cl', 'Luis "Lucho"'] },
      ])
    })

    it('una fila de 4 celdas sigue siendo un error de formato por fila', () => {
      expect(
        leerCsvAlumnos('correo,nombre,motivo\na@u.cl,Ana,x,y')[0].celdas,
      ).toHaveLength(4)
    })

    it.each(['=1+1', '+56 9', '-x', '@x', '\tAna', '\rAna'])(
      'quita el apóstrofo que neutraliza la fórmula %j, con y sin motivo',
      (valor) => {
        const celda = `"'${valor}"`
        for (const cabecera of ['correo,nombre', 'correo,nombre,motivo'])
          expect(
            leerCsvAlumnos(`${cabecera}\n'=a@u.cl,${celda},x`)[0].celdas.slice(
              0,
              2,
            ),
          ).toEqual(['=a@u.cl', valor])
      },
    )

    it('el CSV de errores antepone un apóstrofo a cada fórmula', () => {
      const fila = (correo: string, nombre: string) => ({
        fila: 2,
        correo,
        nombre,
        estado: 'error' as const,
        motivo: 'correo_invalido' as const,
        mensaje: '',
      })
      expect(
        csvDeErrores([
          fila('=1+1', '+56 9 1234 5678'),
          fila('-x', '@x'),
          fila('a@u.cl', '\tAna'),
          fila('b@u.cl', '\rAna'),
          fila('c@u.cl', "O'Higgins"),
        ]),
      ).toBe(
        '﻿correo,nombre,motivo\r\n' +
          "'=1+1,'+56 9 1234 5678,Correo inválido\r\n" +
          "'-x,'@x,Correo inválido\r\n" +
          "a@u.cl,'\tAna,Correo inválido\r\n" +
          `b@u.cl,"'\rAna",Correo inválido\r\n` +
          "c@u.cl,O'Higgins,Correo inválido\r\n",
      )
    })

    it('ida y vuelta: el CSV de errores se lee con los valores originales', () => {
      const valores = [
        ['=a@u.cl', '=1+1'],
        ['+56@u.cl', '+56 9'],
        ['-x@u.cl', '-x'],
        ['@x', '@SUMA(A1)'],
        ['d@u.cl', '\tAna'],
        ['e@u.cl', '\rAna'],
        ['f@u.cl', 'Ana, "Anita"'],
        ['g@u.cl', "'Ana"],
      ]
      const csv = csvDeErrores(
        valores.map(([correo, nombre], i) => ({
          fila: i + 2,
          correo,
          nombre,
          estado: 'error',
          motivo: 'formato',
          mensaje: '',
        })),
      )
      expect(leerCsvAlumnos(csv).map((fila) => fila.celdas)).toEqual(valores)
    })

    it('no toca un apóstrofo que no antecede a una fórmula', () => {
      expect(
        leerCsvAlumnos("correo,nombre\na@u.cl,'Ana\nb@u.cl,O'Higgins").map(
          (fila) => fila.celdas[1],
        ),
      ).toEqual(["'Ana", "O'Higgins"])
    })

    it('el límite bruto cubre el peor caso del CSV de errores', () => {
      // 100 filas con el mensaje más largo, cada celda entre comillas y con
      // apóstrofo, y contenido de exactamente 48 KiB.
      const largo = 'El correo pertenece a una cuenta que no es de alumno'
      const nombre = (n: number) => '=' + 'x'.repeat(n) + ','
      const contenidoSinNombres =
        'correo,nombre\n'.length + 100 * '=a,\n'.length
      const resto = MAX_BYTES_ALUMNOS_CSV - contenidoSinNombres
      const filas = Array.from({ length: 100 }, (_, i) =>
        nombre(Math.floor(resto / 100) - 2 + (i < resto % 100 ? 1 : 0)),
      )
      const csv = csvDeErrores(
        filas.map((nombre, i) => ({
          fila: i + 2,
          correo: '=a',
          nombre,
          estado: 'error',
          motivo: 'rol_distinto',
          mensaje: '',
        })),
      )
      expect(csv).toContain(largo)
      expect(bytesContenidoCsv(filas.map((n) => ['=a', n]))).toBe(
        MAX_BYTES_ALUMNOS_CSV,
      )
      expect(Buffer.byteLength(csv, 'utf8')).toBeLessThanOrEqual(
        MAX_BYTES_ARCHIVO_CSV,
      )
      expect(leerCsvAlumnos(csv)).toHaveLength(100)
    })

    it('rechaza un contenido sobre 48 KiB aunque el archivo bruto quepa', () => {
      const fila = `a@u.cl,${'😀'.repeat(125)}\n`
      const csv =
        'correo,nombre\n' +
        fila.repeat(
          Math.ceil(MAX_BYTES_ALUMNOS_CSV / Buffer.byteLength(fila, 'utf8')),
        )
      expect(Buffer.byteLength(csv, 'utf8')).toBeLessThan(MAX_BYTES_ARCHIVO_CSV)
      expect(() => leerCsvAlumnos(csv)).toThrow(
        'El CSV supera el máximo de 48 KiB',
      )
      expect(() =>
        leerCsvAlumnos('correo,nombre\n' + 'x'.repeat(MAX_BYTES_ARCHIVO_CSV)),
      ).toThrow('El CSV supera el máximo de 48 KiB')
    })

    it.each([
      'correo,nombre,otra\na@u.cl,Ana',
      'correo,motivo,nombre\na@u.cl,x,Ana',
    ])('rechaza otra tercera columna: %j', (csv) => {
      expect(() => leerCsvAlumnos(csv)).toThrow('encabezado')
    })
  })

  it('limita filas y mide tamaño UTF-8 real', () => {
    const cabecera = 'correo,nombre\n'
    expect(
      leerCsvAlumnos(cabecera + 'a@u.cl,Ana\n'.repeat(MAX_FILAS_ALUMNOS_CSV)),
    ).toHaveLength(MAX_FILAS_ALUMNOS_CSV)
    expect(() =>
      leerCsvAlumnos(
        cabecera + 'a@u.cl,Ana\n'.repeat(MAX_FILAS_ALUMNOS_CSV + 1),
      ),
    ).toThrow('hasta')
    expect(() =>
      leerCsvAlumnos(cabecera + 'ñ'.repeat(MAX_BYTES_ALUMNOS_CSV / 2)),
    ).toThrow('48 KiB')
  })
})
