export type ReceiptSaveInput = {
  store_name: string | null
  items: Array<{ name: string; price: number; quantity: number }>
  total: number | null
  source_url: string | null
}

export class ReceiptApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ReceiptApiError'
  }
}

type ReceiptApiDependencies = {
  getIdToken(): Promise<string | null>
  fetch?: typeof fetch
}

const encodeBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const segment = (value: string): string => encodeURIComponent(value)

export const createReceiptApiClient = (dependencies: ReceiptApiDependencies) => {
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const token = await dependencies.getIdToken()
    const response = await (dependencies.fetch ?? globalThis.fetch)(url, {
      ...init,
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers
      }
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: unknown }
      throw new ReceiptApiError(
        response.status,
        typeof body.message === 'string' ? body.message : `Receipt request failed (${response.status})`
      )
    }
    return response
  }

  return {
    async save(listId: string, input: ReceiptSaveInput, image: Blob | null) {
      const response = await request(`/api/lists/${segment(listId)}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          image: image
            ? { data: await encodeBase64(image), contentType: image.type || 'application/octet-stream' }
            : null
        })
      })
      return response.json() as Promise<{ key: string; imageSkipped: boolean }>
    },

    async delete(listId: string, receiptId: string): Promise<void> {
      await request(`/api/lists/${segment(listId)}/receipts/${segment(receiptId)}`, {
        method: 'DELETE'
      })
    },

    async getImage(listId: string, receiptId: string): Promise<string> {
      const response = await request(
        `/api/lists/${segment(listId)}/receipts/${segment(receiptId)}/image`
      )
      const body = await response.json() as { dataUrl: string }
      return body.dataUrl
    }
  }
}

export type ReceiptApiClient = ReturnType<typeof createReceiptApiClient>
