import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)

const envSchema = z
  .object({
    AGENT_CREATE_TICKET_ENABLED: z.enum(['true', 'false']).optional().default('false'),
    AGENT_CREATE_TICKET_ALLOWED_UIDS: z.string(),
    AGENT_CREATE_TICKET_MODEL: nonEmpty,
    AGENT_CREATE_TICKET_PROVIDER: z.enum(['fake', 'trello']),
    LANGSMITH_API_KEY: nonEmpty,
    AGENT_CREATE_TICKET_PROMPT_ID: nonEmpty,
    AGENT_CREATE_TICKET_PROMPT_VERSION: z.string().trim().min(1).optional(),
    OPENAI_API_KEY: nonEmpty,
    TRELLO_API_KEY: z.string().trim().optional(),
    TRELLO_API_TOKEN: z.string().trim().optional(),
    TRELLO_LIST_ID: z.string().trim().optional()
  })
  .superRefine((env, ctx) => {
    if (env.AGENT_CREATE_TICKET_PROVIDER !== 'trello') return

    for (const key of ['TRELLO_API_KEY', 'TRELLO_API_TOKEN', 'TRELLO_LIST_ID'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required when AGENT_CREATE_TICKET_PROVIDER is trello'
        })
      }
    }
  })

export type CreateTicketProviderConfig =
  | { type: 'fake' }
  | {
      type: 'trello'
      apiKey: string
      apiToken: string
      listId: string
    }

export type CreateTicketConfig = {
  enabled: boolean
  allowedUids: ReadonlySet<string>
  model: {
    name: string
    openAiApiKey: string
  }
  provider: CreateTicketProviderConfig
  langChain: {
    apiKey: string
    promptId: string
    promptVersion?: string
  }
}

/**
 * Safe configuration error: it identifies invalid environment keys for operators,
 * but never includes their values (which may be credentials).
 */
export class CreateTicketConfigError extends Error {
  readonly code = 'SERVER_NOT_CONFIGURED'

  constructor(readonly invalidKeys: readonly string[]) {
    super(`Create-ticket server configuration is invalid: ${invalidKeys.join(', ')}`)
    this.name = 'CreateTicketConfigError'
  }
}

const parseAllowedUids = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  )

/**
 * Parse on demand rather than at module load so a disabled route can return 404
 * without crashing the server, and tests/serverless invocations can supply env.
 * Keep this module out of client imports: every value it returns is server-secret.
 */
export const readCreateTicketConfig = (
  environment: NodeJS.ProcessEnv
): CreateTicketConfig => {
  const parsed = envSchema.safeParse(environment)
  if (!parsed.success) {
    const invalidKeys = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          typeof issue.path[0] === 'string' ? issue.path[0] : 'environment'
        )
      )
    ].sort()
    throw new CreateTicketConfigError(invalidKeys)
  }

  const env = parsed.data
  const provider: CreateTicketProviderConfig =
    env.AGENT_CREATE_TICKET_PROVIDER === 'fake'
      ? { type: 'fake' }
      : {
          type: 'trello',
          apiKey: env.TRELLO_API_KEY!,
          apiToken: env.TRELLO_API_TOKEN!,
          listId: env.TRELLO_LIST_ID!
        }

  return {
    enabled: env.AGENT_CREATE_TICKET_ENABLED === 'true',
    allowedUids: parseAllowedUids(env.AGENT_CREATE_TICKET_ALLOWED_UIDS),
    model: {
      name: env.AGENT_CREATE_TICKET_MODEL,
      openAiApiKey: env.OPENAI_API_KEY
    },
    provider,
    langChain: {
      apiKey: env.LANGSMITH_API_KEY,
      promptId: env.AGENT_CREATE_TICKET_PROMPT_ID,
      promptVersion: env.AGENT_CREATE_TICKET_PROMPT_VERSION
    }
  }
}
