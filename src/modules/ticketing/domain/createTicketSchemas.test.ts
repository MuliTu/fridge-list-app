import { createTicketInputSchema, createdTicketSchema } from './createTicketSchemas'

describe('createTicketInputSchema', () => {
  it('trims and accepts the provider-neutral ticket fields', () => {
    expect(
      createTicketInputSchema.parse({
        title: '  Shared lists  ',
        description: '  Let household members share a list.  ',
        labels: ['  feature  '],
        priority: 'medium'
      })
    ).toEqual({
      title: 'Shared lists',
      description: 'Let household members share a list.',
      labels: ['feature'],
      priority: 'medium'
    })
  })

  it.each([
    { title: '', description: 'Description' },
    { title: 'x'.repeat(121), description: 'Description' },
    { title: 'Title', description: '' },
    { title: 'Title', description: 'x'.repeat(10_001) },
    { title: 'Title', description: 'Description', priority: 'urgent' },
    { title: 'Title', description: 'Description', labels: Array(11).fill('label') }
  ])('rejects invalid tool input %#', (input) => {
    expect(createTicketInputSchema.safeParse(input).success).toBe(false)
  })
})

describe('createdTicketSchema', () => {
  it('accepts a normalized provider result', () => {
    expect(
      createdTicketSchema.parse({
        id: 'card-1',
        url: 'https://tickets.example/card-1',
        title: 'Title',
        description: 'Description'
      })
    ).toEqual({
      id: 'card-1',
      url: 'https://tickets.example/card-1',
      title: 'Title',
      description: 'Description'
    })
  })

  it('rejects malformed provider results', () => {
    expect(
      createdTicketSchema.safeParse({
        id: '',
        url: 'not-a-url',
        title: 'Title',
        description: 'Description'
      }).success
    ).toBe(false)
  })
})
