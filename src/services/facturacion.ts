import {
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  type CondicionIva,
  type TipoComprobante,
} from '@prisma/client'

import {
  ErrorFacturacion,
  getProveedorFacturacion,
  type TipoComprobanteLetra,
} from '@/lib/arca'
import {
  desglosarImporte,
  etiquetaCondicionIva,
  esperaBackoff,
  formatearCsv,
  importeCsv,
  rangoDelMes,
} from '@/lib/arca/calculos'
import { generarPdfComprobante } from '@/lib/arca/pdf'
import { aNumero } from '@/lib/dinero'
import { enviarEmailFactura } from '@/lib/email'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Facturación electrónica.
 *
 * **La base es la cola.** No hay Redis ni un servicio de jobs: el proyecto no
 * paga infraestructura extra y un comprobante puede esperar. Cada factura nace
 * con `status`, `attempts` y `nextAttemptAt`; un endpoint de cron levanta las
 * vencidas y el admin puede reintentar a mano. Es menos elegante que una cola
 * real y es lo que un cliente PyME puede mantener y pagar.
 *
 * Las tres reglas que ordenan el archivo:
 *
 * 1. **Una factura por pago, siempre.** `Invoice.paymentId` es único. Un webhook
 *    repetido encuentra la fila y no emite de nuevo.
 * 2. **La emisión nunca tumba el cobro.** El webhook encola y sigue; si ARCA
 *    está caído, la suscripción queda activa y la factura queda en FAILED.
 * 3. **El número se reserva antes de llamar.** Si el proceso muere después de
 *    que ARCA autorizó, el reintento usa el mismo número. El peor caso es
 *    "comprobante ya existe", que el proveedor real resuelve consultando el CAE.
 */

/**
 * Número máximo de facturas/notas que procesa una corrida del cron.
 *
 * Son 3 y no 10 porque cada emisión puede tardar hasta 15 s (timeout del
 * proveedor) y la función de Vercel corta a los 60 s. Con 3 el peor caso entra
 * con margen; lo que sobra queda para la corrida siguiente.
 */
const LOTE_CRON = 3

// ---------------------------------------------------------------------------
// Emisión
// ---------------------------------------------------------------------------

/**
 * Registra la factura de un pago aprobado y, si se puede, la emite en el acto.
 *
 * Se llama desde el webhook. No tira nunca: el pago ya está guardado y la
 * suscripción ya cambió, así que un fallo de facturación no puede convertir la
 * notificación en un 500 y hacer que Mercado Pago reintente un cobro que ya se
 * procesó.
 */
export async function encolarFacturaSeguro(mpPaymentId: string): Promise<void> {
  const resultado = await encolarFactura(mpPaymentId)

  if (!resultado.ok) {
    logger.warn('facturación: no se pudo encolar la factura', {
      mpPaymentId,
      error: resultado.error,
    })
  }
}

/**
 * Encola (y procesa) la factura de un pago aprobado.
 *
 * Idempotente: si el pago ya tiene factura, devuelve la existente sin emitir.
 */
