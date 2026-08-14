import { z } from 'zod'

export const ticketPrioritySchema = z.enum(['low', 'medium', 'high'])

export const createTicketInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(10_000),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  priority: ticketPrioritySchema.optional()
})

export const createdTicketSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().url(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(10_000)
})

export type TicketPriority = z.infer<typeof ticketPrioritySchema>
export type CreateTicketInput = z.infer<typeof createTicketInputSchema>
export type CreatedTicket = z.infer<typeof createdTicketSchema>
