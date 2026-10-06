export type GroceryApiClientOptions = {
  getIdToken(): Promise<string | undefined>
  fetch?: typeof fetch
}

export type AddGroceryRequest = {
  operationId?: string
  name: string
  category: string
  listName?: string | null
  quantity?: number | null
  unit?: string | null
}

export type UpdateGroceryRequest = {
  name?: string
  category?: string
  listName?: string | null
  note?: string | null
  quantity?: number | null
  unit?: string | null
}

export class GroceryApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'GroceryApiError'
  }
}

const pathSegment = (value: string): string => encodeURIComponent(value)

export const createGroceryApiClient = ({
  getIdToken,
  fetch: fetchImplementation = fetch
}: GroceryApiClientOptions) => {
  const request = async <Result>(path: string, init: RequestInit): Promise<Result> => {
    const token = await getIdToken()
    const response = await fetchImplementation(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    })

    if (!response.ok) {
      let error: { code?: string; message?: string } = {}
      try {
        const body = (await response.json()) as { error?: typeof error }
        error = body.error ?? {}
      } catch {
        // Preserve a typed, non-provider-specific failure for malformed responses.
      }
      throw new GroceryApiError(
        response.status,
        error.code ?? 'REQUEST_FAILED',
        error.message ?? 'Grocery request failed'
      )
    }

    if (response.status === 204) return undefined as Result
    return (await response.json()) as Result
  }

  const collection = (listId: string) =>
    `/api/lists/${pathSegment(listId)}/groceries`
  const item = (listId: string, itemId: string) =>
    `${collection(listId)}/${pathSegment(itemId)}`

  const pendingAdds = new Map<string, string>()

  return {
    add: async (listId: string, input: AddGroceryRequest) => {
      const intent = JSON.stringify([listId, input])
      const operationId = input.operationId ?? pendingAdds.get(intent) ?? crypto.randomUUID()
      pendingAdds.set(intent, operationId)
      const result = await request<{ key: string }>(collection(listId), {
        method: 'POST', body: JSON.stringify({ ...input, operationId })
      })
      pendingAdds.delete(intent)
      return result
    },
    update: (listId: string, itemId: string, input: UpdateGroceryRequest) =>
      request<void>(item(listId, itemId), {
        method: 'PATCH',
        body: JSON.stringify(input)
      }),
    setPurchased: (listId: string, itemId: string, bought: boolean) =>
      request<void>(`${item(listId, itemId)}/purchased`, {
        method: 'PUT',
        body: JSON.stringify({ bought })
      }),
    delete: (listId: string, itemId: string) =>
      request<void>(item(listId, itemId), { method: 'DELETE' })
  }
}

export type GroceryApiClient = ReturnType<typeof createGroceryApiClient>