export async function encolarFactura(
  mpPaymentId: string,
): Promise<Resultado<{ invoiceId: string; estado: InvoiceStatus }>> {
  const pago = await prisma.payment.findUnique({
    where: { mpPaymentId },
    select: {
      id: true,
      mpPaymentId: true,
      amount: true,
      status: true,
      paidAt: true,
      subscription: {
        select: {
          profile: {
            select: {
              name: true,
              user: { select: { name: true } },
              fiscalData: {
                select: {
                  nombreORazonSocial: true,
                  documento: true,
                  condicionIva: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!pago) {
    return err('No encontramos el pago a facturar.', ERROR_CODES.NO_ENCONTRADO)
  }

  const existente = await prisma.invoice.findUnique({
    where: { paymentId: pago.id },
    select: { id: true, status: true },
  })

  if (existente) {
    return ok({ invoiceId: existente.id, estado: existente.status })
  }

  if (pago.status !== PaymentStatus.APPROVED) {
    return err('Solo se factura un pago aprobado.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const total = aNumero(pago.amount)
  const tipoComprobante = env.arca.tipoComprobante as TipoComprobante
  const { neto, iva } = desglosarImporte(total, tipoComprobante, env.arca.alicuotaIva)

  const fiscal = pago.subscription.profile.fiscalData
  const receptorNombre =
    fiscal?.nombreORazonSocial ??
    pago.subscription.profile.user.name ??
    pago.subscription.profile.name

  let creada: { id: string; status: InvoiceStatus }

  try {
    creada = await prisma.invoice.create({
      data: {
        paymentId: pago.id,
        tipoComprobante,
        puntoVenta: env.arca.puntoVenta,
        fecha: pago.paidAt ?? new Date(),
        neto: new Prisma.Decimal(neto),
        iva: new Prisma.Decimal(iva),
        total: new Prisma.Decimal(total),
        receptorNombre,
        receptorDocumento: fiscal?.documento ?? null,
        receptorCondicionIva: (fiscal?.condicionIva ?? null) as CondicionIva | null,
        descripcion: env.arca.descripcion,
        cuitEmisor: env.arca.cuit || null,
      },
      select: { id: true, status: true },
    })
  } catch (error: unknown) {
    /**
     * Dos webhooks simultáneos pueden pasar los dos por el `findUnique` de
     * arriba. El índice único de `paymentId` decide el ganador; el otro usa la
     * fila que ganó. No es un error, es la idempotencia funcionando.
     */
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const ganadora = await prisma.invoice.findUnique({
        where: { paymentId: pago.id },
        select: { id: true, status: true },
      })

      if (ganadora) return ok({ invoiceId: ganadora.id, estado: ganadora.status })
    }

    logger.error('facturación: no se pudo crear la factura', {
      mpPaymentId,
      error,
    })

    return err('No pudimos registrar la factura.', ERROR_CODES.DESCONOCIDO)
  }

  await procesarFacturaSeguro(creada.id)

  const final = await prisma.invoice.findUnique({
    where: { id: creada.id },
    select: { status: true },
  })

  return ok({ invoiceId: creada.id, estado: final?.status ?? creada.status })
}

/** Procesa una factura sin propagar el error. Para webhook y cron. */
async function procesarFacturaSeguro(invoiceId: string): Promise<void> {
  const resultado = await procesarFactura(invoiceId)

  if (!resultado.ok) {
    logger.warn('facturación: la factura quedó pendiente', {
      invoiceId,
      error: resultado.error,
    })
  }
}

/**
 * Emite una factura de la cola.
 *
 * El orden importa: primero se "reclama" la fila con un `updateMany` condicional
 * (así dos procesos no emiten la misma), después se reserva el número, después
 * se llama a ARCA y recién al final se guarda el CAE.
 */
export async function procesarFactura(invoiceId: string): Promise<Resultado<InvoiceStatus>> {
  const ahora = new Date()

  const reclamada = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: ahora } }],
    },
    data: {
      status: InvoiceStatus.PENDING,
      attempts: { increment: 1 },
      lastError: null,
    },
  })

  if (reclamada.count === 0) {
    const actual = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    })

    if (!actual) return err('No encontramos la factura.', ERROR_CODES.NO_ENCONTRADO)

    return ok(actual.status)
  }

  const factura = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      tipoComprobante: true,
      puntoVenta: true,
      numero: true,
      fecha: true,
      neto: true,
      iva: true,
      total: true,
      descripcion: true,
      attempts: true,
      receptorNombre: true,
      receptorDocumento: true,
      receptorCondicionIva: true,
    },
  })

  if (!factura) return err('No encontramos la factura.', ERROR_CODES.NO_ENCONTRADO)

  try {
    const proveedor = getProveedorFacturacion()

    const numero = factura.numero ?? (await reservarNumero(factura))

    const emitida = await proveedor.emitirFactura({
      referencia: factura.id,
      fecha: factura.fecha,
      tipoComprobante: factura.tipoComprobante as TipoComprobanteLetra,
      puntoVenta: factura.puntoVenta,
      numero,
      neto: aNumero(factura.neto),
      iva: aNumero(factura.iva),
      total: aNumero(factura.total),
      descripcion: factura.descripcion,
      receptor: {
        nombre: factura.receptorNombre,
        documento: factura.receptorDocumento,
        condicionIva: factura.receptorCondicionIva,
      },
    })

    await prisma.invoice.update({
      where: { id: factura.id },
      data: {
        status: InvoiceStatus.ISSUED,
        numero: emitida.numero,
        cae: emitida.cae,
        caeVence: emitida.caeVence,
        issuedAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
        pdfUrl: `/api/facturas/${factura.id}/pdf`,
      },
    })

    logger.info('facturación: comprobante emitido', {
      invoiceId: factura.id,
      numero: emitida.numero,
      puntoVenta: emitida.puntoVenta,
      proveedor: proveedor.nombre,
    })

    await enviarFacturaPorEmailSeguro(factura.id)

    return ok(InvoiceStatus.ISSUED)
  } catch (error: unknown) {
    return await marcarFallo(factura, error)
  }
}

