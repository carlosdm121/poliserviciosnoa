import { PaginaLegal } from '@/components/legales/PaginaLegal'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de pagos | PoliserviciosNOA',
  description:
    'Política de pagos de PoliserviciosNOA: suscripción mensual, renovación automática, aumentos con aviso previo, baja online, botón de arrepentimiento, reembolsos y facturación.',
}
export const dynamic = 'force-dynamic'

const ULTIMA_ACTUALIZACION = 'octubre de 2026'

const SECCIONES = [
  {
    titulo: '1. Suscripción mensual',
    parrafos: [
      'Para publicar tu perfil en PoliserviciosNOA necesitás una suscripción activa. El monto mensual se publica en la pantalla de suscripción y nunca se inventa: sale de la tabla de planes de la plataforma.',
      'El pago se procesa por Mercado Pago. La plataforma valida la identidad del pagador al cobrar con tarjeta, pero eso no es verificación de identidad del profesional.',
    ],
  },
  {
    titulo: '2. Renovación automática',
    parrafos: [
      'La suscripción se renueva automáticamente cada mes. Se te avisa antes de cada cobro.',
      'Si un pago se rechaza, tu perfil sigue publicado durante un período de gracia corto. Si el pago no se regulariza, el perfil se despublica hasta que se pague.',
    ],
  },
  {
    titulo: '3. Aumentos de precio con aviso previo',
    parrafos: [
      'Si sube el precio de la suscripción, te avisamos por email con al menos 30 días de anticipación, indicando el nuevo monto, la fecha en que empieza a regir y cómo cancelar si no estás de acuerdo.',
      'Nadie es cobrado un monto nuevo sin haber recibido el aviso con la anticipación establecida.',
    ],
  },
  {
    titulo: '4. Baja online',
    parrafos: [
      'Podés darte de baja en cualquier momento desde tu panel, sin pedir motivo y en no más de dos pasos.',
      'La baja cancela la renovación, pero seguís visible hasta que termine el mes que ya pagaste.',
    ],
  },
  {
    titulo: '5. Botón de arrepentimiento',
    parrafos: [
      'Si te arrepentís de la contratación dentro de los 10 días corridos desde el pago, podés pedir el reembolso del último pago y la baja de tu suscripción.',
      'El reembolso se procesa por Mercado Pago y tu perfil se despublica. Queda una constancia del trámite que podés consultar después.',
    ],
  },
  {
    titulo: '6. Reembolsos',
    parrafos: [
      'Un pago ya reembolsado no se vuelve a devolver. Si reclamás un reembolso sobre un pago ya devuelto, se te informa la constancia existente.',
      'Los reembolsos del botón de arrepentimiento se procesan con prioridad dentro del plazo de 10 días.',
    ],
  },
  {
    titulo: '7. Facturación',
    parrafos: [
      'Por cada pago aprobado se emite un comprobante electrónico (factura A, B o C) ante ARCA (ex AFIP).',
      'Los datos fiscales se cargan antes del primer pago y se congelan en el comprobante: si después cambian tus datos, la factura ya emitida imprime lo que se autorizó, no lo nuevo.',
      'Podés descargar tus comprobantes desde tu panel. Si hubo un reembolso, se emite una nota de crédito que anula la factura correspondiente.',
    ],
  },
]

const PUNTOS_ABOGADO = [
  'Cláusula de renovación automática y mecanismo de notificación previa al cobro (cumplimiento con la normativa de pagos recurrentes y comercio electrónico).',
  'Procedimiento del botón de arrepentimiento dentro de los 10 días (art. 34 de la Ley 24.240): plazos, forma de ejercicio y efectos sobre la suscripción.',
  'Reglamento de facturación electrónica ante ARCA: tipo de comprobante, condiciones frente al IVA y conservación de comprobantes.',
  'Comisión de Mercado Pago y cómo se informa al usuario el monto total a pagar antes de confirmar.',
  'Plazo de conservación de facturas y registros de pago conforme a la normativa fiscal.',
]

export default function PoliticaDePagosPage(): React.ReactElement {
  return (
    <PaginaLegal
      titulo="Política de pagos"
      ultimaActualizacion={ULTIMA_ACTUALIZACION}
      secciones={SECCIONES}
      puntosAbogado={PUNTOS_ABOGADO}
    />
  )
}
