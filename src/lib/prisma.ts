import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure Prisma for Neon/serverless environments
const prismaClientOptions: {
  log?: ('query' | 'info' | 'warn' | 'error')[]
} = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  // For Neon and serverless, connection pooling is handled by the database
  // No need for connection pool configuration
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// In serverless environments (Vercel), connections are managed automatically
// No need to explicitly connect/disconnect
// Skip connection during build phase
if (
  process.env.NODE_ENV !== 'test' && 
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  prisma.$connect().catch((error) => {
    console.error('Failed to connect to database:', error)
  })
}

