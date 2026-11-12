import type { Metadata } from 'next'
import Link from 'next/link'

import {
  verificarEmailConToken,
  type EstadoVerificacion,
} from '@/lib/verificacion-email'

export const metadata: Metadata = {
  title: 'Verificar email',
  robots: { index: false, follow: false },
}

/** El token es único por request: nada de cachear la respuesta. */
export const dynamic = 'force-dynamic'

type EstadoPagina = EstadoVerificacion | 'INCOMPLETO'

const MENSAJES: Record<EstadoPagina, { titulo: string; texto: string }> = {
  VERIFICADO: {
    titulo: 'Email verificado',
    texto:
      'Tu email quedó confirmado. Ya cumplís el requisito para publicar tu servicio; el resto depende de los demás datos de tu perfil.',
  },
  YA_VERIFICADO: {
    titulo: 'Tu email ya estaba verificado',
    texto: 'No hace falta hacer nada más. Podés volver a tu panel.',
  },
  VENCIDO: {
    titulo: 'El enlace venció',
    texto: 'Los enlaces duran 24 horas. Pedí uno nuevo y revisá tu correo.',
  },
  INVALIDO: {
    titulo: 'El enlace no es válido',
    texto:
      'Puede que hayas pedido un enlace nuevo o que el link esté incompleto. Pedí uno nuevo.',
  },
  INCOMPLETO: {
    titulo: 'El enlace está incompleto',
    texto: 'Abrilo desde el botón del email, o pedí uno nuevo.',
  },
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaVerificarEmail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const token = uno(sp.token)

  const estado: EstadoPagina = token
    ? await verificarEmailConToken(token)
    : 'INCOMPLETO'

  const mensaje = MENSAJES[estado]
  const verificado = estado === 'VERIFICADO' || estado === 'YA_VERIFICADO'

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">
        Verificación de email
      </p>

      <h1 className="mt-2 text-title font-black uppercase">{mensaje.titulo}</h1>
      <p className="mt-4 text-lg leading-relaxed">{mensaje.texto}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        {verificado ? (
          <Link href="/panel" className="btn-oscuro inline-flex items-center">
            Ir a mi panel
          </Link>
        ) : (
          <Link
            href="/reenviar-verificacion"
            className="btn-oscuro inline-flex items-center"
          >
            Pedir un enlace nuevo
          </Link>
        )}

        <Link href="/soporte" className="btn-linea inline-flex items-center">
          Necesito ayuda
        </Link>
      </div>
    </div>
  )
}
