import type { Metadata } from 'next'

import { FormularioReclamo } from '@/components/reclamos/FormularioReclamo'
import { NOMBRE_PAGINA } from '@/lib/constantes'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Libro de quejas',
  description:
    'Registrá un reclamo sobre el servicio. También podés denunciar ante Defensa del Consumidor de Tucumán.',
}

/**
 * Libro de quejas.
 *
 * Sin sesión: quien reclama puede ser alguien que ya no puede entrar a su
 * cuenta. El formulario guarda el reclamo y avisa por email a la casilla del
 * proveedor; al lado están los datos de la autoridad de aplicación para que
 * nadie dependa de que le contestemos nosotros.
 */
export default function PaginaLibroDeQuejas(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Libro de quejas</h1>
        <p className="mt-3 max-w-prose text-lg leading-relaxed">
          Si algo no funcionó, escribilo acá. Queda registrado con un número de trámite y te
          respondemos al email que dejes.
        </p>
      </header>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-xl font-black uppercase">Registrar un reclamo</h2>
          <p className="mt-2 leading-relaxed">
            No hace falta tener sesión. Los campos marcados son obligatorios.
          </p>
          <div className="mt-6">
            <FormularioReclamo />
          </div>
        </section>

        <section className="tarjeta p-6">
          <h2 className="text-xl font-black uppercase">Datos del proveedor</h2>
          <dl className="mt-4 space-y-2 leading-relaxed">
            <div>
              <dt className="inline font-bold">Responsable: </dt>
              <dd className="inline">{NOMBRE_PAGINA}</dd>
            </div>
            <div>
              <dt className="inline font-bold">Domicilio: </dt>
              <dd className="inline">San Miguel de Tucumán, Tucumán, Argentina</dd>
            </div>
            <div>
              <dt className="inline font-bold">Email: </dt>
              <dd className="inline">
                <a
                  href={`mailto:${env.contactEmail}`}
                  className="font-bold underline underline-offset-2"
                >
                  {env.contactEmail}
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <section className="tarjeta p-6">
          <h2 className="text-xl font-black uppercase">Defensa del Consumidor</h2>
          <p className="mt-3 leading-relaxed">
            Si no quedás conforme con nuestra respuesta, o preferís reclamar directamente ante el
            organismo oficial, podés hacerlo en la Dirección de Comercio Interior de Tucumán.
          </p>

          <dl className="mt-4 space-y-2 leading-relaxed">
            <div>
              <dt className="inline font-bold">Dirección: </dt>
              <dd className="inline">9 de Julio 497, San Miguel de Tucumán</dd>
            </div>
            <div>
              <dt className="inline font-bold">Teléfono: </dt>
              <dd className="inline">(0381) 452-5080 / 452-5081</dd>
            </div>
            <div>
              <dt className="inline font-bold">Email: </dt>
              <dd className="inline">
                <a
                  href="mailto:info@defensadelconsumidortucuman.gob.ar"
                  className="font-bold underline underline-offset-2"
                >
                  info@defensadelconsumidortucuman.gob.ar
                </a>
              </dd>
            </div>
            <div>
              <dt className="inline font-bold">Horario: </dt>
              <dd className="inline">lunes a viernes de 8:00 a 13:00</dd>
            </div>
          </dl>

          <a
            href="https://defensadelconsumidortucuman.gob.ar/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-linea mt-6 inline-flex items-center"
          >
            Ir al sitio oficial
          </a>
        </section>
      </div>
    </div>
  )
}
