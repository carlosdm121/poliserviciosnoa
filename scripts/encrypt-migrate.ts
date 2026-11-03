/**
 * Script de migración idempotente: cifra los datos sensibles que aún están en
 * claro en la base de datos.
 *
 * Uso: `DATA_ENCRYPTION_KEY=<clave> DATABASE_URL=<url> tsx scripts/encrypt-migrate.ts`
 *
 * Es idempotente: si un campo ya tiene el prefijo `v1:`, se salta. Puede
 * correrse varias veces sin dañar datos ya cifrados.
 *
 * Campos que cifra:
 *   - Profile.whatsappE164
 *   - Profile.cuit (perfil de empresa)
 *   - FiscalData.documento (CUIT/CUIL/DNI)
 *   - FiscalData.domicilioFiscal
 */

import { Prisma } from '@prisma/client'

import { encryptField, yaCifrado } from '@/lib/db/encrypt'
import { prisma } from '@/lib/prisma'

/** Tamaño de lote para no saturar la base ni la memoria. */
const LOTE = 100

type PerfilConCampo = {
  id: string
  whatsappE164: string | null
  cuit: string | null
}

type FiscalConCampo = {
  id: string
  documento: string | null
  domicilioFiscal: string | null
}

/**
 * Busca perfiles con un campo en claro (no null y no empieza con 'v1:').
 * Usa paginación por cursor para no cargar todo en memoria.
 */
async function buscarPerfilesClaro(
  campo: 'whatsappE164' | 'cuit',
  cursor: string | undefined,
): Promise<PerfilConCampo[]> {
  const where: Prisma.ProfileWhereInput = {
    [campo]: { not: null },
  }

  return (await prisma.profile.findMany({
    where,
    select: { id: true, whatsappE164: true, cuit: true },
    take: LOTE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: 'asc' },
  })) as unknown as PerfilConCampo[]
}

async function migrarCampoPerfil(
  campo: 'whatsappE164' | 'cuit',
): Promise<number> {
  let totalCifrados = 0
  let cursor: string | undefined = undefined

  while (true) {
    const perfiles = await buscarPerfilesClaro(campo, cursor)

    if (perfiles.length === 0) break

    for (const perfil of perfiles) {
      const valor = perfil[campo]
      if (!valor || yaCifrado(valor)) continue

      await prisma.profile.update({
        where: { id: perfil.id },
        data: { [campo]: encryptField(valor) } as Prisma.ProfileUpdateInput,
      })

      totalCifrados += 1
    }

    cursor = perfiles[perfiles.length - 1]!.id
  }

  return totalCifrados
}

type FiscalDataUpdateData = {
  documento?: string | null
  domicilioFiscal?: string | null
}

async function migrarFiscalData(): Promise<number> {
  let totalCifrados = 0
  let cursor: string | undefined = undefined

  while (true) {
    const fiscales = (await prisma.fiscalData.findMany({
      select: { id: true, documento: true, domicilioFiscal: true },
      take: LOTE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    })) as unknown as FiscalConCampo[]

    if (fiscales.length === 0) break

    for (const fiscal of fiscales) {
      const datos: FiscalDataUpdateData = {}

      if (fiscal.documento && !yaCifrado(fiscal.documento)) {
        datos.documento = encryptField(fiscal.documento)
      }

      if (fiscal.domicilioFiscal && !yaCifrado(fiscal.domicilioFiscal)) {
        datos.domicilioFiscal = encryptField(fiscal.domicilioFiscal)
      }

      if (Object.keys(datos).length > 0) {
        await prisma.fiscalData.update({
          where: { id: fiscal.id },
          data: datos as Prisma.FiscalDataUpdateInput,
        })
        totalCifrados += 1
      }
    }

    cursor = fiscales[fiscales.length - 1]!.id
  }

  return totalCifrados
}

async function main(): Promise<void> {
  console.log('Iniciando migración de cifrado de datos sensibles...\n')

  const whatsAppCount = await migrarCampoPerfil('whatsappE164')
  console.log(`Perfiles con whatsappE164 cifrados: ${whatsAppCount}`)

  const cuitCount = await migrarCampoPerfil('cuit')
  console.log(`Perfiles con cuit cifrados: ${cuitCount}`)

  const fiscalCount = await migrarFiscalData()
  console.log(`Registros de FiscalData cifrados: ${fiscalCount}`)

  const total = whatsAppCount + cuitCount + fiscalCount
  console.log(`\nTotal de valores cifrados: ${total}`)

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Error en la migración:', error)
  process.exit(1)
})
