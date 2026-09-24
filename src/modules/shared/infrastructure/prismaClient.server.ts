import '@tanstack/react-start/server-only'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../generated/prisma/client'
import { ApplicationError } from '../application/applicationError'

export type PrismaClientEnvironment = Readonly<{
  DATABASE_URL?: string
}>

export type PrismaClientFactory = (databaseUrl: string) => PrismaClient

type CachedPrismaClient = {
  databaseUrl: string
  client: PrismaClient
}

let cachedClient: CachedPrismaClient | undefined

const createPrismaClient: PrismaClientFactory = (url) => {
  const adapter = new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

export const databaseUrl = (environment: PrismaClientEnvironment): string => {
  const value = environment.DATABASE_URL?.trim()
  if (!value) {
    throw new ApplicationError(
      'not_configured',
      'DATABASE_URL is required for RDS-backed data access'
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new ApplicationError(
      'not_configured',
      'DATABASE_URL must be a valid PostgreSQL URL',
      error
    )
  }

  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new ApplicationError(
      'not_configured',
      'DATABASE_URL must use the PostgreSQL protocol'
    )
  }

  if (!url.username || !url.password || !url.hostname || url.pathname === '/' || !url.pathname) {
    throw new ApplicationError(
      'not_configured',
      'DATABASE_URL must include database credentials, host, and database name'
    )
  }

  if (url.hash) {
    throw new ApplicationError(
      'not_configured',
      'DATABASE_URL must not include a URL fragment'
    )
  }

  return url.toString()
}

export const getPrismaClient = (
  environment: PrismaClientEnvironment = process.env,
  createClient: PrismaClientFactory = createPrismaClient
): PrismaClient => {
  const url = databaseUrl(environment)

  if (cachedClient?.databaseUrl === url) return cachedClient.client

  const client = createClient(url)
  cachedClient = { databaseUrl: url, client }
  return client
}

export const resetPrismaClientForTests = (): void => {
  cachedClient = undefined
}
