import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UsersManagementModal } from './ListMembersModal'

jest.mock('../client/api/members', () => {
  const client = {
    getSummary: jest.fn(), invite: jest.fn(), revoke: jest.fn(),
    setNotificationLanguage: jest.fn(), leave: jest.fn(async () => undefined)
  }
  return { createMembersApiClient: () => client, __client: client }
})
jest.mock('../lib/firebase', () => ({
  getCurrentUserIdToken: jest.fn(),
  sanitizeEmailKey: (value: string) => value.replace('.', '_')
}))
jest.mock('../hooks/DialogServiceContext', () => {
  const confirm = jest.fn(async () => true)
  return { useDialogService: () => ({ confirm }), __confirm: confirm }
})
jest.mock('../hooks/ListContext', () => {
  const setActiveListId = jest.fn()
  return { useActiveList: () => ({
    myLists: [
      { id: 'owner@example.com', name: 'Mine', owner: 'owner@example.com', status: 'owner' },
      { id: 'friend@example.com', name: 'Friend', owner: 'friend@example.com', status: 'approved' }
    ],
    setActiveListId
  }), __setActiveListId: setActiveListId }
})
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const api = jest.requireMock('../client/api/members').__client
const confirm = jest.requireMock('../hooks/DialogServiceContext').__confirm
const setActiveListId = jest.requireMock('../hooks/ListContext').__setActiveListId

const successfulSummaries = () => api.getSummary.mockImplementation(async (listId: string) =>
  listId === 'owner@example_com'
    ? {
        listId, name: 'Mine', ownerEmail: 'owner@example.com', isOwner: true,
        members: [{ email: 'guest@example.com', status: 'approved', notificationLanguage: 'en' }]
      }
    : { listId, name: 'Friend', ownerEmail: 'friend@example.com', isOwner: false, members: [] }
)

describe('UsersManagementModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getSummary.mockReset()
    successfulSummaries()
  })

  it('shows loading, then outgoing participants and incoming shares without another roster', async () => {
    let resolveFirst!: (value: unknown) => void
    api.getSummary.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    render(<UsersManagementModal onClose={jest.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    resolveFirst({ listId: 'friend@example_com', name: 'Friend', ownerEmail: 'friend@example.com', isOwner: false, members: [] })
    expect(await screen.findByText('Friend')).toBeInTheDocument()
    expect(screen.getByText('sharedByMe')).toBeInTheDocument()
    expect(screen.getByText('sharedWithMe')).toBeInTheDocument()
    expect(screen.queryByText('hidden@example.com')).not.toBeInTheDocument()
  })

  it('shows explicit empty sections', async () => {
    api.getSummary.mockImplementation(async (listId: string) => ({
      listId, name: listId, ownerEmail: 'owner@example.com', isOwner: true, members: []
    }))
    render(<UsersManagementModal onClose={jest.fn()} />)
    expect((await screen.findAllByText('noParticipants')).length).toBe(2)
    expect(screen.getByText('emptySharedWithMe')).toBeInTheDocument()
  })

  it('shows an error with retry and recovers', async () => {
    api.getSummary.mockRejectedValueOnce(new Error('offline'))
    render(<UsersManagementModal onClose={jest.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('loadFailed')
    successfulSummaries()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(await screen.findByText('guest@example.com')).toBeInTheDocument()
  })

  it('confirms self-leave and returns selection to the owned list without stale content', async () => {
    render(<UsersManagementModal onClose={jest.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'leave' }))
    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('friend@example_com'))
    expect(confirm).toHaveBeenCalled()
    expect(setActiveListId).toHaveBeenCalledWith('owner@example.com')
    await waitFor(() => expect(screen.queryByText('Friend')).not.toBeInTheDocument())
  })
})
