import { PaymentStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { formatearFechaLarga } from '@/lib/fechas'
import {
  firmaValidaWebhook,
  firmarWebhook,
  manifestWebhook,
  parsearFirma,
} from '@/lib/mp/firma'
import {
  claveEventoMp,
  estadoPagoAStatus,
  leerEvento,
  leerRecursoId,
  preapprovalCancelado,
} from '@/lib/mp/evento'

/**
 * Lógica pura del módulo 2.4.
 *
 * El procesamiento con base y proveedor se verifica en
 * `scripts/verificar-webhook-mp.ts`. Acá van las dos partes donde un error se
 * paga caro y no se ve: la firma y el mapeo de estados.
 */

const SECRETO = 'secreto-webhook-de-prueba'
const TS = '1700000000'
const REQUEST_ID = 'req-123'

describe('firma del webhook', () => {
  it('acepta una firma calculada con el mismo secreto', () => {
    const v1 = firmarWebhook({
      dataId: '123456',
      ts: TS,
      requestId: REQUEST_ID,
      secreto: SECRETO,
    })

    expect(
      firmaValidaWebhook({
        dataId: '123456',
        header: `ts=${TS},v1=${v1}`,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(true)
  })

  it('rechaza si cambia el id del recurso', () => {
    const v1 = firmarWebhook({
      dataId: '123456',
      ts: TS,
      requestId: REQUEST_ID,
      secreto: SECRETO,
    })

    expect(
      firmaValidaWebhook({
        dataId: '999999',
        header: `ts=${TS},v1=${v1}`,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(false)
  })

  it('rechaza con otro secreto', () => {
    const v1 = firmarWebhook({
      dataId: '123456',
      ts: TS,
      requestId: REQUEST_ID,
      secreto: 'otro-secreto',
    })

    expect(
      firmaValidaWebhook({
        dataId: '123456',
        header: `ts=${TS},v1=${v1}`,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(false)
  })

  it('rechaza sin header o con un header incompleto', () => {
    expect(
      firmaValidaWebhook({
        dataId: '123456',
        header: null,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(false)

    expect(
      firmaValidaWebhook({
        dataId: '123456',
        header: `ts=${TS}`,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(false)
  })

  it('lee los pares en cualquier orden y con espacios', () => {
    const v1 = firmarWebhook({
      dataId: 'abc',
      ts: TS,
      requestId: REQUEST_ID,
      secreto: SECRETO,
    })

    const partes = parsearFirma(`v1=${v1}, ts=${TS}`)

    expect(partes).toEqual({ ts: TS, v1 })
  })

  it('el manifest omite request-id cuando no vino', () => {
    expect(manifestWebhook('ABC', TS, null)).toBe(`id:abc;ts:${TS};`)
    expect(manifestWebhook('ABC', TS, REQUEST_ID)).toBe(
      `id:abc;request-id:${REQUEST_ID};ts:${TS};`,
    )
  })

  it('normaliza el id a minúsculas', () => {
    const v1 = firmarWebhook({
      dataId: 'ABC-123',
      ts: TS,
      requestId: REQUEST_ID,
      secreto: SECRETO,
    })

    expect(
      firmaValidaWebhook({
        dataId: 'abc-123',
        header: `ts=${TS},v1=${v1}`,
        requestId: REQUEST_ID,
        secreto: SECRETO,
      }),
    ).toBe(true)
  })
})

describe('lectura del evento', () => {
  it('lee un pago con id numérico', () => {
    expect(
      leerEvento({
        id: 42,
        type: 'payment',
        action: 'payment.created',
        data: { id: 123456 },
      }),
    ).toEqual({
      tipo: 'payment',
      recursoId: '123456',
      notificacionId: '42',
      accion: 'payment.created',
    })
  })

  it('lee un preapproval con id string', () => {
    expect(
      leerEvento({
        type: 'subscription_preapproval',
        data: { id: '2c938084' },
      }),
    ).toEqual({
      tipo: 'subscription_preapproval',
      recursoId: '2c938084',
      notificacionId: null,
      accion: null,
    })
  })

  it('ignora tipos que no procesamos', () => {
    expect(leerEvento({ type: 'point_integration_wh', data: { id: '1' } })).toBeNull()
  })

  it('ignora un evento sin data.id', () => {
    expect(leerEvento({ type: 'payment', data: {} })).toBeNull()
    expect(leerRecursoId({ type: 'payment' })).toBeNull()
  })
})

describe('estados', () => {
  it.each([
    ['approved', PaymentStatus.APPROVED],
    ['rejected', PaymentStatus.REJECTED],
    ['cancelled', PaymentStatus.REJECTED],
    ['refunded', PaymentStatus.REFUNDED],
    ['charged_back', PaymentStatus.CHARGED_BACK],
    ['pending', PaymentStatus.PENDING],
    ['in_process', PaymentStatus.PENDING],
    ['in_mediation', PaymentStatus.PENDING],
    ['un_estado_nuevo', PaymentStatus.PENDING],
  ])('traduce %s a %s', (estado, esperado) => {
    expect(estadoPagoAStatus(estado)).toBe(esperado)
  })

  it('solo cancelled cuenta como baja del preapproval', () => {
    expect(preapprovalCancelado('cancelled')).toBe(true)
    expect(preapprovalCancelado('paused')).toBe(false)
    expect(preapprovalCancelado('authorized')).toBe(false)
  })

  it('la clave de idempotencia incluye el estado normalizado', () => {
    expect(claveEventoMp('payment', '123', 'APPROVED')).toBe('mp:payment:123:approved')
  })
})

describe('fechas', () => {
  it('formatea en español y en UTC', () => {
    expect(formatearFechaLarga(new Date('2026-12-15T23:30:00.000Z'))).toBe(
      '15 de diciembre de 2026',
    )
  })
})
