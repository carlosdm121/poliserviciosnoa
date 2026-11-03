import { PaginaLegal } from '@/components/legales/PaginaLegal'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos y condiciones | PoliserviciosNOA',
  description:
    'Términos y condiciones de uso de PoliserviciosNOA: plataforma de intermediación entre clientes y profesionales del NOA argentino.',
}
export const dynamic = 'force-dynamic'

const ULTIMA_ACTUALIZACION = 'octubre de 2026'

const SECCIONES = [
  {
    titulo: '1. Qué es PoliserviciosNOA',
    parrafos: [
      'PoliserviciosNOA es una plataforma de intermediación. Conecta a clientes que buscan un servicio con profesionales que lo ofrecen en Tucumán, Salta, Santiago del Estero, Catamarca y Jujuy.',
      'La plataforma no presta servicios, no es parte del contrato entre el cliente y el profesional, y no garantiza el trabajo de ninguno de los dos. El contrato de servicio se celebra directamente entre vos y el profesional que elijas.',
    ],
  },
  {
    titulo: '2. Qué significa “WhatsApp verificado”',
    parrafos: [
      '“WhatsApp verificado” significa que el profesional demostró que controla ese número de WhatsApp enviando un código desde ese mismo número al número de la plataforma.',
      'No implica verificación de identidad, de antecedentes, de idoneidad ni de matrícula profesional. La plataforma no verifica quién es la persona detrás del número.',
    ],
  },
  {
    titulo: '3. Responsabilidades del profesional',
    parrafos: [
      'El profesional es el único responsable del servicio que brinda: su calidad, los plazos, los precios que acuerda con el cliente y el cumplimiento de las normas que le correspondan.',
      'Si el rubro requiere matrícula, el profesional declara tenerla informada. “Matrícula informada” es un dato declarado por el profesional, no una verificación de la plataforma, salvo que el admin indique una revisión manual.',
      'El profesional debe mantener su perfil actualizado: descripción, ciudad de cobertura, rubros y al menos una foto de un trabajo propio.',
    ],
  },
  {
    titulo: '4. Contenido prohibido',
    parrafos: [
      'No se permite publicar datos personales de terceros, números de contacto ajenos, ofertas de servicios ilegales, publicidad engañosa o contenido que suplanté la identidad de otra persona.',
      'Las imágenes de la galería deben ser trabajos reales del profesional. Subir fotos ajenas es motivo de suspensión.',
    ],
  },
  {
    titulo: '5. Suspensión de cuentas y lista de bloqueo',
    parrafos: [
      'La plataforma puede suspender un perfil por fraude, suplantación de número, reclamos validados repetidos o incumplimiento de estos términos. La suspensión se notifica al profesional con el motivo.',
      'Los números y correos bloqueados se guardan como hash, nunca en texto claro, para impedir nuevas altas sin exponer los datos de quien fue bloqueado.',
    ],
  },
  {
    titulo: '6. Defensa del consumidor',
    parrafos: [
      'Como cliente, tenés derecho a recibir la información clara del profesional antes de contratar y a reclamar si no se presentó o si el servicio no se ajustó a lo acordado.',
      'Desde el perfil del profesional podés abrir un reclamo si ya lo contactaste por WhatsApp. El equipo de la plataforma lo revisa y, si se acumulan varios reclamos validados, el perfil puede ser suspendido.',
    ],
  },
  {
    titulo: '7. Jurisdicción',
    parrafos: [
      'Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia derivada del uso de la plataforma se somete a la jurisdicción de los tribunales de la provincia de Tucumán, con renuncia a cualquier otro fuero.',
    ],
  },
]

const PUNTOS_ABOGADO = [
  'Cláusula de limitación de responsabilidad de la plataforma como intermediario.',
  'Exención de garantía sobre el trabajo de los profesionales.',
  'Procedimiento y plazos para la suspensión de perfiles y el derecho de descargo del profesional.',
  'Validez y alcance de la cláusula de jurisdicción de Tucumán para contratos celebrados entre usuarios de distintas provincias.',
  'Cumplimiento con la Ley de Defensa del Consumidor (Ley 24.240) y con la normativa de comercio electrónico aplicable.',
]

export default function TerminosPage(): React.ReactElement {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      ultimaActualizacion={ULTIMA_ACTUALIZACION}
      secciones={SECCIONES}
      puntosAbogado={PUNTOS_ABOGADO}
    />
  )
}
