import { FakeTicketProvider } from './fakeTicketProvider'

describe('FakeTicketProvider', () => {
  it('creates deterministic normalized tickets without using the network', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = jest.fn()
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchSpy
    })
    const provider = new FakeTicketProvider()

    await expect(
      provider.createTicket({
        title: 'Shared lists',
        description: 'Let household members share a list.',
        labels: ['feature'],
        priority: 'high'
      })
    ).resolves.toEqual({
      id: 'fake-ticket-1',
      url: 'https://fake.invalid/tickets/fake-ticket-1',
      title: 'Shared lists',
      description: 'Let household members share a list.'
    })

    await expect(
      provider.createTicket({
        title: 'Second request',
        description: 'A second description.'
      })
    ).resolves.toMatchObject({ id: 'fake-ticket-2' })
    expect(fetchSpy).not.toHaveBeenCalled()

    if (originalFetch) {
      globalThis.fetch = originalFetch
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch
    }
  })

  it('starts the deterministic sequence for each instance', async () => {
    const input = { title: 'Title', description: 'Description' }

    await expect(new FakeTicketProvider().createTicket(input)).resolves.toMatchObject({
      id: 'fake-ticket-1'
    })
    await expect(new FakeTicketProvider().createTicket(input)).resolves.toMatchObject({
      id: 'fake-ticket-1'
    })
  })

  it('snapshots mutable input fields', async () => {
    const provider = new FakeTicketProvider()
    const labels = ['feature']

    await provider.createTicket({
      title: 'Title',
      description: 'Description',
      labels
    })
    labels.push('mutated')

    expect(provider.createdInputs).toEqual([
      {
        title: 'Title',
        description: 'Description',
        labels: ['feature']
      }
    ])
  })

  it('does not create a ticket when the request is already aborted', async () => {
    const provider = new FakeTicketProvider()
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.createTicket(
        { title: 'Title', description: 'Description' },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(provider.createdInputs).toHaveLength(0)
  })
})
