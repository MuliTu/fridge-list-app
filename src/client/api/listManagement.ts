export type ListDeletionResult = {
  deletedItems: number
}

export type ListManagementApiClientOptions = {
  getIdToken(): Promise<string | undefined>
  fetch?: typeof fetch
}

export class ListManagementApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ListManagementApiError'
  }
}

const isListDeletionResult = (value: unknown): value is ListDeletionResult => {
  if (!value || typeof value !== 'object') return false
  const deletedItems = (value as { deletedItems?: unknown }).deletedItems
  return Number.isInteger(deletedItems) && (deletedItems as number) >= 0
}

export const createListManagementApiClient = ({
  getIdToken,
  fetch: fetchImplementation
}: ListManagementApiClientOptions) => ({
  deleteCustomList: async (listId: string, listName: string): Promise<ListDeletionResult> => {
    const token = await getIdToken()
    const response = await (fetchImplementation ?? globalThis.fetch)(
      `/api/lists/${encodeURIComponent(listId)}/shopping-lists/${encodeURIComponent(listName)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }
    )

    if (!response.ok) {
      let error: { code?: string; message?: string } = {}
      try {
        const body = (await response.json()) as { error?: typeof error }
        error = body.error ?? {}
      } catch {
        // Keep provider details out of the client-facing fallback.
      }
      throw new ListManagementApiError(
        response.status,
        error.code ?? 'REQUEST_FAILED',
        error.message ?? 'List deletion failed'
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ListManagementApiError(response.status, 'INVALID_RESPONSE', 'List deletion response was invalid')
    }
    if (!isListDeletionResult(body)) {
      throw new ListManagementApiError(response.status, 'INVALID_RESPONSE', 'List deletion response was invalid')
    }
    return body
  }
})

export type ListManagementApiClient = ReturnType<typeof createListManagementApiClient>
