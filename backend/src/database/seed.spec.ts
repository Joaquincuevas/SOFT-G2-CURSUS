import {
  DEMO_POR_FACULTAD,
  UNIVERSIDADES,
  usuariosDeDemo,
  verificarEntorno,
} from './seed.js'

describe('usuariosDeDemo', () => {
  describe.each(UNIVERSIDADES.map((u, indice) => [u.nombre, indice] as const))(
    '%s',
    (_nombre, indice) => {
      const universidad = UNIVERSIDADES[indice]
      const demo = usuariosDeDemo(indice)

      it('crea DEMO_POR_FACULTAD usuarios de cada rol en cada facultad', () => {
        for (const facultad of universidad.facultades) {
          for (const [rol, cantidad] of Object.entries(DEMO_POR_FACULTAD)) {
            expect(
              demo.filter(
                (u) => u.facultad === facultad.nombre && u.rol === rol,
              ),
            ).toHaveLength(cantidad)
          }
        }
      })

      it('no repite correos, ni entre ellos ni con los usuarios fijos', () => {
        const correos = [...universidad.usuarios, ...demo].map((u) => u.usuario)
        expect(new Set(correos).size).toBe(correos.length)
      })

      it('usa nombre y apellido, y un correo sin tildes ni mayúsculas', () => {
        for (const usuario of demo) {
          expect(usuario.nombre).toMatch(/^\S+ \S+$/)
          expect(usuario.usuario).toMatch(/^[a-z]+\.[a-z]+$/)
        }
      })

      it('genera siempre los mismos usuarios', () => {
        expect(usuariosDeDemo(indice)).toEqual(demo)
      })
    },
  )

  it('las universidades no repiten la lista de nombres', () => {
    const [norte, sur] = UNIVERSIDADES.map((_u, i) => usuariosDeDemo(i))
    expect(norte[0].nombre).not.toBe(sur[0].nombre)
  })
})

describe('verificarEntorno', () => {
  it('permite correr el seed fuera de producción', () => {
    expect(() => verificarEntorno({ NODE_ENV: 'development' })).not.toThrow()
    expect(() => verificarEntorno({})).not.toThrow()
  })

  it('bloquea el seed en producción', () => {
    expect(() => verificarEntorno({ NODE_ENV: 'production' })).toThrow(
      /SEED_ALLOW=true/,
    )
  })

  it('permite producción solo con SEED_ALLOW=true', () => {
    expect(() =>
      verificarEntorno({ NODE_ENV: 'production', SEED_ALLOW: 'true' }),
    ).not.toThrow()
    expect(() =>
      verificarEntorno({ NODE_ENV: 'production', SEED_ALLOW: '1' }),
    ).toThrow()
  })
})
