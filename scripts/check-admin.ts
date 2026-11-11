import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, sessionVersion: true, passwordHash: true, createdAt: true },
  })
  console.log('Usuarios:', JSON.stringify(users, null, 2))

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@poliserviciosnoa.com' },
  })
  const password = process.env.ADMIN_PASSWORD
  if (admin && password) {
    const ok = await bcrypt.compare(password, admin.passwordHash!)
    console.log('Password check for admin@poliserviciosnoa.com:', ok)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())