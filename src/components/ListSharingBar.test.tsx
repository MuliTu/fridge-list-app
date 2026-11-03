import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ListSharingBar from './ListSharingBar'
import { shoppingSharingRequest } from '../client/api/shoppingSharing'

jest.mock('../client/api/shoppingSharing', () => ({ shoppingSharingRequest: jest.fn() }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: any) => values?.email ? `${key} ${values.email}` : key }) }))

const request = jest.mocked(shoppingSharingRequest)
const roster = {
  id: 'share-a', name: 'A', isOwner: true, items: [],
  owner: { email: 'owner@example.com', displayName: 'Owner', photoURL: null },
  members: [{ email: 'guest@example.com', displayName: 'Guest', photoURL: null }]
}
beforeEach(() => { request.mockReset(); request.mockResolvedValue(roster) })

it('invites only to the list opened in the dialog and shows participant avatars', async () => {
  render(<ListSharingBar householdId="owner@example_com" listName="A" />)
  await waitFor(() => expect(screen.getByTitle('Guest')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'sharing.shareList' }))
  fireEvent.change(screen.getByLabelText('sharing.email'), { target: { value: ' New@Example.com ' } })
  fireEvent.submit(screen.getByLabelText('sharing.email').closest('form')!)
  await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'invite', householdId: 'owner@example_com', listName: 'A', email: 'new@example.com' }))
})

it('removes access only from the selected list', async () => {
  render(<ListSharingBar householdId="owner@example_com" listName="B" initiallyOpen />)
  fireEvent.click(await screen.findByRole('button', { name: 'sharing.remove guest@example.com' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'revoke', householdId: 'owner@example_com', listName: 'B', email: 'guest@example.com' }))
})

it('keeps the invitation unavailable if the server cannot confirm ownership', async () => {
  request.mockRejectedValue(new Error('403'))
  render(<ListSharingBar householdId="owner@example_com" listName="A" initiallyOpen />)
  expect(await screen.findByRole('alert')).toHaveTextContent('sharing.failed')
  expect(screen.getByRole('button', { name: 'sharing.add' })).toBeDisabled()
})
