import { PrismaClient } from '@prisma/client'
import { hashearPassword } from '@/lib/password'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@poliserviciosnoa.com'
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    throw new Error('Falta ADMIN_PASSWORD en el entorno.')
  }

  const passwordHash = await hashearPassword(password)

  const usuario = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      passwordHash,
      name: 'Administrador',
      emailVerified: new Date(),
      sessionVersion: 0,
    },
    create: {
      email,
      passwordHash,
      name: 'Administrador',
      role: 'ADMIN',
      emailVerified: new Date(),
      sessionVersion: 0,
    },
  })

  console.log('Admin creado/actualizado:', usuario.email, '- rol:', usuario.role)
}

main().catch((error) => {
  console.error('Error al crear admin:', error)
  process.exit(1)
}).finally(() => {
  void prisma.$disconnect()
})