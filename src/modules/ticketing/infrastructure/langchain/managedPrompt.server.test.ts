import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  ChatPromptTemplate,
  PromptTemplate,
  SystemMessagePromptTemplate
} from '@langchain/core/prompts'

import {
  createManagedPromptLoader,
  ManagedPromptError,
  type PullManagedPrompt
} from './managedPrompt.server'

const config = {
  apiKey: 'langchain-secret',
  promptId: 'create-ticket',
  promptVersion: 'release-7'
}

const validPrompt = () =>
  ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate('Create one ticket for {request}.'),
    ['human', '{request}']
  ])

describe('managed prompt loader', () => {
  it('pulls the configured pinned prompt without including a managed model', async () => {
    const prompt = validPrompt()
    const pullPrompt = jest.fn<ReturnType<PullManagedPrompt>, Parameters<PullManagedPrompt>>()
    pullPrompt.mockResolvedValue(prompt)
    const load = createManagedPromptLoader({ pullPrompt })

    await expect(load(config)).resolves.toBe(prompt)
    expect(pullPrompt).toHaveBeenCalledWith('create-ticket:release-7', {
      apiKey: 'langchain-secret',
      includeModel: false
    })
  })

  it('accepts a concrete leading system message and an unpinned prompt ID', async () => {
    const prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage('Create a ticket.'),
      new HumanMessage('{request}')
    ])
    const pullPrompt = jest.fn().mockResolvedValue(prompt)
    const load = createManagedPromptLoader({ pullPrompt })

    await expect(load({ ...config, promptVersion: undefined })).resolves.toBe(prompt)
    expect(pullPrompt).toHaveBeenCalledWith(
      'create-ticket',
      expect.objectContaining({ includeModel: false })
    )
  })

  it.each([
    ['a string prompt', PromptTemplate.fromTemplate('Create {request}')],
    ['a chat prompt without messages', ChatPromptTemplate.fromMessages([])],
    [
      'a chat prompt without a leading system message',
      ChatPromptTemplate.fromMessages([['human', '{request}']])
    ]
  ])('rejects %s with a safe invalid-prompt error', async (_description, prompt) => {
    const pullPrompt = jest.fn().mockResolvedValue(prompt)
    const load = createManagedPromptLoader({ pullPrompt })

    await expect(load(config)).rejects.toMatchObject({
      code: 'PROMPT_PROVIDER_ERROR',
      reason: 'invalid_prompt',
      message: 'The managed prompt has an unsupported format'
    })
  })

  it('maps provider failures without exposing provider messages or configuration', async () => {
    const pullPrompt = jest
      .fn()
      .mockRejectedValue(new Error('request failed with langchain-secret and prompt contents'))
    const load = createManagedPromptLoader({ pullPrompt })

    let thrown: unknown
    try {
      await load(config)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ManagedPromptError)
    expect(thrown).toMatchObject({
      code: 'PROMPT_PROVIDER_ERROR',
      reason: 'provider_failure'
    })
    expect(String(thrown)).not.toContain('langchain-secret')
    expect(String(thrown)).not.toContain('prompt contents')
    expect(String(thrown)).not.toContain('create-ticket')
  })

  it('deduplicates concurrent loads, caches briefly, then refreshes', async () => {
    const prompt = validPrompt()
    let currentTime = 1_000
    const pullPrompt = jest.fn().mockResolvedValue(prompt)
    const load = createManagedPromptLoader({
      pullPrompt,
      cacheTtlMs: 50,
      now: () => currentTime
    })

    await Promise.all([load(config), load(config)])
    await load(config)
    expect(pullPrompt).toHaveBeenCalledTimes(1)

    currentTime = 1_051
    await load(config)
    expect(pullPrompt).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures', async () => {
    const prompt = validPrompt()
    const pullPrompt = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(prompt)
    const load = createManagedPromptLoader({ pullPrompt })

    await expect(load(config)).rejects.toBeInstanceOf(ManagedPromptError)
    await expect(load(config)).resolves.toBe(prompt)
    expect(pullPrompt).toHaveBeenCalledTimes(2)
  })
})
