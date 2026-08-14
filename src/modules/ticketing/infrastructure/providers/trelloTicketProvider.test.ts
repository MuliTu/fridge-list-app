import {
  TrelloTicketProvider,
  TrelloTicketProviderError
} from './trelloTicketProvider'

const config = {
  apiKey: 'secret-api-key',
  apiToken: 'secret-api-token',
  listId: 'target-list'
}

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  ({
    ok: init.status === undefined || (init.status >= 200 && init.status < 300),
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(body)
  }) as unknown as Response

describe('TrelloTicketProvider', () => {
  it('creates a Trello card and normalizes the provider response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'card-123',
        url: 'https://trello.com/c/card123',
        name: 'Shared lists',
        desc: 'Let household members share a list.',
        providerOnlyField: true
      })
    )
    const provider = new TrelloTicketProvider(config, fetchImpl)

    await expect(
      provider.createTicket({
        title: 'Shared lists',
        description: 'Let household members share a list.',
        labels: ['feature'],
        priority: 'high'
      })
    ).resolves.toEqual({
      id: 'card-123',
      url: 'https://trello.com/c/card123',
      title: 'Shared lists',
      description: 'Let household members share a list.'
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.trello.com/1/cards')
    expect(url).not.toContain(config.apiKey)
    expect(url).not.toContain(config.apiToken)
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    })
    expect(init.body).toBeInstanceOf(URLSearchParams)
    expect(Object.fromEntries((init.body as URLSearchParams).entries())).toEqual({
      key: config.apiKey,
      token: config.apiToken,
      idList: config.listId,
      name: 'Shared lists',
      desc: 'Let household members share a list.'
    })
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'card-123',
        url: 'https://trello.com/c/card123',
        name: 'Title',
        desc: 'Description'
      })
    )
    const provider = new TrelloTicketProvider(config, fetchImpl)
    const controller = new AbortController()

    await provider.createTicket(
      { title: 'Title', description: 'Description' },
      { signal: controller.signal }
    )

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('maps non-2xx responses to a credential-free error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { status: 401 }))
    const provider = new TrelloTicketProvider(config, fetchImpl)

    const error = await provider
      .createTicket({ title: 'Title', description: 'Description' })
      .catch((cause) => cause)

    expect(error).toBeInstanceOf(TrelloTicketProviderError)
    expect(error).toMatchObject({
      code: 'TICKET_PROVIDER_ERROR',
      message: 'Ticket provider request failed',
      status: 401
    })
    expect(JSON.stringify(error)).not.toContain(config.apiKey)
    expect(JSON.stringify(error)).not.toContain(config.apiToken)
  })

  it.each([
    {},
    { id: '', url: 'https://trello.com/c/card123', name: 'Title', desc: 'Description' },
    { id: 'card-123', url: 'not-a-url', name: 'Title', desc: 'Description' },
    { id: 'card-123', url: 'https://trello.com/c/card123', desc: 'Description' }
  ])('rejects malformed Trello responses %#', async (payload) => {
    const provider = new TrelloTicketProvider(
      config,
      jest.fn().mockResolvedValue(jsonResponse(payload))
    )

    await expect(
      provider.createTicket({ title: 'Title', description: 'Description' })
    ).rejects.toMatchObject({
      code: 'TICKET_PROVIDER_ERROR',
      message: 'Ticket provider request failed'
    })
  })

  it('hides network and response parsing error details', async () => {
    const credentialBearingMessage = `failed with ${config.apiKey} and ${config.apiToken}`
    const networkProvider = new TrelloTicketProvider(
      config,
      jest.fn().mockRejectedValue(new Error(credentialBearingMessage))
    )
    const parseProvider = new TrelloTicketProvider(
      config,
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error(credentialBearingMessage))
      } as unknown as Response)
    )

    for (const provider of [networkProvider, parseProvider]) {
      const error = await provider
        .createTicket({ title: 'Title', description: 'Description' })
        .catch((cause) => cause)
      expect(error.message).toBe('Ticket provider request failed')
      expect(error.message).not.toContain(config.apiKey)
      expect(error.message).not.toContain(config.apiToken)
    }
  })
})
