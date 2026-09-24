export type DataCapabilities = {
  groceries: {
    reads: 'firebase' | 'rds'
    writes: 'firebase'
  }
}

export type DataCapabilitiesClientOptions = {
  getIdToken(): Promise<string | undefined>
  fetch?: typeof fetch
}

export class DataCapabilitiesApiError extends Error {
  constructor(readonly status: number) {
    super('Data capabilities request failed')
    this.name = 'DataCapabilitiesApiError'
  }
}

export const createDataCapabilitiesClient = ({
  getIdToken,
  fetch: fetchImplementation = fetch
}: DataCapabilitiesClientOptions) => ({
  get: async (): Promise<DataCapabilities> => {
    const token = await getIdToken()
    const response = await fetchImplementation('/api/data-capabilities', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })

    if (!response.ok) throw new DataCapabilitiesApiError(response.status)
    return (await response.json()) as DataCapabilities
  }
})

export type DataCapabilitiesClient = ReturnType<typeof createDataCapabilitiesClient>
