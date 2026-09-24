import {
  CreateTicketConfigError,
  readCreateTicketConfig
} from '../../../../src/modules/ticketing/infrastructure/createTicketConfig.server'

const validEnv = (): NodeJS.ProcessEnv => ({
  AGENT_CREATE_TICKET_ENABLED: 'true',
  AGENT_CREATE_TICKET_ALLOWED_UIDS: ' user-1, dev-bypass, user-1 ,, ',
  AGENT_CREATE_TICKET_MODEL: 'gpt-4.1-mini',
  AGENT_CREATE_TICKET_PROVIDER: 'fake',
  LANGSMITH_API_KEY: 'langsmith-secret',
  AGENT_CREATE_TICKET_PROMPT_ID: 'create-ticket',
  AGENT_CREATE_TICKET_PROMPT_VERSION: 'v1',
  OPENAI_API_KEY: 'openai-secret'
})

describe('readCreateTicketConfig', () => {
  it('returns typed fake-provider configuration and normalizes the UID allowlist', () => {
    const config = readCreateTicketConfig(validEnv())

    expect(config.enabled).toBe(true)
    expect([...config.allowedUids]).toEqual(['user-1', 'dev-bypass'])
    expect(config.provider).toEqual({ type: 'fake' })
    expect(config.langChain.promptVersion).toBe('v1')
  })

  it('requires Trello credentials only for the Trello provider', () => {
    const env = validEnv()
    env.AGENT_CREATE_TICKET_PROVIDER = 'trello'

    expect(() => readCreateTicketConfig(env)).toThrow(CreateTicketConfigError)

    Object.assign(env, {
      TRELLO_API_KEY: 'trello-key',
      TRELLO_API_TOKEN: 'trello-token',
      TRELLO_LIST_ID: 'list-id'
    })
    expect(readCreateTicketConfig(env).provider).toEqual({
      type: 'trello',
      apiKey: 'trello-key',
      apiToken: 'trello-token',
      listId: 'list-id'
    })
  })

  it('fails closed without leaking secret values', () => {
    const env = validEnv()
    delete env.LANGSMITH_API_KEY
    env.OPENAI_API_KEY = ''

    try {
      readCreateTicketConfig(env)
      throw new Error('expected configuration parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CreateTicketConfigError)
      expect((error as CreateTicketConfigError).invalidKeys).toEqual([
        'LANGSMITH_API_KEY',
        'OPENAI_API_KEY'
      ])
      expect(String(error)).not.toContain('langsmith-secret')
      expect(String(error)).not.toContain('openai-secret')
    }
  })

  it('defaults feature enablement to false but rejects malformed values', () => {
    const env = validEnv()
    delete env.AGENT_CREATE_TICKET_ENABLED
    expect(readCreateTicketConfig(env).enabled).toBe(false)

    env.AGENT_CREATE_TICKET_ENABLED = 'yes'
    expect(() => readCreateTicketConfig(env)).toThrow(CreateTicketConfigError)
  })
})
