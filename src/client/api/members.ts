export type MemberSummary = {
  email: string
  status: 'pending' | 'approved'
  notificationLanguage: 'he' | 'en'
}

export type ListMembershipSummary = {
  listId: string
  name: string
  ownerEmail: string
  isOwner: boolean
  members: MemberSummary[]
}

type MembersApiClientOptions = {
  getIdToken(): Promise<string | undefined>
  fetch?: typeof fetch
}

const segment = (value: string) => encodeURIComponent(value)

export class MembersApiError extends Error {
  constructor(readonly status: number) {
    super(`members_request_${status}`)
    this.name = 'MembersApiError'
  }
}

export const createMembersApiClient = ({
  getIdToken,
  fetch: fetchImplementation = fetch
}: MembersApiClientOptions) => {
  const request = async <Result>(path: string, init: RequestInit = {}): Promise<Result> => {
    const token = await getIdToken()
    const response = await fetchImplementation(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    })
    if (!response.ok) throw new MembersApiError(response.status)
    if (response.status === 204) return undefined as Result
    return response.json() as Promise<Result>
  }
  const collection = (listId: string) => `/api/lists/${segment(listId)}/members`

  return {
    getSummary: (listId: string) => request<ListMembershipSummary>(collection(listId)),
    invite: (listId: string, email: string, notificationLanguage: 'he' | 'en') =>
      request<void>(collection(listId), {
        method: 'POST',
        body: JSON.stringify({ email, notificationLanguage })
      }),
    revoke: (listId: string, email: string) =>
      request<void>(`${collection(listId)}/${segment(email)}`, { method: 'DELETE' }),
    setNotificationLanguage: (
      listId: string,
      email: string,
      notificationLanguage: 'he' | 'en'
    ) => request<void>(`${collection(listId)}/${segment(email)}`, {
      method: 'PATCH',
      body: JSON.stringify({ notificationLanguage })
    }),
    leave: (listId: string) => request<void>(collection(listId), { method: 'DELETE' })
  }
}

export type MembersApiClient = ReturnType<typeof createMembersApiClient>
