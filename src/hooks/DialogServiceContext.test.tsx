import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DialogServiceProvider, useDialogService } from './DialogServiceContext'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'actions.cancel': 'Cancel',
      'actions.confirm': 'Confirm',
      'actions.ok': 'OK'
    }[key] ?? key)
  })
}))

function ConfirmHarness() {
  const { confirm } = useDialogService()
  const [result, setResult] = useState('none')
  return (
    <>
      <button onClick={async () => setResult(String(await confirm('Delete “Weekend trip” with 2 items?')))}>
        Delete list
      </button>
      <output>{result}</output>
    </>
  )
}

describe('DialogServiceProvider confirmation accessibility', () => {
  it('moves focus into the confirmation, supports Escape cancellation, and keyboard confirmation', async () => {
    const user = userEvent.setup()
    render(<DialogServiceProvider><ConfirmHarness /></DialogServiceProvider>)

    await user.click(screen.getByRole('button', { name: 'Delete list' }))
    expect(screen.getByText('Delete “Weekend trip” with 2 items?')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'))

    await user.click(screen.getByRole('button', { name: 'Delete list' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('true'))
  })
})
