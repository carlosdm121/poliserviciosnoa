import { PaginaLegal } from '@/components/legales/PaginaLegal'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacidad | PoliserviciosNOA',
  description:
    'Política de privacidad de PoliserviciosNOA: qué datos tratamos, con qué finalidad, quiénes los tratan y cómo ejercer tus derechos bajo la Ley 25.326.',
}
export const dynamic = 'force-dynamic'

const ULTIMA_ACTUALIZACION = 'octubre de 2026'

const SECCIONES = [
  {
    titulo: '1. Responsable del tratamiento',
    parrafos: [
      'PoliserviciosNOA es responsable del tratamiento de los datos personales que recopila a través de la plataforma, de acuerdo con la Ley 25.326 de Protección de Datos Personales de la Argentina.',
      'La base de datos de la plataforma está inscripta ante la Agencia de Acceso a la Información Pública (AAIP), como exige la ley.',
    ],
  },
  {
    titulo: '2. Datos que tratamos',
    parrafos: [
      'Tratamos los datos que nos proporcionás al registrarte y usar la plataforma: correo electrónico, nombre, número de WhatsApp (en texto claro y como hash), ciudad de cobertura, descripción del servicio, imágenes de la galería, datos fiscales (nombre, CUIT/CUIL/DNI, condición frente al IVA y domicilio fiscal), contactos realizados y votos de confianza.',
      'Datos fiscales como el CUIT se necesitan para emitir comprobantes de pago. No se usan para decidir si publicás ni se muestran públicamente.',
      'La única insignia pública es “WhatsApp verificado”. Nunca se muestra “identidad verificada”.',
    ],
  },
  {
    titulo: '3. Qué NO tratamos',
    parrafos: [
      'No tratamos datos biométricos ni pedimos documentos de identidad (DNI, cédula, pasaporte) ni reconocimiento facial.',
      'No guardamos la dirección IP de los visitantes como dato personal: solo se usa hasheada y en memoria para el rate limiting, sin persistir.',
    ],
  },
  {
    titulo: '4. Finalidades del tratamiento',
    parrafos: [
      'Permitir que los clientes encuentren profesionales y los contacten directo por WhatsApp.',
      'Emitir comprobantes de pago y facturas electrónicas por la suscripción mensual.',
      'Enviar emails transaccionales (confirmación de cuenta, verificación, avisos de vencimiento, recibos de pago).',
      'Detectar fraudes y bloquear números o correos asociados a abusos.',
      'Gestionar reclamos, tickets de soporte y el ejercicio de derechos (acceso, rectificación y supresión).',
    ],
  },
  {
    titulo: '5. Proveedores externos y transferencia internacional',
    parrafos: [
      'Usamos proveedores externos para operar la plataforma. Algunos de ellos pueden tratar datos fuera de la Argentina (transferencia internacional):',
    ],
  },
  {
    titulo: '6. Plazos de conservación',
    parrafos: [
      'Los datos se conservan mientras sea necesario para la finalidad para la que se recopilaron y para cumplir con obligaciones fiscales y legales.',
      'Facturas y registros de pago se conservan por el plazo fiscal que exige la ley.',
      'Documentos de empresa y evidencias de reclamos se borran al resolver la revisión. Señales de IP y verificaciones de WhatsApp vencidas se eliminan a los 30 días.',
      'Al pedir la supresión de tu cuenta, tus datos personales se anonimizan o borran, salvo lo que la ley obliga a conservar (facturas, pagos).',
    ],
  },
  {
    titulo: '7. Tus derechos (Ley 25.326)',
    parrafos: [
      'Tenés derecho a acceder a tus datos, solicitar su rectificación si son inexactos o incompletos, y pedir su supresión cuando ya no sean necesarios.',
      'Podés ejercer estos derechos desde tu panel, en la sección “Mis datos”, o enviándonos un email. Te responderemos en el plazo que establece la ley.',
    ],
  },
]

const PUNTOS_ABOGADO = [
  'Identificar con precisión cada proveedor externo y el país donde trata los datos (Mercado Pago, Cloudinary, Resend, Meta/WhatsApp Cloud API, Vercel, base de datos, Upstash).',
  'Redactar la cláusula de transferencia internacional de datos y el mecanismo de transferencia que aplica a cada proveedor.',
  'Confirmar el plazo fiscal de conservación de facturas y pagos con el contador.',
  'Validar el procedimiento y los plazos para ejercer los derechos de acceso, rectificación y supresión ante la AAIP.',
  'Revisar que el texto no afirme verificación de identidad en ningún punto (coherencia con la decisión D1).',
]

export default function PrivacidadPage(): React.ReactElement {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      ultimaActualizacion={ULTIMA_ACTUALIZACION}
      secciones={SECCIONES}
      puntosAbogado={PUNTOS_ABOGADO}
    />
  )
}
