import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { changeLanguage } from '../i18n/config'
import { InviteeMock } from './inviteeMock'

describe('InviteeMock', () => {
  beforeEach(async () => {
    await changeLanguage('en')
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'invitee-new-item')
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn()
    })
  })

  it('keeps add, purchase, and restore interactions entirely local', async () => {
    const user = userEvent.setup()
    render(<InviteeMock />)

    await user.type(screen.getByRole('textbox', { name: 'Item name' }), 'Apples')
    await user.click(screen.getByRole('button', { name: /Add/ }))
    expect(screen.getByText('Apples')).toBeInTheDocument()

    const milkRow = screen.getByText('חלב').closest('li')
    expect(milkRow).not.toBeNull()
    await user.click(within(milkRow!).getByRole('checkbox'))
    expect(screen.queryByText('חלב')).not.toBeInTheDocument()

    const collapsedSections = screen.getAllByRole('button').filter(button =>
      button.hasAttribute('aria-controls') && button.getAttribute('aria-expanded') === 'false'
    )
    expect(collapsedSections).toHaveLength(1)
    await user.click(collapsedSections[0])
    expect(screen.getByText('חלב')).toBeInTheDocument()

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('exposes collapsible categories and the local-preview privacy boundary', () => {
    render(<InviteeMock />)

    expect(screen.getByText(/Changes stay in this local preview/)).toBeInTheDocument()
    expect(screen.getByText(/Other lists, stock, and receipts stay private/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dairy & eggs/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Vegetables/ })).toHaveAttribute('aria-expanded', 'true')
  })
})
