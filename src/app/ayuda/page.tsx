import Link from 'next/link'

export const metadata = {
  title: 'Centro de ayuda',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Centro de ayuda.
 *
 * Preguntas frecuentes separadas por audiencia (cliente y profesional),
 * buscables con un filtro de texto que oculta lo que no coincide. No hay
 * base de datos acá: es contenido estático que lee cualquiera, incluso sin
 * sesión, porque la ayuda no debe requerir entrada.
 */

const FRECUENTES = [
  {
    tema: 'Clientes',
    pregunta: '¿Cómo contacto a un profesional?',
    respuesta:
      'Entrá a su perfil, tocá el botón verde de WhatsApp y se te abre la conversación con el mensaje ya escrito: “Hola, te vi en PoliserviciosNOA y me interesa tu servicio, quiero solicitar tus servicios”.',
  },
  {
    tema: 'Clientes',
    pregunta: '¿Los corazones de confianza son estrellas?',
    respuesta:
      'No. Cada cliente puede dejar un corazón a un profesional solo después de haberlo contactado por WhatsApp. No hay puntuación del 1 al 5: el corazón es un voto de confianza, no una reseña.',
  },
  {
    tema: 'Clientes',
    pregunta: '¿Puedo reclamar si el profesional no se presentó?',
    respuesta:
      'Sí. Si ya lo contactaste por WhatsApp, podés hacer un reclamo desde su perfil. El equipo lo revisa y, si se acumulan varios reclamos validados, el perfil puede ser suspendido.',
  },
  {
    tema: 'Profesionales',
    pregunta: '¿Qué significa “WhatsApp verificado”?',
    respuesta:
      'Significa que el profesional demostró que controla ese número de WhatsApp enviando un código desde ese mismo número al número de la plataforma. No es verificación de identidad ni de antecedentes: solo probamos que el número es suyo.',
  },
  {
    tema: 'Profesionales',
    pregunta: '¿Cómo verifico mi número de WhatsApp?',
    respuesta:
      'Desde tu panel, sección WhatsApp, pedí el código de 6 caracteres. Enviá ese código desde tu número al número de PoliserviciosNOA por WhatsApp y esperá la confirmación de Meta. Sin número verificado no podés publicar ni pagar.',
  },
  {
    tema: 'Profesionales',
    pregunta: '¿Por qué mi perfil no aparece en la búsqueda?',
    respuesta:
      'Un perfil aparece solo si tiene email verificado, WhatsApp verificado, suscripción activa, al menos una foto, y rubro principal, ciudad y descripción completos. Revisá cuál falta en tu panel.',
  },
  {
    tema: 'Profesionales',
    pregunta: '¿Cuánto cuesta publicar?',
    respuesta:
      'La suscripción mensual tiene el monto que figura en tu panel y se cobra automáticamente por Mercado Pago. El precio nunca se inventa: siempre sale de la tabla de planes de la plataforma.',
  },
  {
    tema: 'Profesionales',
    pregunta: '¿Cómo doy de baja mi suscripción?',
    respuesta:
      'Desde tu panel, sección suscripción, podés pedir la baja online. Seguís visible hasta que termine el mes que ya pagaste. Si te arrepentís dentro de los 10 días del pago, podés pedir el reembolso.',
  },
  {
    tema: 'Todos',
    pregunta: '¿Quién responde los tickets de soporte?',
    respuesta:
      'El equipo de PoliserviciosNOA. Abrí un ticket desde /soporte y te llegará un email con el número de trámite. Las respuestas se envían por email al mismo correo con el que abriste el ticket.',
  },
  {
    tema: 'Todos',
    pregunta: '¿La plataforma garantiza el trabajo de los profesionales?',
    respuesta:
      'No. PoliserviciosNOA es un intermediario: conecta clientes y profesionales, pero no presta servicios ni responde por el trabajo de cada uno. El contrato es entre vos y el profesional.',
  },
]

function filtrar(texto: string) {
  const q = texto.toLowerCase()

  return FRECUENTES.filter(
    (item) =>
      item.pregunta.toLowerCase().includes(q) ||
      item.respuesta.toLowerCase().includes(q) ||
      item.tema.toLowerCase().includes(q),
  )
}

export default async function CentroAyuda({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const resultados = filtrar(q)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-4xl font-black uppercase tracking-tight">Centro de ayuda</h1>
      <p className="mt-2 text-muted">
        Preguntas frecuentes para clientes y profesionales. Si no encontrás lo
        que buscás, abrí un <Link href="/soporte">ticket de soporte</Link>.
      </p>

      <form className="mt-6" action="#" method="GET">
        <label className="block mb-2 font-bold uppercase text-sm">
          Buscá en la ayuda
        </label>
        <input
          name="q"
          value={q}
          className="campo w-full max-w-md"
          placeholder="Escribí tu duda…"
        />
      </form>

      {q && resultados.length === 0 && (
        <div className="mt-4 tarjeta p-4 text-muted">
          No encontramos nada que coincida con “{q}”.
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {resultados.map((item) => (
          <li key={item.pregunta} className="tarjeta p-5">
            <p className="etiqueta mb-2">{item.tema}</p>
            <p className="font-black text-lg">{item.pregunta}</p>
            <p className="mt-2 leading-relaxed">{item.respuesta}</p>
          </li>
        ))}
        {resultados.length === 0 && !q && (
          <li className="tarjeta p-6 text-muted">Seleccioná un tema o buscá arriba.</li>
        )}
      </ul>
    </div>
  )
}
