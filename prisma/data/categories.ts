/**
 * Grupos, rubros y subcategorías del portal.
 *
 * Datos separados de la lógica para poder editarlos sin tocar `seed.ts`.
 * Cuando hay que corregir un nombre o agregar un rubro, se edita acá.
 *
 * Todos con `isActive: true`. La desactivación real depende de que haya
 * perfiles publicados (módulo de lanzamiento): un rubro sin oferta no se
 * muestra como vacío, sino como "próximamente".
 */

/** Estructura de un subcategoría tal como se persiste. */
type Subcategoria = {
  name: string
  slug: string
}

/** Estructura de un rubro tal como se persiste. */
export type Rubro = {
  name: string
  slug: string
  icon: string
  /** Rubros regulados: exigen matrícula para publicar. */
  requiresLicense?: boolean
  /** Etiqueta de la matrícula, tal como la entiende el profesional. */
  licenseLabel?: string
  subcategories: Subcategoria[]
}

/** Estructura de un grupo tal como se persiste. */
export type Grupo = {
  name: string
  slug: string
  icon: string
  categories: Rubro[]
}

/**
 * 57 rubros en 8 grupos.
 *
 * Los nombres son los que busca la gente: "plomería", no "instalaciones
 * hidráulicas". Un rubro con nombre técnico no lo encuentra nadie.
 */
