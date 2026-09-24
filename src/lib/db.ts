import { PrismaClient } from '@prisma/client'
import { retryReadOnce } from '@/lib/db-retry'

// Typed back as a plain PrismaClient: a query-only extension leaves the model
// API unchanged, and the extended type is not assignable to the PrismaClient /
// TransactionClient parameters used across actions and importers. The only
// members it drops, $on and $use, are never called on `db`.
function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  }).$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        return retryReadOnce(operation, model, () => query(args))
      },
    },
  }) as unknown as PrismaClient
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
