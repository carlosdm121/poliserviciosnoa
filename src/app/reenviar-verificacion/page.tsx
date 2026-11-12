import type { Metadata } from 'next'
import Link from 'next/link'

import { reenviarVerificacion } from '@/app/actions/verificacion-email'
import { Aviso } from '@/components/admin/Aviso'

export const metadata: Metadata = {
  title: 'Reenviar verificación',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaReenviarVerificacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">
        Verificación de email
      </p>

      <h1 className="mt-2 text-title font-black uppercase">Reenviar el enlace</h1>
      <p className="mt-4 text-lg leading-relaxed">
        Escribí el email con el que te registraste y te mandamos un enlace
        nuevo. El anterior deja de funcionar.
      </p>

      <div className="mt-8">
        <Aviso ok={uno(sp.ok) || undefined} error={uno(sp.error) || undefined} />
      </div>

      <form action={reenviarVerificacion} className="mt-6 space-y-5">
        <div>
          <label className="block mb-2 font-bold uppercase text-sm" htmlFor="email">
            Tu email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className="campo w-full"
            placeholder="tu@email.com"
            required
          />
        </div>

        <button
          className="btn-oscuro px-4 py-3 text-base font-bold uppercase"
          type="submit"
        >
          Mandarme el enlace
        </button>
      </form>

      <p className="mt-10 border-t-[3px] border-ink pt-6 text-sm text-muted">
        ¿Ya lo verificaste y no podés entrar?{' '}
        <Link href="/soporte" className="font-bold underline">
          Escribinos
        </Link>
        .
      </p>
    </div>
  )
}
