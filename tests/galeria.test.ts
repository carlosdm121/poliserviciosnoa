import { describe, expect, it } from 'vitest'

import {
  BYTES_MAXIMOS,
  carpetaDePerfil,
  esFormatoPermitido,
  FORMATOS_PERMITIDOS,
  LIMITE_IMAGENES,
  LADO_MAXIMO,
  mensajeLimiteAlcanzado,
  publicIdPerteneceA,
  publicIdTieneTraversal,
  TRANSFORMACION_SUBIDA,
  urlMiniatura,
} from '@/lib/imagen'

/**
 * Tests de la lógica pura de la galería.
 *
 * Van en Vitest y no en `scripts/verificar-galeria.ts` porque no tocan la base:
 * son comparaciones de strings y de números, y para correrlas no hace falta
 * levantar un Postgres. Acá va el `qué`; allá va el `y con doce peticiones a
 * la vez`, que necesita transacciones de verdad.
 *
 * El caso que más importa es `publicIdPerteneceA`: es la barrera anti-IDOR, y
 * es una función de 40 caracteres que nadie va a leer con cuidado en la
 * revisión a ojo.
 */

describe('carpetaDePerfil', () => {
  it('arma la carpeta con el prefijo perfiles/', () => {
    expect(carpetaDePerfil('abc123')).toBe('perfiles/abc123')
  })

  it('dos perfiles distintos nunca comparten carpeta', () => {
    expect(carpetaDePerfil('abc')).not.toBe(carpetaDePerfil('abd'))
  })
})

describe('publicIdPerteneceA', () => {
  const perfil = 'perfil-1'
  const carpeta = `perfiles/${perfil}`

  it('acepta una imagen de la carpeta del perfil', () => {
    expect(publicIdPerteneceA(`${carpeta}/foto-abc`, perfil)).toBe(true)
  })

  it('rechaza la imagen de otro perfil', () => {
    expect(publicIdPerteneceA('perfiles/perfil-2/foto-abc', perfil)).toBe(false)
  })

  it('rechaza un perfil cuyo id es prefijo del de otro', () => {
    // El caso que un `startsWith` ingenuo deja pasar. "perfil-1" no es dueño de
    // las fotos de "perfil-10", aunque "perfil-10" empiece con "perfil-1".
    expect(publicIdPerteneceA('perfiles/perfil-10/foto', 'perfil-1')).toBe(false)
  })

  it('rechaza un perfil cuyo id termina con el de otro', () => {
    expect(publicIdPerteneceA('perfiles/xperfil-1/foto', perfil)).toBe(false)
  })

  it('rechaza un publicId que es solo la carpeta, sin archivo', () => {
    expect(publicIdPerteneceA(carpeta, perfil)).toBe(false)
    expect(publicIdPerteneceA(`${carpeta}/`, perfil)).toBe(false)
  })

  it('rechaza un publicId vacío', () => {
    expect(publicIdPerteneceA('', perfil)).toBe(false)
  })

  it('rechaza una URL completa, no un publicId', () => {
    // El navegador puede mandar la URL por error; no es lo mismo que el id.
    expect(publicIdPerteneceA(`https://res.cloudinary.com/demo/image/upload/${carpeta}/foto`, perfil)).toBe(
      false,
    )
  })
})

describe('publicIdTieneTraversal', () => {
  it('detecta el salto de carpeta con ..', () => {
    expect(publicIdTieneTraversal('perfiles/a/../../perfiles/b/foto')).toBe(true)
  })

  it('detecta el doble slash', () => {
    expect(publicIdTieneTraversal('perfiles//foto')).toBe(true)
  })

  it('detecta el inicio con barra', () => {
    expect(publicIdTieneTraversal('/perfiles/a/foto')).toBe(true)
  })

  it('deja pasar un publicId normal', () => {
    expect(publicIdTieneTraversal('perfiles/abc123/foto-x1y2')).toBe(false)
  })

  it('deja pasar un publicId con guion y punto, que son normales', () => {
    expect(publicIdTieneTraversal('perfiles/abc-123/foto.mi-trabajo')).toBe(false)
  })
})

describe('esFormatoPermitido', () => {
  it('acepta los tres formatos', () => {
    for (const formato of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(esFormatoPermitido(formato)).toBe(true)
    }
  })

  it('acepta aunque venga en mayúsculas o con espacios', () => {
    expect(esFormatoPermitido('  IMAGE/JPEG ')).toBe(true)
  })

  it('rechaza un PDF disfrazado de foto', () => {
    expect(esFormatoPermitido('application/pdf')).toBe(false)
  })

  it('rechaza un SVG, que puede traer script', () => {
    // Un SVG subido a un sitio y servido desde nuestro dominio es un XSS
    // esperando a que alguien lo abra. Fuera de la galería.
    expect(esFormatoPermitido('image/svg+xml')).toBe(false)
  })

  it('rechaza un string vacío', () => {
    expect(esFormatoPermitido('')).toBe(false)
  })
})

describe('urlMiniatura', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/perfiles/abc/foto.jpg'

  it('inserta la transformación de Cloudinary', () => {
    expect(urlMiniatura(url)).toContain('/upload/c_fill,g_auto,w_400,q_auto,f_auto/')
  })

  it('respeta el ancho pedido', () => {
    expect(urlMiniatura(url, 800)).toContain('w_800')
  })

  it('deja la URL intacta si no es de Cloudinary', () => {
    const externa = 'https://ejemplo.com/foto.jpg'
    expect(urlMiniatura(externa)).toBe(externa)
  })
})

describe('constantes de la galería', () => {
  it('el límite es 10, y es el mismo que espera la publicación', () => {
    // Si este número cambia, tiene que cambiar también la condición de
    // `evaluarPublicacion` que exige al menos una foto. No es que alinee el
    // otro número: es que no se pueden desincronizar sin querer.
    expect(LIMITE_IMAGENES).toBe(20)
  })

  it('el peso máximo es 5 MB', () => {
    expect(BYTES_MAXIMOS).toBe(5 * 1024 * 1024)
  })

  it('el lado máximo es 1600 px', () => {
    expect(LADO_MAXIMO).toBe(1600)
  })

  it('la transformación firmada recorta y baja la calidad sola', () => {
    // Sin `c_limit` la transformation no hace nada: sube el archivo original.
    expect(TRANSFORMACION_SUBIDA).toContain('c_limit')
    expect(TRANSFORMACION_SUBIDA).toContain(`w_${LADO_MAXIMO}`)
    expect(TRANSFORMACION_SUBIDA).toContain('q_auto')
    expect(TRANSFORMACION_SUBIDA).toContain('f_auto')
  })

  it('los formatos declarados son los mismos que valida esFormatoPermitido', () => {
    // La lista de la firma y el chequeo del cliente tienen que decir lo mismo,
    // o el usuario sube un formato que la firma no deja.
    expect([...FORMATOS_PERMITIDOS].sort()).toEqual(['jpeg', 'jpg', 'png', 'webp'])
  })

  it('el mensaje del límite dice cuántos lugares hay y qué hacer', () => {
    const mensaje = mensajeLimiteAlcanzado()
    expect(mensaje).toContain('20')
    expect(mensaje.toLowerCase()).toContain('borrá')
  })
})