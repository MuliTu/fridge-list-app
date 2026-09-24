/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn((options) => ({ options }))
}))
jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: jest.fn((options) => ({ options }))
}))

import { databaseUrl, getPrismaClient, resetPrismaClientForTests } from './prismaClient.server'
import type { PrismaClient } from '../../../generated/prisma/client'

const validDatabaseUrl = 'postgresql://user:password@db.example.test:5432/fridge_list?schema=public'

const stubPrismaClient = (id: string) => ({ id }) as unknown as PrismaClient

describe('prismaClient.server', () => {
  beforeEach(() => {
    resetPrismaClientForTests()
  })

  it('fails closed when DATABASE_URL is missing', () => {
    expect(() => databaseUrl({})).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it.each([
    'not-a-url',
    'https://user:password@db.example.test/fridge_list',
    'postgresql://db.example.test/fridge_list',
    'postgresql://user:password@/fridge_list',
    'postgresql://user:password@db.example.test/',
    'postgresql://user:password@db.example.test/fridge_list#secret'
  ])('rejects unsafe database URL: %s', (value) => {
    expect(() => databaseUrl({ DATABASE_URL: value })).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it.each([
    validDatabaseUrl,
    'postgres://user:password@db.example.test:5432/fridge_list'
  ])('accepts PostgreSQL database URL: %s', (value) => {
    expect(databaseUrl({ DATABASE_URL: value })).toBe(value)
  })

  it('does not expose the raw DATABASE_URL in validation errors', () => {
    const secretUrl = 'not-a-url-with-password-secret'

    let thrown: unknown
    try {
      databaseUrl({ DATABASE_URL: secretUrl })
    } catch (error) {
      thrown = error
    }

    expect(String(thrown)).not.toContain(secretUrl)
  })

  it('constructs lazily and caches the Prisma client for matching database URL', () => {
    const createClient = jest.fn(() => stubPrismaClient('client-1'))

    const first = getPrismaClient({ DATABASE_URL: validDatabaseUrl }, createClient)
    const second = getPrismaClient({ DATABASE_URL: validDatabaseUrl }, createClient)

    expect(second).toBe(first)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith(validDatabaseUrl)
  })

  it('constructs a real Prisma client adapter shape by default without connecting', () => {
    const client = getPrismaClient({ DATABASE_URL: validDatabaseUrl })

    expect(client).toEqual({
      options: {
        adapter: {
          options: { connectionString: validDatabaseUrl }
        }
      }
    })
  })

  it('creates a new client when the database URL changes', () => {
    const createClient = jest
      .fn()
      .mockReturnValueOnce(stubPrismaClient('client-1'))
      .mockReturnValueOnce(stubPrismaClient('client-2'))
    const nextUrl = 'postgresql://user:password@db.example.test:5432/fridge_list_next'

    const first = getPrismaClient({ DATABASE_URL: validDatabaseUrl }, createClient)
    const second = getPrismaClient({ DATABASE_URL: nextUrl }, createClient)

    expect(second).not.toBe(first)
    expect(createClient).toHaveBeenCalledTimes(2)
  })
})