/** Reserva el próximo número y lo persiste antes de llamar a ARCA. */
async function reservarNumero(factura: {
  id: string
  tipoComprobante: TipoComprobante
  puntoVenta: number
  numero: number | null
}): Promise<number> {
  if (factura.numero !== null) return factura.numero

  const proveedor = getProveedorFacturacion()
  const ultimo = await proveedor.ultimoNumero(
    factura.tipoComprobante as TipoComprobanteLetra,
    factura.puntoVenta,
  )
  const numero = ultimo + 1

  await prisma.invoice.updateMany({
    where: { id: factura.id, numero: null },
    data: { numero },
  })

  const guardada = await prisma.invoice.findUnique({
    where: { id: factura.id },
    select: { numero: true },
  })

  return guardada?.numero ?? numero
}

/** Deja la factura en FAILED con backoff, o lista para revisión manual. */
async function marcarFallo(
  factura: { id: string; attempts: number },
  error: unknown,
): Promise<Resultado<InvoiceStatus>> {
  const esErrorConocido = error instanceof ErrorFacturacion
  const mensaje = error instanceof Error ? error.message : 'Error desconocido al facturar'
  const reintentable = esErrorConocido ? error.reintentable : true
  const agotado = factura.attempts >= env.arca.maxAttempts

  /**
   * Un error no reintentable (credencial faltante, CUIT inválido) deja
   * `nextAttemptAt` en `null`. Eso no significa "pendiente": el cron solo toma
   * `FAILED` con fecha, así que la fila queda esperando que un humano la mire.
   */
  const nextAttemptAt =
    reintentable && !agotado
      ? new Date(Date.now() + esperaBackoff(factura.attempts))
      : null

  await prisma.invoice.update({
    where: { id: factura.id },
    data: {
      status: InvoiceStatus.FAILED,
      lastError: mensaje.slice(0, 500),
      nextAttemptAt,
    },
  })

  logger.error('facturación: falló la emisión', {
    invoiceId: factura.id,
    intento: factura.attempts,
    reintentable,
    agotado,
    error: mensaje,
  })

  if (!reintentable) {
    return err(
      'La factura necesita revisión manual: revisá la configuración fiscal en el panel de administración.',
      ERROR_CODES.ERROR_EXTERNO,
    )
  }

  return err(
    agotado
      ? 'La factura agotó los reintentos automáticos. Revisala desde el panel de administración.'
      : 'No pudimos emitir la factura. Se va a reintentar.',
    ERROR_CODES.ERROR_EXTERNO,
  )
}

/**
 * Reintenta una factura a mano desde `/admin`.
 *
 * Reinicia el contador de intentos: el admin ya miró el error, lo corrigió
 * (una credencial, un CUIT, un punto de venta) y merece un ciclo completo de
 * backoff, no el que quedó agotado del ciclo anterior.
 */
