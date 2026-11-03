import { Province } from '@prisma/client'

/**
 * Localidades de las 5 provincias.
 *
 * Estructura separada de la lógica para poder editarla sin tocar `seed.ts`.
 *
 * `sortOrder` pone la capital primero: es la que más se busca y la que se
 * muestra por defecto en los filtros.
 *
 * El orden de las provincias es el de lanzamiento: Tucumán arranca sola y las
 * demás se abren cuando haya oferta suficiente (módulo de lanzamiento).
 *
 * Marcan las localidades agregadas por criterio de población (más de ~5.000
 * habitantes) que conviene que el dueño revise.
 */
export type Ciudad = {
  province: Province
  name: string
  slug: string
  /** Descomentalo con `//` si querés marcar las que agregué por criterio. */
  nota?: string
}

export const CIUDADES: Ciudad[] = [
  // -------------------------------------------------------------------------
  // TUCUMÁN — capital San Miguel de Tucumán
  // -------------------------------------------------------------------------
  { province: Province.TUCUMAN, name: 'San Miguel de Tucumán', slug: 'san-miguel-de-tucuman' },
  { province: Province.TUCUMAN, name: 'Yerba Buena', slug: 'yerba-buena' },
  { province: Province.TUCUMAN, name: 'Tafí Viejo', slug: 'tafi-viejo' },
  { province: Province.TUCUMAN, name: 'Banda del Río Salí', slug: 'banda-del-rio-sali' },
  { province: Province.TUCUMAN, name: 'Alderetes', slug: 'alderetes' },
  { province: Province.TUCUMAN, name: 'Concepción', slug: 'concepcion' },
  { province: Province.TUCUMAN, name: 'Monteros', slug: 'monteros' },
  { province: Province.TUCUMAN, name: 'Aguilares', slug: 'aguilares' },
  { province: Province.TUCUMAN, name: 'Famaillá', slug: 'famailla' },
  { province: Province.TUCUMAN, name: 'Lules', slug: 'lules' },
  { province: Province.TUCUMAN, name: 'Tafí del Valle', slug: 'tafi-del-valle' },
  { province: Province.TUCUMAN, name: 'Simoca', slug: 'simoca' },
  { province: Province.TUCUMAN, name: 'Bella Vista', slug: 'bella-vista' },
  { province: Province.TUCUMAN, name: 'Juan Bautista Alberdi', slug: 'juan-bautista-alberdi' },
  { province: Province.TUCUMAN, name: 'Las Talitas', slug: 'las-talitas' },
  { province: Province.TUCUMAN, name: 'Los Pocitos', slug: 'los-pocitos' },
  { province: Province.TUCUMAN, name: 'El Collao', slug: 'el-collao' },
  { province: Province.TUCUMAN, name: 'Piedmont', slug: 'piedmont' },
  { province: Province.TUCUMAN, name: 'Trancas', slug: 'trancas' },

  // -------------------------------------------------------------------------
  // SALTA — capital Salta
  // -------------------------------------------------------------------------
  { province: Province.SALTA, name: 'Salta', slug: 'salta' },
  { province: Province.SALTA, name: 'San Lorenzo', slug: 'san-lorenzo' },
  { province: Province.SALTA, name: 'San Ramón de la Nueva Orán', slug: 'san-ramon-de-la-nueva-oran' },
  { province: Province.SALTA, name: 'Tartagal', slug: 'tartagal' },
  { province: Province.SALTA, name: 'General Güemes', slug: 'general-guemes' },
  { province: Province.SALTA, name: 'Cafayate', slug: 'cafayate' },
  { province: Province.SALTA, name: 'Rosario de la Frontera', slug: 'rosario-de-la-frontera' },
  { province: Province.SALTA, name: 'San José de Metán', slug: 'metan' },
  { province: Province.SALTA, name: 'Cerrillos', slug: 'cerrillos' },
  { province: Province.SALTA, name: 'Embarcación', slug: 'embarcacion' },
  { province: Province.SALTA, name: 'Rosario de Lerma', slug: 'rosario-de-lerma' },
  { province: Province.SALTA, name: 'Cachi', slug: 'cachi' },
  { province: Province.SALTA, name: 'San Antonio de los Cobres', slug: 'san-antonio-de-los-cobres' },
  { province: Province.SALTA, name: 'Campo Quijano', slug: 'campo-quijano' },
  { province: Province.SALTA, name: 'La Merced', slug: 'la-merced' },
  { province: Province.SALTA, name: 'Apolinario Saravia', slug: 'apolinario-saravia' },
  { province: Province.SALTA, name: 'El Carril', slug: 'el-carril' },

  // -------------------------------------------------------------------------
  // SANTIAGO DEL ESTERO — capital Santiago del Estero
  // -------------------------------------------------------------------------
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Santiago del Estero', slug: 'santiago-del-estero' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'La Banda', slug: 'la-banda' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Termas de Río Hondo', slug: 'termas-de-rio-hondo' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Frías', slug: 'frias' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Añatuya', slug: 'anatuya' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Fernández', slug: 'fernandez' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Clodomira', slug: 'clodomira' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Quimilí', slug: 'quimili' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Loreto', slug: 'loreto' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Monte Quemado', slug: 'monte-quemado' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Suncho Corral', slug: 'suncho-corral' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Bandera del Carmen', slug: 'bandera-del-carmen' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Ojo de Agua', slug: 'ojo-de-agua' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Atamisqui', slug: 'atamisqui' },
  { province: Province.SANTIAGO_DEL_ESTERO, name: 'Los Telares', slug: 'los-telares' },

  // -------------------------------------------------------------------------
  // CATAMARCA — capital San Fernando del Valle de Catamarca
  // -------------------------------------------------------------------------
  { province: Province.CATAMARCA, name: 'San Fernando del Valle de Catamarca', slug: 'san-fernando-del-valle-de-catamarca' },
  { province: Province.CATAMARCA, name: 'Belén', slug: 'belen' },
  { province: Province.CATAMARCA, name: 'Tinogasta', slug: 'tinogasta' },
  { province: Province.CATAMARCA, name: 'Andalgalá', slug: 'andalgala' },
  { province: Province.CATAMARCA, name: 'Santa María', slug: 'santa-maria' },
  { province: Province.CATAMARCA, name: 'Recreo', slug: 'recreo' },
  { province: Province.CATAMARCA, name: 'Fiambalá', slug: 'fiambala' },
  { province: Province.CATAMARCA, name: 'Valle Viejo', slug: 'valle-viejo' },
  { province: Province.CATAMARCA, name: 'Fray Mamerto Esquiú', slug: 'fray-mamerto-esquiu' },
  { province: Province.CATAMARCA, name: 'Saujil', slug: 'saujil' },
  { province: Province.CATAMARCA, name: 'Pomán', slug: 'poman' },
  { province: Province.CATAMARCA, name: 'Capayán', slug: 'capayan' },
  { province: Province.CATAMARCA, name: 'Valle de Santa María', slug: 'valle-de-santa-maria' },

  // -------------------------------------------------------------------------
  // JUJUY — capital San Salvador de Jujuy
  // -------------------------------------------------------------------------
  { province: Province.JUJUY, name: 'San Salvador de Jujuy', slug: 'san-salvador-de-jujuy' },
  { province: Province.JUJUY, name: 'Palpalá', slug: 'palpala' },
  { province: Province.JUJUY, name: 'San Pedro de Jujuy', slug: 'san-pedro-de-jujuy' },
  { province: Province.JUJUY, name: 'Libertador General San Martín', slug: 'libertador-general-san-martin' },
  { province: Province.JUJUY, name: 'Perico', slug: 'perico' },
  { province: Province.JUJUY, name: 'Humahuaca', slug: 'humahuaca' },
  { province: Province.JUJUY, name: 'Tilcara', slug: 'tilcara' },
  { province: Province.JUJUY, name: 'Purmamarca', slug: 'purmamarca' },
  { province: Province.JUJUY, name: 'La Quiaca', slug: 'la-quiaca' },
  { province: Province.JUJUY, name: 'El Carmen', slug: 'el-carmen' },
  { province: Province.JUJUY, name: 'Abra Pampa', slug: 'abra-pampa' },
  { province: Province.JUJUY, name: 'Monterrico', slug: 'monterrico' },
  { province: Province.JUJUY, name: 'Fraile Pintado', slug: 'fraile-pintado' },

  // -------------------------------------------------------------------------
  // Zonas rurales sin localidad propia
  // -------------------------------------------------------------------------
  // Un técnico de campo que atiende toda la zona no tiene por qué figurar en
  // una ciudad que no existe: elige "otra localidad" y el admin le asigna la
  // más cercana cuando tenga los datos.
  ...(
    [
      Province.TUCUMAN,
      Province.SALTA,
      Province.SANTIAGO_DEL_ESTERO,
      Province.CATAMARCA,
      Province.JUJUY,
    ] as const
  ).map((province) => ({
    province,
    name: 'Otra localidad',
    slug: 'otra-localidad',
  })),
]