export const GRUPOS: Grupo[] = [
  {
    name: 'Hogar y construcción',
    slug: 'hogar-y-construccion',
    icon: 'House',
    categories: [
      {
        name: 'Plomería',
        slug: 'plomeria',
        icon: 'Wrench',
        subcategories: [
          { name: 'Destapaciones', slug: 'destapaciones' },
          { name: 'Instalación de agua y sanitarios', slug: 'instalacion-agua-sanitarios' },
          { name: 'Cloacas y cámaras sépticas', slug: 'cloacas-camaras-septicas' },
          { name: 'Termotanques y calefones', slug: 'termotanques-calefones' },
          { name: 'Pérdidas y filtraciones', slug: 'perdidas-filtraciones' },
        ],
      },
      {
        name: 'Electricidad',
        slug: 'electricidad',
        icon: 'Zap',
        subcategories: [
          { name: 'Instalaciones nuevas', slug: 'instalaciones-nuevas' },
          { name: 'Reparaciones y cortocircuitos', slug: 'reparaciones-cortocircuitos' },
          { name: 'Tableros', slug: 'tableros' },
          { name: 'Iluminación', slug: 'iluminacion' },
          { name: 'Electricista industrial', slug: 'electricista-industrial' },
        ],
      },
      {
        name: 'Gas matriculado',
        slug: 'gas-matriculado',
        icon: 'Flame',
        requiresLicense: true,
        licenseLabel: 'Matrícula de gasista',
        subcategories: [
          { name: 'Instalación de gas', slug: 'instalacion-gas' },
          { name: 'Revisiones y certificados', slug: 'revisiones-certificados' },
          { name: 'Detección de fugas', slug: 'deteccion-fugas' },
          { name: 'Calefactores y estufas', slug: 'calefactores-estufas' },
        ],
      },
      {
        name: 'Albañilería',
        slug: 'albanileria',
        icon: 'BrickWall',
        subcategories: [
          { name: 'Muros y tabiques', slug: 'muros-tabiques' },
          { name: 'Pisos y.countertops', slug: 'pisos-countertops' },
          { name: 'Reformas', slug: 'reformas' },
          { name: 'Fundaciones', slug: 'fundaciones' },
          { name: 'Aislación', slug: 'aislacion' },
        ],
      },
      {
        name: 'Pintura',
        slug: 'pintura',
        icon: 'Paintbrush',
        subcategories: [
          { name: 'Pintura de interiores', slug: 'pintura-interiores' },
          { name: 'Pintura de exteriores', slug: 'pintura-exteriores' },
          { name: 'Llacuado y barnizado', slug: 'llacuado-barnizado' },
          { name: 'Pintura decorativa', slug: 'pintura-decorativa' },
        ],
      },
      {
        name: 'Carpintería',
        slug: 'carpinteria',
        icon: 'Hammer',
        subcategories: [
          { name: 'Muebles a medida', slug: 'muebles-medida' },
          { name: 'Placards y closets', slug: 'placards-closets' },
          { name: 'Puertas y ventanas', slug: 'puertas-ventanas' },
          { name: 'Reparación de muebles', slug: 'reparacion-muebles' },
          { name: 'Escaleras', slug: 'escaleras' },
        ],
      },
      {
        name: 'Herrería',
        slug: 'herreria',
        icon: 'Anvil',
        subcategories: [
          { name: 'Portones', slug: 'portones' },
          { name: 'Rejas y barandas', slug: 'rejas-barandas' },
          { name: 'Trabajos de herrería', slug: 'trabajos-herrería' },
          { name: 'Estructuras metálicas', slug: 'estructuras-metalicas' },
        ],
      },
      {
        name: 'Cerrajería',
        slug: 'cerrajería',
        icon: 'KeyRound',
        subcategories: [
          { name: 'Cambio de cerraduras', slug: 'cambio-cerraduras' },
          { name: 'Apertura de puertas', slug: 'apertura-puertas' },
          { name: 'Reparación de cerraduras', slug: 'reparacion-cerraduras' },
          { name: 'Copias de llaves', slug: 'copias-llaves' },
        ],
      },
      {
        name: 'Aire acondicionado y refrigeración',
        slug: 'aire-acondicionado',
        icon: 'AirVent',
        subcategories: [
          { name: 'Instalación', slug: 'instalacion' },
          { name: 'Service y limpieza', slug: 'service-limpieza' },
          { name: 'Reparación', slug: 'reparacion' },
          { name: 'Carga de gas', slug: 'carga-gas' },
        ],
      },
      {
        name: 'Pisos y cerámicos',
        slug: 'pisos-ceramicos',
        icon: 'Grid2x2',
        subcategories: [
          { name: 'Colocación de pisos', slug: 'colocacion-pisos' },
          { name: 'Cerámicos y revestimientos', slug: 'ceramicos-revestimientos' },
          { name: 'Pulido y abrillantado', slug: 'pulido-abrillantado' },
          { name: 'Remoción de pisos', slug: 'remocion-pisos' },
        ],
      },
      {
        name: 'Durlock y yesería',
        slug: 'durlock-yeseria',
        icon: 'PanelTop',
        subcategories: [
          { name: 'Placares de durlock', slug: 'placares-durlock' },
          { name: 'Tabiques', slug: 'tabiques' },
          { name: 'Cielos rasos', slug: 'cielos-rasos' },
          { name: 'Yesería y terminaciones', slug: 'yeseria-terminaciones' },
        ],
      },
      {
        name: 'Techistas e impermeabilización',
        slug: 'techistas-impermeabilizacion',
        icon: 'ShieldCheck',
        subcategories: [
          { name: 'Impermeabilización de tanques', slug: 'impermeabilizacion-tanques' },
          { name: 'Impermeabilización de techos', slug: 'impermeabilizacion-techos' },
          { name: 'Detección de filtraciones', slug: 'deteccion-filtraciones' },
          { name: 'Sellado de juntas', slug: 'sellado-juntas' },
        ],
      },
      {
        name: 'Vidriería',
        slug: 'vidrieria',
        icon: 'AppWindow',
        subcategories: [
          { name: 'Cambio de vidrios', slug: 'cambio-vidrios' },
          { name: 'Vidrios blindados', slug: 'vidrios-blindados' },
          { name: 'Espejos', slug: 'espejos' },
          { name: 'Termotanque y mamparas', slug: 'termotanque-mamparas' },
        ],
      },
      {
        name: 'Jardinería y poda',
        slug: 'jardineria-poda',
        icon: 'Trees',
        subcategories: [
          { name: 'Poda y recorte', slug: 'poda-recorte' },
          { name: 'Diseño de jardines', slug: 'diseno-jardines' },
          { name: 'Riego', slug: 'riego' },
          { name: 'Cuidado de césped', slug: 'cuidado-cesped' },
          { name: 'Desmonte de ramas', slug: 'desmonte-ramas' },
        ],
      },
    ],
  },
  {
    // Octavo grupo.
    //
    // "Hogar y construcción" había quedado con 19 rubros, el doble que
    // cualquier otro grupo, y la mitad no tenía nada que ver con obra:
    // limpieza, jardinería, control de plagas. En una pantalla de móvil eso
    // es un bloque interminable donde nadie encuentra lo suyo.
    //
    // Se separa ahora y no más adelante porque cambiar el grupo de un rubro
    // después mueve el mismo perfil entre URLs distintas y rompe el SEO ya
    // indexado. Es barato hacerlo antes de publicar y caro después.
    name: 'Cuidado del hogar',
    slug: 'cuidado-del-hogar',
    icon: 'Sprout',
    categories: [
      {
        name: 'Pileteros',
        slug: 'pileteros',
        icon: 'Layers',
        subcategories: [
          { name: 'Impermeabilización de swim', slug: 'impermeabilizacion-swim' },
          { name: 'Reparación de filtraciones', slug: 'reparacion-filtraciones' },
          { name: 'Mantenimiento mensual', slug: 'mantenimiento-mensual' },
          { name: 'Detección de pérdidas', slug: 'deteccion-perdidas' },
        ],
      },
      {
        name: 'Control de plagas',
        slug: 'control-plagas',
        icon: 'Bug',
        subcategories: [
          { name: 'Desinfección', slug: 'desinfeccion' },
          { name: 'Fumigación', slug: 'fumigacion' },
          { name: 'Control de roedores', slug: 'control-roedores' },
          { name: 'Desratización', slug: 'desratizacion' },
        ],
      },
      {
        name: 'Limpieza de hogares y oficinas',
        slug: 'limpieza',
        icon: 'Sparkles',
        subcategories: [
          { name: 'Limpieza profunda', slug: 'limpieza-profunda' },
          { name: 'Limpieza de oficinas', slug: 'limpieza-oficinas' },
          { name: 'Limpieza post obra', slug: 'limpieza-post-obra' },
          { name: 'Limpieza de vidrios', slug: 'limpieza-vidrios' },
        ],
      },
      {
        name: 'Tapicería',
        slug: 'tapiceria',
        icon: 'Armchair',
        subcategories: [
          { name: 'Tapizado de sillones', slug: 'tapizado-sillones' },
          { name: 'Colchones', slug: 'colchones' },
          { name: 'Cortinas', slug: 'cortinas' },
          { name: 'Reparación', slug: 'reparacion' },
        ],
      },
      {
        name: 'Alarmas y cámaras de seguridad',
        slug: 'alarmas-camaras',
        icon: 'Cctv',
        subcategories: [
          { name: 'Instalación de cámaras', slug: 'instalacion-camaras' },
          { name: 'Instalación de alarmas', slug: 'instalacion-alarmas' },
          { name: 'Mantenimiento', slug: 'mantenimiento' },
          { name: 'Monitoreo', slug: 'monitoreo' },
        ],
      },
    ],
  },
  {
    name: 'Transporte y mecánica',
    slug: 'transporte-mecanica',
    icon: 'Truck',
    categories: [
      {
        name: 'Fletes y mudanzas',
        slug: 'fletes-mudanzas',
        icon: 'Truck',
        subcategories: [
          { name: 'Mudanzas locales', slug: 'mudanzas-locales' },
          { name: 'Mudanzas entre provincias', slug: 'mudanzas-entre-provincias' },
          { name: 'Fletes pequeños', slug: 'fletes-pequenos' },
          { name: 'Traslado de muebles', slug: 'traslado-muebles' },
          { name: 'Camión con hidrogrúa', slug: 'camion-hidrogrua' },
        ],
      },
      {
        name: 'Remises y traslados',
        slug: 'remises-traslados',
        icon: 'Car',
        subcategories: [
          { name: 'Remises locales', slug: 'remises-locales' },
          { name: 'Traslado al aeropuerto', slug: 'traslado-aeropuerto' },
          { name: 'Traslado a terminal de omnibus', slug: 'traslado-terminal' },
          { name: 'Viajes interurbanos', slug: 'viajes-interurbanos' },
        ],
      },
      {
        name: 'Mecánica del automotor',
        slug: 'mecanica-automotor',
        icon: 'Wrench',
        subcategories: [
          { name: 'Service y-tune up', slug: 'service-tune-up' },
          { name: 'Cambio de aceite y filtros', slug: 'cambio-aceite-filtros' },
          { name: 'Frenos y suspensión', slug: 'frenos-suspension' },
          { name: 'Diagnóstico computarizado', slug: 'diagnostico-computarizado' },
          { name: 'Motor', slug: 'motor' },
        ],
      },
      {
        name: 'Mecánica de motos',
        slug: 'mecanica-motos',
        icon: 'Bike',
        subcategories: [
          { name: 'Service de motos', slug: 'service-motos' },
          { name: 'Cambio de aceite', slug: 'cambio-aceite' },
          { name: 'Frenos', slug: 'frenos' },
          { name: 'Reparación de carburación', slug: 'reparacion-carburacion' },
        ],
      },
      {
        name: 'Gomería',
        slug: 'gomeria',
        icon: 'CircleDot',
        subcategories: [
          { name: 'Cambio de neumáticos', slug: 'cambio-neumaticos' },
          { name: 'Reparación de neumáticos', slug: 'reparacion-neumaticos' },
          { name: 'Balanceo y alineación', slug: 'balanceo-alineacion' },
          { name: 'Guardado de neumáticos', slug: 'guardado-neumaticos' },
        ],
      },
      {
        name: 'Chapa y pintura',
        slug: 'chapa-pintura',
        icon: 'CarFront',
        subcategories: [
          { name: 'Chapa de-accidentes', slug: 'chapa-accidentes' },
          { name: 'Pintura y retouchizado', slug: 'pintura-retouchizado' },
          { name: 'Reparacion de chapas', slug: 'reparacion-chapas' },
        ],
      },
      {
        name: 'Auxilio mecánico',
        slug: 'auxilio-mecanico',
        icon: 'TowTruck',
        subcategories: [
          { name: 'Auxilio 24 horas', slug: 'auxilio-24-horas' },
          { name: 'Remolque', slug: 'remolque' },
          { name: 'Arranque de motor', slug: 'arranque-motor' },
          { name: 'Cambio de batería en el lugar', slug: 'cambio-bateria-lugar' },
        ],
      },
      {
        name: 'Lavadero de autos',
        slug: 'lavadero-autos',
        icon: 'Car',
        subcategories: [
          { name: 'Lavado exterior', slug: 'lavado-exterior' },
          { name: 'Lavado interior', slug: 'lavado-interior' },
          { name: 'Encerado y detailing', slug: 'encerado-detailing' },
          { name: 'Limpieza de tapizados', slug: 'limpieza-tapizados' },
        ],
      },
    ],
  },
  {
    name: 'Tecnología y oficina',
    slug: 'tecnologia-oficina',
    icon: 'Laptop',
    categories: [
      {
        name: 'Técnico en computación',
        slug: 'tecnico-computacion',
        icon: 'Monitor',
        subcategories: [
          { name: 'Reparación de computadoras', slug: 'reparacion-computadoras' },
          { name: 'Armado de equipos', slug: 'armado-equipos' },
          { name: 'Redes y wifi', slug: 'redes-wifi' },
          { name: 'Mantenimiento preventivo', slug: 'mantenimiento-preventivo' },
          { name: 'Recuperación de datos', slug: 'recuperacion-datos' },
        ],
      },
      {
        name: 'Reparación de celulares',
        slug: 'reparacion-celulares',
        icon: 'Smartphone',
        subcategories: [
          { name: 'Cambio de pantalla', slug: 'cambio-pantalla' },
          { name: 'Cambio de batería', slug: 'cambio-bateria' },
          { name: 'Daño por líquido', slug: 'dao-liquido' },
          { name: 'Cambio de cámara y altavoz', slug: 'cambio-camara-altavoz' },
          { name: 'Desbloqueo', slug: 'desbloqueo' },
        ],
      },
      {
        name: 'Diseño web y gráfico',
        slug: 'diseno-web-grafico',
        icon: 'Palette',
        subcategories: [
          { name: 'Diseño web', slug: 'diseno-web' },
          { name: 'Logos e identidad visual', slug: 'logos-identidad-visual' },
          { name: 'Diseño para redes', slug: 'diseno-redes' },
          { name: 'Impresión', slug: 'impresion' },
        ],
      },
      {
        name: 'Community manager',
        slug: 'community-manager',
        icon: 'Share2',
        subcategories: [
          { name: 'Gestión de redes', slug: 'gestion-redes' },
          { name: 'Creación de contenido', slug: 'creacion-contenido' },
          { name: 'Campañas publicitarias', slug: 'campanas-publicitarias' },
        ],
      },
      {
        name: 'Contadores y gestoría',
        slug: 'contadores-gestoria',
        icon: 'FileSpreadsheet',
        requiresLicense: true,
        licenseLabel: 'Matrícula en el Consejo Profesional de Ciencias Económicas',
        subcategories: [
          { name: 'Contabilidad', slug: 'contabilidad' },
          { name: 'Ganancias y bienes personales', slug: 'ganancias-bienes' },
          { name: 'Monotributo', slug: 'monotributo' },
          { name: 'Gestoría', slug: 'gestoria' },
          { name: 'Liquide de servicios públicos', slug: 'liquidacion-servicios' },
        ],
      },
      {
        name: 'Estudios jurídicos',
        slug: 'estudios-juridicos',
        icon: 'Scale',
        requiresLicense: true,
        licenseLabel: 'Matrícula inscripta en laatology boards de la Provincia',
        subcategories: [
          { name: 'Civil', slug: 'civil' },
          { name: 'Laboral', slug: 'laboral' },
          { name: 'Penal', slug: 'penal' },
          { name: 'Familia', slug: 'familia' },
        ],
      },
      {
        name: 'Traducciones',
        slug: 'traducciones',
        icon: 'Languages',
        subcategories: [
          { name: 'Traducción inglés', slug: 'traduccion-ingles' },
          { name: 'Traducción português', slug: 'traduccion-portugues' },
          { name: 'Traducción de documentos', slug: 'traduccion-documentos' },
          { name: 'Interpretación', slug: 'interpretacion' },
        ],
      },
    ],
  },
  {
    name: 'Servicios personales y cuidado',
    slug: 'servicios-personales',
    icon: 'Heart',
    categories: [
      {
        name: 'Peluquería y barbería',
        slug: 'peluqueria-barberia',
        icon: 'Scissors',
        subcategories: [
          { name: 'Corte de pelo', slug: 'corte-pelo' },
          { name: 'Coloración', slug: 'coloracion' },
          { name: 'Alisado y keratin', slug: 'alisado-keratin' },
          { name: 'Barbería', slug: 'barberia' },
          { name: 'Peinados y styling', slug: 'peinados-styling' },
        ],
      },
      {
        name: 'Manicura y estética',
        slug: 'manicura-estetica',
        icon: 'Flower',
        subcategories: [
          { name: 'Manicura y pedicura', slug: 'manicura-pedicura' },
          { name: 'Uñas esculpidas', slug: 'unas-esculpidas' },
          { name: 'Depilación', slug: 'depilacion' },
          { name: 'Estética facial', slug: 'estetica-facial' },
          { name: 'Masajes reductores', slug: 'masajes-reductores' },
        ],
      },
      {
        name: 'Masajistas',
        slug: 'masajistas',
        icon: 'Hand',
        subcategories: [
          { name: 'Masaje relajante', slug: 'masaje-relajante' },
          { name: 'Masaje descontracturante', slug: 'masaje-descontracturante' },
          { name: 'Masaje deportivo', slug: 'masaje-deportivo' },
          { name: 'Drenaje linfático', slug: 'drenaje-linfatico' },
          { name: 'Masaje con piedras calientes', slug: 'masaje-piedras-calientes' },
        ],
      },
      {
        name: 'Cuidado de adultos mayores',
        slug: 'cuidado-adultos-mayores',
        icon: 'HeartPulse',
        subcategories: [
          { name: 'Acompañamiento', slug: 'acompanamiento' },
          { name: 'Cuidador por horas', slug: 'cuidador-horas' },
          { name: 'Cuidado nocturno', slug: 'cuidado-nocturno' },
          { name: 'Movilización y fisioterapia', slug: 'movilizacion-fisioterapia' },
        ],
      },
      {
        name: 'Niñeras',
        slug: 'nineras',
        icon: 'Baby',
        subcategories: [
          { name: 'Niñera por horas', slug: 'nineras-horas' },
          { name: 'Niñera por jornada', slug: 'nineras-jornada' },
          { name: 'Niñera para salir', slug: 'nineras-salir' },
          { name: 'Niñera nocturna', slug: 'nineras-nocturna' },
        ],
      },
      {
        name: 'Paseadores y cuidado de mascotas',
        slug: 'paseadores-mascotas',
        icon: 'Dog',
        subcategories: [
          { name: 'Paseos', slug: 'paseos' },
          { name: 'Paseoscones', slug: 'paseos-grandes' },
          { name: 'R paseo nocturno', slug: 'paseo-nocturno' },
          { name: 'Paseo de perros de compañía', slug: 'paseo-compania' },
        ],
      },
      {
        name: 'Veterinarios a domicilio',
        slug: 'veterinarios-domicilio',
        icon: 'Stethoscope',
        requiresLicense: true,
        licenseLabel: 'Matrícula profesional en el Colegio de Veterinarios',
        subcategories: [
          { name: 'Consulta a domicilio', slug: 'consulta-domicilio' },
          { name: 'Vacunación', slug: 'vacunacion' },
          { name: 'Desparasitación', slug: 'desparasitacion' },
          { name: 'Eutanasia', slug: 'eutanasia' },
        ],
      },
      {
        name: 'Entrenadores personales',
        slug: 'entrenadores-personales',
        icon: 'Dumbbell',
        subcategories: [
          { name: 'Entrenamiento en gimnasio', slug: 'entrenamiento-gimnasio' },
          { name: 'Entrenamiento a domicilio', slug: 'entrenamiento-domicilio' },
          { name: 'Pérdida de peso', slug: 'perdida-peso' },
          { name: 'Entrenamiento funcional', slug: 'entrenamiento-funcional' },
        ],
      },
    ],
  },
  {
    name: 'Educación',
    slug: 'educacion',
    icon: 'GraduationCap',
    categories: [
      {
        name: 'Clases particulares',
        slug: 'clas-particulares',
        icon: 'BookOpen',
        subcategories: [
          { name: 'Primaria', slug: 'primaria' },
          { name: 'Secundaria', slug: 'secundaria' },
          { name: 'CBC', slug: 'cbc' },
          { name: 'Universidad', slug: 'universidad' },
        ],
      },
      {
        name: 'Idiomas',
        slug: 'idiomas',
        icon: 'Languages',
        subcategories: [
          { name: 'Inglés', slug: 'ingles' },
          { name: 'Portugués', slug: 'portugues' },
          { name: 'Francés', slug: 'frances' },
          { name: 'Italiano', slug: 'italiano' },
        ],
      },
      {
        name: 'Música',
        slug: 'musica',
        icon: 'Music',
        subcategories: [
          { name: 'Guitarra', slug: 'guitarra' },
          { name: 'Piano', slug: 'piano' },
          { name: 'Batería', slug: 'bateria' },
          { name: 'Canto', slug: 'canto' },
          { name: 'Violín', slug: 'violin' },
        ],
      },
      {
        name: 'Apoyo escolar',
        slug: 'apoyo-escolar',
        icon: 'NotebookPen',
        subcategories: [
          { name: 'Leveling', slug: 'leveling' },
          { name: 'Acompanamiento escolar', slug: 'acompanamiento-escolar' },
          { name: 'Tareas', slug: 'tareas' },
        ],
      },
    ],
  },
  {
    name: 'Eventos y gastronomía',
    slug: 'eventos-gastronomia',
    icon: 'PartyPopper',
    categories: [
      {
        name: 'Fotografía y video',
        slug: 'fotografia-video',
        icon: 'Camera',
        subcategories: [
          { name: 'Fotografía de eventos', slug: 'fotografia-eventos' },
          { name: 'Video eventos', slug: 'video-eventos' },
          { name: 'Fotografía de productos', slug: 'fotografia-productos' },
          { name: 'Drones', slug: 'drones' },
        ],
      },
      {
        name: 'DJ y sonido',
        slug: 'dj-sonido',
        icon: 'AudioLines',
        subcategories: [
          { name: 'DJ para fiestas', slug: 'dj-fiestas' },
          { name: 'Sonido para eventos', slug: 'sonido-eventos' },
          { name: 'Iluminación', slug: 'iluminacion' },
          { name: 'Alquiler de equipos', slug: 'alquiler-equipos' },
        ],
      },
      {
        name: 'Catering',
        slug: 'catering',
        icon: 'UtensilsCrossed',
        subcategories: [
          { name: 'Catering para eventos', slug: 'catering-eventos' },
          { name: 'Viáticos y lunch', slug: 'viaticos-lunch' },
          { name: 'Comidas caseras', slug: 'comidas-caseras' },
          { name: 'Salsas y pastas', slug: 'salsas-pastas' },
        ],
      },
      {
        name: 'Pastelería y tortas',
        slug: 'pasteleria-tortas',
        icon: 'CakeSlice',
        subcategories: [
          { name: 'Tortas de cumpleaños', slug: 'tortas-cumpleanos' },
          { name: 'Tortas de casamiento', slug: 'tortas-casamiento' },
          { name: 'Postres', slug: 'postres' },
          { name: 'Factories sin gluten', slug: 'sin-gluten' },
        ],
      },
      {
        name: 'Alquiler de livings y mobiliario',
        slug: 'alquiler-livings',
        icon: 'TentTree',
        subcategories: [
          { name: 'Alquiler de livings', slug: 'alquiler-livings' },
          { name: 'Mesas y sillas', slug: 'mesas-sillas' },
          { name: 'Carpas', slug: 'carpas' },
          { name: 'Infantiles', slug: 'infantiles' },
        ],
      },
      {
        name: 'Animación infantil',
        slug: 'animacion-infantil',
        icon: 'Clown',
        subcategories: [
          { name: 'Fiestas infantiles', slug: 'fiestas-infantiles' },
          { name: 'Animadores', slug: 'animadores' },
          { name: 'Shows y magia', slug: 'shows-magia' },
          { name: 'Pintura de caras', slug: 'pintura-caras' },
        ],
      },
      {
        name: 'Decoración de eventos',
        slug: 'decoracion-eventos',
        icon: 'PartyPopper',
        subcategories: [
          { name: 'Decoración de salones', slug: 'decoracion-salones' },
          { name: 'Arreglos florales', slug: 'arreglos-florales' },
          { name: 'Mesa de dulces', slug: 'mesa-dulces' },
          { name: 'Cartelería', slug: 'carteleria' },
        ],
      },
    ],
  },
  {
    name: 'Turismo y regionales',
    slug: 'turismo-regionales',
    icon: 'Mountain',
    categories: [
      {
        name: 'Guías turísticos',
        slug: 'guias-turisticos',
        icon: 'Compass',
        requiresLicense: true,
        licenseLabel: 'Credencial de guía turístico enable',
        subcategories: [
          { name: 'Quebrada de Humahuaca', slug: 'humahuaca' },
          { name: 'Valles Calchaquíes', slug: 'calchaquies' },
          { name: 'Cerros y trekking', slug: 'cerros-trekking' },
          { name: 'Circuitos históricos', slug: 'circuitos-historicos' },
          { name: 'Ruta del vino', slug: 'ruta-del-vino' },
        ],
      },
      {
        name: 'Alquileres turísticos',
        slug: 'alquileres-turisticos',
        icon: 'Building2',
        subcategories: [
          { name: 'Casas deonds de campo', slug: 'casas-campo' },
          { name: 'Cabañas', slug: 'cabanas' },
          { name: 'Apartamentos', slug: 'apartamentos' },
          { name: 'Habitaciones', slug: 'habitaciones' },
        ],
      },
      {
        name: 'Transporte turístico',
        slug: 'transporte-turistico',
        icon: 'Bus',
        subcategories: [
          { name: 'Excursiones', slug: 'excursiones' },
          { name: 'Traslados de aeropuerto', slug: 'traslados-aeropuerto' },
          { name: 'Minibus turístico', slug: 'minibus-turistico' },
          { name: 'Traslados entre provincias', slug: 'traslados-provincias' },
        ],
      },
      {
        name: 'Artesanías y productos regionales',
        slug: 'artesanias-regionales',
        icon: 'Palette',
        subcategories: [
          { name: 'Cerámica', slug: 'ceramica' },
          { name: 'Textiles', slug: 'textiles' },
          { name: 'Maderas', slug: 'maderas' },
          { name: 'Regalos y souvenirs', slug: 'regalos-souvenirs' },
        ],
      },
    ],
  },
]
