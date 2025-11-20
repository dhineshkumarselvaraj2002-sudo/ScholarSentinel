import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Ensure Prisma client is connected
if (process.env.NODE_ENV !== 'test') {
  prisma.$connect().catch((error) => {
    console.error('Failed to connect to database:', error)
  })
}