export async function reintentarFactura(
  invoiceId: string,
): Promise<Resultado<InvoiceStatus>> {
  const actualizada = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
    data: {
      status: InvoiceStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  })

  if (actualizada.count === 0) {
    return err('La factura ya está emitida o anulada.', ERROR_CODES.ESTADO_INVALIDO)
  }

  return procesarFactura(invoiceId)
}

// ---------------------------------------------------------------------------
// Notas de crédito
// ---------------------------------------------------------------------------

/**
 * Registra el pedido de nota de crédito de un reembolso o contracargo.
 *
 * No emite en el acto necesariamente: crea la fila (idempotente por
 * `invoiceId` único) y la procesa. Si el pago nunca tuvo factura, no hay nada
 * que anular y no se crea nada. Si Mercado Pago manda el evento dos veces, la
 * segunda choca contra el índice único y no duplica el comprobante fiscal.
 */
export async function solicitarNotaDeCredito(params: {
  mpPaymentId: string
  motivo: 'reembolso' | 'contracargo'
}): Promise<void> {
  const pago = await prisma.payment.findUnique({
    where: { mpPaymentId: params.mpPaymentId },
    select: {
      id: true,
      invoice: {
        select: {
          id: true,
          status: true,
          tipoComprobante: true,
          puntoVenta: true,
          neto: true,
          iva: true,
          total: true,
          creditNote: { select: { id: true } },
        },
      },
    },
  })

  if (!pago?.invoice) {
    logger.info('facturación: reembolso sin factura, no hay nada que anular', {
      mpPaymentId: params.mpPaymentId,
    })
    return
  }

  if (pago.invoice.status !== InvoiceStatus.ISSUED || pago.invoice.creditNote) {
    logger.info('facturación: la factura ya no admite nota de crédito', {
      mpPaymentId: params.mpPaymentId,
      invoiceId: pago.invoice.id,
      status: pago.invoice.status,
    })
    return
  }

  let notaId: string

  try {
    const creada = await prisma.creditNote.create({
      data: {
        invoiceId: pago.invoice.id,
        mpPaymentId: pago.id,
        motivo: params.motivo === 'reembolso' ? 'Reembolso' : 'Contracargo',
        tipoComprobante: pago.invoice.tipoComprobante,
        puntoVenta: pago.invoice.puntoVenta,
        fecha: new Date(),
        neto: pago.invoice.neto,
        iva: pago.invoice.iva,
        total: pago.invoice.total,
      },
      select: { id: true },
    })

    notaId = creada.id
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return
    }

    logger.error('facturación: no se pudo registrar la nota de crédito', {
      mpPaymentId: params.mpPaymentId,
      invoiceId: pago.invoice.id,
      error,
    })
    return
  }

  await procesarNotaDeCreditoSeguro(notaId)
}

async function procesarNotaDeCreditoSeguro(creditNoteId: string): Promise<void> {
  const resultado = await procesarNotaDeCredito(creditNoteId)

  if (!resultado.ok) {
    logger.warn('facturación: la nota de crédito quedó pendiente', {
      creditNoteId,
      error: resultado.error,
    })
  }
}

