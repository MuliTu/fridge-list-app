import { SystemMessage } from '@langchain/core/messages'
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate
} from '@langchain/core/prompts'
import { pull } from 'langchain/hub/node'

import type { CreateTicketConfig } from '../createTicketConfig.server'

export type ManagedCreateTicketPrompt = ChatPromptTemplate

type LangChainPromptConfig = CreateTicketConfig['langChain']

export type PullManagedPrompt = (
  promptReference: string,
  options: {
    apiKey: string
    includeModel: false
  }
) => Promise<unknown>

export class ManagedPromptError extends Error {
  readonly code = 'PROMPT_PROVIDER_ERROR'

  constructor(readonly reason: 'provider_failure' | 'invalid_prompt') {
    super(
      reason === 'provider_failure'
        ? 'The managed prompt could not be retrieved'
        : 'The managed prompt has an unsupported format'
    )
    this.name = 'ManagedPromptError'
  }
}

const isExpectedPrompt = (value: unknown): value is ManagedCreateTicketPrompt => {
  if (!(value instanceof ChatPromptTemplate) || value.promptMessages.length === 0) {
    return false
  }

  // The managed instructions must be the leading message. Accept both a
  // templated system message and an already-materialized system message.
  const firstMessage = value.promptMessages[0]
  return (
    firstMessage instanceof SystemMessagePromptTemplate ||
    firstMessage instanceof SystemMessage
  )
}

const promptReference = ({ promptId, promptVersion }: LangChainPromptConfig): string =>
  promptVersion ? `${promptId}:${promptVersion}` : promptId

type ManagedPromptLoaderOptions = {
  pullPrompt?: PullManagedPrompt
  cacheTtlMs?: number
  now?: () => number
}

type CacheEntry = {
  apiKey: string
  promptReference: string
  expiresAt: number
  value: Promise<ManagedCreateTicketPrompt>
}

/**
 * Creates a server-only loader. Keeping the provider injectable makes failure
 * handling testable without network access. The cache is local to the loader
 * and never writes prompt contents or credentials to logs or client storage.
 */
export const createManagedPromptLoader = ({
  pullPrompt = pull,
  cacheTtlMs = 30_000,
  now = Date.now
}: ManagedPromptLoaderOptions = {}) => {
  let cache: CacheEntry | undefined

  return async (config: LangChainPromptConfig): Promise<ManagedCreateTicketPrompt> => {
    const reference = promptReference(config)
    const currentTime = now()

    if (
      cache &&
      cache.apiKey === config.apiKey &&
      cache.promptReference === reference &&
      cache.expiresAt > currentTime
    ) {
      return cache.value
    }

    const value = (async () => {
      let managedPrompt: unknown
      try {
        managedPrompt = await pullPrompt(reference, {
          apiKey: config.apiKey,
          includeModel: false
        })
      } catch {
        throw new ManagedPromptError('provider_failure')
      }

      if (!isExpectedPrompt(managedPrompt)) {
        throw new ManagedPromptError('invalid_prompt')
      }

      return managedPrompt
    })()

    const entry: CacheEntry = {
      apiKey: config.apiKey,
      promptReference: reference,
      expiresAt: currentTime + Math.max(0, cacheTtlMs),
      value
    }
    cache = entry

    try {
      return await value
    } catch (error) {
      // Retrieval failures are retryable; never retain a rejected promise.
      if (cache === entry) cache = undefined
      throw error
    }
  }
}

export const loadManagedCreateTicketPrompt = createManagedPromptLoader()
