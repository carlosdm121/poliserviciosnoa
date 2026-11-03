import Link from 'next/link'

import { Aviso } from '@/components/admin/Aviso'
import { soporteCrearTicket } from '@/app/actions/soporte'
import {
  OPCIONES_CATEGORIA,
  OPCIONES_PRIORIDAD,
} from '@/lib/soporte'
import { exigirAccesoPagina } from '@/lib/admin-auth'

export const metadata = {
  title: 'Soporte',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaSoporte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const ok = uno(sp.ok)
  const error = uno(sp.error)

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">
        Soporte y tickets
      </p>

      <h1 className="mt-2 text-title font-black uppercase">Nuevo ticket</h1>
      <p className="mt-4 text-lg leading-relaxed">
        Abrí un ticket si tenés un problema con tu cuenta, tu pago o tu perfil.
        Te respondemos por email con el número de trámite. Si no tenés cuenta
        todavía, dejanos tu nombre y email para poder responderte.
      </p>

      <div className="mt-8">
        <Aviso ok={ok || undefined} error={error || undefined} />
      </div>

      <form action={soporteCrearTicket} className="mt-6 space-y-5">
        <input type="hidden" name="ruta" value="/soporte" />

        <div>
          <label className="block mb-2 font-bold uppercase text-sm">
            Categoría
          </label>
          <select name="categoria" className="campo w-full" required>
            {OPCIONES_CATEGORIA.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-2 font-bold uppercase text-sm">
            Prioridad
          </label>
          <select name="prioridad" className="campo w-full">
            {OPCIONES_PRIORIDAD.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-2 font-bold uppercase text-sm">
            Asunto
          </label>
          <input
            name="asunto"
            className="campo w-full"
            placeholder="Por ejemplo: no recibí el código de WhatsApp"
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="block mb-2 font-bold uppercase text-sm">
            Mensaje
          </label>
          <textarea
            name="mensaje"
            rows={5}
            className="campo w-full"
            placeholder="Contanos qué te pasa y qué ya intentaste."
            required
            maxLength={3000}
          ></textarea>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block mb-2 font-bold uppercase text-sm">
              Tu nombre (opcional)
            </label>
            <input name="nombre" className="campo w-full" placeholder="Juan Pérez" />
          </div>

          <div>
            <label className="block mb-2 font-bold uppercase text-sm">
              Tu email
            </label>
            <input
              name="email"
              className="campo w-full"
              type="email"
              placeholder="tu@email.com"
              required
            />
          </div>
        </div>

        <button className="btn-oscuro px-4 py-3 text-base font-bold uppercase" type="submit">
          Abrir ticket
        </button>
      </form>

      <p className="mt-10 border-t-[3px] border-ink pt-6 text-sm text-muted">
        ¿Tenés una duda común?{' '}
        <Link href="/ayuda" className="font-bold underline">
          Mirá el centro de ayuda
        </Link>{' '}
        — tal vez ya está respondida.
      </p>
    </div>
  )
}