/** Emite una nota de crédito de la cola y marca la factura como anulada. */
export async function procesarNotaDeCredito(
  creditNoteId: string,
): Promise<Resultado<InvoiceStatus>> {
  const ahora = new Date()

  const reclamada = await prisma.creditNote.updateMany({
    where: {
      id: creditNoteId,
      status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: ahora } }],
    },
    data: {
      status: InvoiceStatus.PENDING,
      attempts: { increment: 1 },
      lastError: null,
    },
  })

  if (reclamada.count === 0) {
    const actual = await prisma.creditNote.findUnique({
      where: { id: creditNoteId },
      select: { status: true },
    })

    if (!actual) return err('No encontramos la nota de crédito.', ERROR_CODES.NO_ENCONTRADO)

    return ok(actual.status)
  }

  const nota = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    select: {
      id: true,
      tipoComprobante: true,
      puntoVenta: true,
      numero: true,
      fecha: true,
      neto: true,
      iva: true,
      total: true,
      motivo: true,
      attempts: true,
      invoice: {
        select: {
          id: true,
          numero: true,
          puntoVenta: true,
          tipoComprobante: true,
          cae: true,
          descripcion: true,
          receptorNombre: true,
          receptorDocumento: true,
          receptorCondicionIva: true,
        },
      },
    },
  })

  if (!nota) return err('No encontramos la nota de crédito.', ERROR_CODES.NO_ENCONTRADO)

  try {
    if (
      nota.invoice.numero === null ||
      nota.invoice.cae === null ||
      nota.invoice.numero === undefined
    ) {
      throw new ErrorFacturacion('La factura original no tiene número o CAE para asociar.', {
        codigo: 'FACTURA_INCOMPLETA',
        reintentable: false,
      })
    }

    const proveedor = getProveedorFacturacion()
    const tipo = nota.tipoComprobante as TipoComprobanteLetra

    const numero = nota.numero ?? (await reservarNumeroNota(nota))

    const emitida = await proveedor.anularFactura({
      referencia: nota.id,
      fecha: nota.fecha,
      tipoComprobante: tipo,
      puntoVenta: nota.puntoVenta,
      numero,
      neto: aNumero(nota.neto),
      iva: aNumero(nota.iva),
      total: aNumero(nota.total),
      descripcion: `Anulación: ${nota.motivo}`,
      receptor: {
        nombre: nota.invoice.receptorNombre,
        documento: nota.invoice.receptorDocumento,
        condicionIva: nota.invoice.receptorCondicionIva,
      },
      motivo: nota.motivo,
      factura: {
        numero: nota.invoice.numero,
        puntoVenta: nota.invoice.puntoVenta,
        tipoComprobante: nota.invoice.tipoComprobante as TipoComprobanteLetra,
        cae: nota.invoice.cae,
      },
    })

    await prisma.$transaction([
      prisma.creditNote.update({
        where: { id: nota.id },
        data: {
          status: InvoiceStatus.ISSUED,
          numero: emitida.numero,
          cae: emitida.cae,
          caeVence: emitida.caeVence,
          issuedAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      prisma.invoice.update({
        where: { id: nota.invoice.id },
        data: { status: InvoiceStatus.VOIDED, voidedAt: new Date() },
      }),
    ])

    logger.info('facturación: nota de crédito emitida', {
      creditNoteId: nota.id,
      invoiceId: nota.invoice.id,
      numero: emitida.numero,
    })

    return ok(InvoiceStatus.ISSUED)
  } catch (error: unknown) {
    const esErrorConocido = error instanceof ErrorFacturacion
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al anular'
    const reintentable = esErrorConocido ? error.reintentable : true
    const agotado = nota.attempts >= env.arca.maxAttempts

    await prisma.creditNote.update({
      where: { id: nota.id },
      data: {
        status: InvoiceStatus.FAILED,
        lastError: mensaje.slice(0, 500),
        nextAttemptAt:
          reintentable && !agotado
            ? new Date(Date.now() + esperaBackoff(nota.attempts))
            : null,
      },
    })

    logger.error('facturación: falló la nota de crédito', {
      creditNoteId: nota.id,
      intento: nota.attempts,
      reintentable,
      agotado,
      error: mensaje,
    })

    return err('No pudimos emitir la nota de crédito.', ERROR_CODES.ERROR_EXTERNO)
  }
}

async function reservarNumeroNota(nota: {
  id: string
  tipoComprobante: TipoComprobante
  puntoVenta: number
  numero: number | null
}): Promise<number> {
  if (nota.numero !== null) return nota.numero

  const proveedor = getProveedorFacturacion()
  const ultimo = await proveedor.ultimoNumero(
    nota.tipoComprobante as TipoComprobanteLetra,
    nota.puntoVenta,
    true,
  )
  const numero = ultimo + 1

  await prisma.creditNote.updateMany({
    where: { id: nota.id, numero: null },
    data: { numero },
  })

  const guardada = await prisma.creditNote.findUnique({
    where: { id: nota.id },
    select: { numero: true },
  })

  return guardada?.numero ?? numero
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/** Procesa las facturas y notas vencidas. Lo llama el endpoint de cron. */
export async function procesarPendientes(limite = LOTE_CRON): Promise<{
  facturas: { procesadas: number; emitidas: number }
  notas: { procesadas: number; emitidas: number }
}> {
  const ahora = new Date()

  const facturas = await prisma.invoice.findMany({
    where: {
      attempts: { lt: env.arca.maxAttempts },
      OR: [
        // Nunca se procesó: el proceso anterior se cayó antes de intentarlo.
        { status: InvoiceStatus.PENDING, nextAttemptAt: null },
        // Falló y el backoff ya venció.
        { status: InvoiceStatus.FAILED, nextAttemptAt: { lte: ahora } },
      ],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: limite,
    select: { id: true },
  })

  let facturasEmitidas = 0

  for (const factura of facturas) {
    const resultado = await procesarFactura(factura.id)
    if (resultado.ok && resultado.data === InvoiceStatus.ISSUED) facturasEmitidas += 1
  }

  const notas = await prisma.creditNote.findMany({
    where: {
      attempts: { lt: env.arca.maxAttempts },
      OR: [
        { status: InvoiceStatus.PENDING, nextAttemptAt: null },
        { status: InvoiceStatus.FAILED, nextAttemptAt: { lte: ahora } },
      ],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: limite,
    select: { id: true },
  })

  let notasEmitidas = 0

  for (const nota of notas) {
    const resultado = await procesarNotaDeCredito(nota.id)
    if (resultado.ok && resultado.data === InvoiceStatus.ISSUED) notasEmitidas += 1
  }

  return {
    facturas: { procesadas: facturas.length, emitidas: facturasEmitidas },
    notas: { procesadas: notas.length, emitidas: notasEmitidas },
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Genera el PDF de una factura emitida.
 *
 * El PDF se arma al vuelo desde la base y no se guarda: son dos kilobytes y
 * guardar archivos obliga a un storage que este proyecto no tiene. Los datos
 * fiscales están congelados en la fila de `Invoice`, así que el comprobante de
 * ayer imprime lo que ARCA autorizó ayer.
 */
export async function generarPdfDeFactura(
  invoiceId: string,
): Promise<{ pdf: Uint8Array; nombre: string } | null> {
  const factura = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      tipoComprobante: true,
      puntoVenta: true,
      numero: true,
      fecha: true,
      cae: true,
      caeVence: true,
      neto: true,
      iva: true,
      total: true,
      descripcion: true,
      cuitEmisor: true,
      receptorNombre: true,
      receptorDocumento: true,
      receptorCondicionIva: true,
    },
  })

  if (
    !factura ||
    factura.status !== InvoiceStatus.ISSUED ||
    factura.numero === null ||
    !factura.cae ||
    !factura.caeVence
  ) {
    return null
  }

  const pdf = generarPdfComprobante({
    tipoComprobante: factura.tipoComprobante as TipoComprobanteLetra,
    puntoVenta: factura.puntoVenta,
    numero: factura.numero,
    fecha: factura.fecha,
    cae: factura.cae,
    caeVence: factura.caeVence,
    neto: aNumero(factura.neto),
    iva: aNumero(factura.iva),
    total: aNumero(factura.total),
    descripcion: factura.descripcion,
    emisor: {
      nombre: env.arca.razonSocial,
      cuit: factura.cuitEmisor ?? env.arca.cuit,
      condicionIva: etiquetaCondicionIva(env.arca.condicionIvaEmisor),
    },
    receptor: {
      nombre: factura.receptorNombre,
      documento: factura.receptorDocumento,
      condicionIva: factura.receptorCondicionIva,
    },
  })

  return {
    pdf,
    nombre: `${factura.tipoComprobante}-${factura.puntoVenta}-${factura.numero}.pdf`,
  }
}

/** Perfil dueño de una factura. Se usa para autorizar la descarga del PDF. */
export async function perfilDeFactura(invoiceId: string): Promise<string | null> {
  const factura = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { payment: { select: { subscription: { select: { profileId: true } } } } },
  })

  return factura?.payment.subscription.profileId ?? null
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function enviarFacturaPorEmailSeguro(invoiceId: string): Promise<void> {
  try {
    const factura = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        tipoComprobante: true,
        puntoVenta: true,
        numero: true,
        cae: true,
        total: true,
        payment: {
          select: {
            subscription: {
              select: {
                profile: {
                  select: {
                    id: true,
                    name: true,
                    user: { select: { email: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!factura || !factura.numero) return

    const email = factura.payment.subscription.profile.user.email
    const nombre =
      factura.payment.subscription.profile.user.name ??
      factura.payment.subscription.profile.name

    const archivo = await generarPdfDeFactura(invoiceId)
    if (!archivo) return

    const dedupeKey = `factura:${factura.id}`

    let registro: { id: string }

    try {
      registro = await prisma.emailLog.create({
        data: {
          profileId: factura.payment.subscription.profile.id,
          email,
          template: 'factura_emitida',
          dedupeKey,
        },
        select: { id: true },
      })
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return
      }
      throw error
    }

    const envio = await enviarEmailFactura({
      email,
      nombre,
      tipoComprobante: factura.tipoComprobante,
      puntoVenta: factura.puntoVenta,
      numero: factura.numero,
      cae: factura.cae ?? '',
      total: aNumero(factura.total),
      archivoNombre: archivo.nombre,
      archivoPdf: archivo.pdf,
    })

    if (!envio.ok) {
      logger.warn('facturación: el email con el comprobante no se pudo enviar', {
        invoiceId,
        error: envio.error,
      })

      await prisma.emailLog.delete({ where: { id: registro.id } }).catch(() => undefined)
    }
  } catch (error: unknown) {
    logger.warn('facturación: no se pudo preparar el email del comprobante', {
      invoiceId,
      error,
    })
  }
}

// ---------------------------------------------------------------------------
// Reporte y panel de administración
// ---------------------------------------------------------------------------

export type FacturaAdmin = {
  id: string
  estado: InvoiceStatus
  tipoComprobante: TipoComprobante
  puntoVenta: number
  numero: number | null
  cae: string | null
  fecha: Date
  neto: number
  iva: number
  total: number
  attempts: number
  lastError: string | null
  nextAttemptAt: Date | null
  pdfUrl: string | null
  profesional: string
  email: string
  mpPaymentId: string | null
  comision: number | null
  netoPercibido: number | null
  notaCredito: { id: string; numero: number | null; cae: string | null; estado: InvoiceStatus } | null
}

export type ResumenMes = {
  facturado: number
  comisiones: number
  neto: number
  reembolsado: number
  cantidad: number
  pendientes: number
}

/** Facturas del mes con el ingreso neto real de Mercado Pago. */
export async function listarFacturasDelMes(
  anio: number,
  mes: number,
): Promise<{ facturas: FacturaAdmin[]; resumen: ResumenMes }> {
  const { inicio, fin } = rangoDelMes(anio, mes)

  const [facturas, aprobados, reembolsados, pendientes] = await Promise.all([
    prisma.invoice.findMany({
      where: { fecha: { gte: inicio, lt: fin } },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        tipoComprobante: true,
        puntoVenta: true,
        numero: true,
        cae: true,
        fecha: true,
        neto: true,
        iva: true,
        total: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        pdfUrl: true,
        payment: {
          select: {
            mpPaymentId: true,
            feeAmount: true,
            netAmount: true,
            subscription: {
              select: {
                profile: {
                  select: { name: true, user: { select: { email: true } } },
                },
              },
            },
          },
        },
        creditNote: {
          select: { id: true, numero: true, cae: true, status: true },
        },
      },
    }),
    prisma.payment.aggregate({
      where: { paidAt: { gte: inicio, lt: fin }, status: PaymentStatus.APPROVED },
      _sum: { amount: true, feeAmount: true, netAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: inicio, lt: fin },
        status: { in: [PaymentStatus.REFUNDED, PaymentStatus.CHARGED_BACK] },
      },
      _sum: { amount: true },
    }),
    prisma.invoice.count({
      where: {
        fecha: { gte: inicio, lt: fin },
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
      },
    }),
  ])

  return {
    facturas: facturas.map((factura) => ({
      id: factura.id,
      estado: factura.status,
      tipoComprobante: factura.tipoComprobante,
      puntoVenta: factura.puntoVenta,
      numero: factura.numero,
      cae: factura.cae,
      fecha: factura.fecha,
      neto: aNumero(factura.neto),
      iva: aNumero(factura.iva),
      total: aNumero(factura.total),
      attempts: factura.attempts,
      lastError: factura.lastError,
      nextAttemptAt: factura.nextAttemptAt,
      pdfUrl: factura.pdfUrl,
      profesional: factura.payment.subscription.profile.name,
      email: factura.payment.subscription.profile.user.email,
      mpPaymentId: factura.payment.mpPaymentId,
      comision: factura.payment.feeAmount ? aNumero(factura.payment.feeAmount) : null,
      netoPercibido: factura.payment.netAmount ? aNumero(factura.payment.netAmount) : null,
      notaCredito: factura.creditNote
        ? {
            id: factura.creditNote.id,
            numero: factura.creditNote.numero,
            cae: factura.creditNote.cae,
            estado: factura.creditNote.status,
          }
        : null,
    })),
    resumen: {
      facturado: aprobados._sum.amount ? aNumero(aprobados._sum.amount) : 0,
      comisiones: aprobados._sum.feeAmount ? aNumero(aprobados._sum.feeAmount) : 0,
      neto: aprobados._sum.netAmount ? aNumero(aprobados._sum.netAmount) : 0,
      reembolsado: reembolsados._sum.amount ? aNumero(reembolsados._sum.amount) : 0,
      cantidad: aprobados._count,
      pendientes,
    },
  }
}

/**
 * CSV para el contador, con separador `;` y BOM UTF-8.
 *
 * El BOM es para que Excel abra los acentos bien al hacer doble clic. Sin eso,
 * "Facturación" aparece como "FacturaciÃ³n" y el contador piensa que el sistema
 * está roto.
 */
export async function reporteMensualCsv(anio: number, mes: number): Promise<string> {
  const { facturas } = await listarFacturasDelMes(anio, mes)

  const filas: (string | number | null)[][] = [
    [
      'Fecha',
      'Pago MP',
      'Comprobante',
      'Punto de venta',
      'Numero',
      'CAE',
      'Estado',
      'Neto',
      'IVA',
      'Total',
      'Comision MP',
      'Neto percibido',
      'Profesional',
      'Email',
      'Nota de credito',
    ],
  ]

  for (const factura of facturas) {
    filas.push([
      factura.fecha.toISOString().slice(0, 10),
      factura.mpPaymentId,
      factura.tipoComprobante,
      factura.puntoVenta,
      factura.numero,
      factura.cae,
      factura.estado,
      importeCsv(factura.neto),
      importeCsv(factura.iva),
      importeCsv(factura.total),
      factura.comision === null ? '' : importeCsv(factura.comision),
      factura.netoPercibido === null ? '' : importeCsv(factura.netoPercibido),
      factura.profesional,
      factura.email,
      factura.notaCredito?.cae ?? '',
    ])
  }

  return `\uFEFF${formatearCsv(filas)}`
}
