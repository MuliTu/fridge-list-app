import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShoppingListTopPanel, { SHOPPING_TOP_COLLAPSED_KEY } from './ShoppingListTopPanel'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('ShoppingListTopPanel', () => {
  beforeEach(() => localStorage.clear())

  it('hides and restores the top controls with an accessible toggle', async () => {
    const user = userEvent.setup()
    const onCollapse = jest.fn()
    const onCollapsedChange = jest.fn()
    render(
      <ShoppingListTopPanel onCollapse={onCollapse} onCollapsedChange={onCollapsedChange}>
        <div>top controls</div>
      </ShoppingListTopPanel>
    )

    const button = screen.getByRole('button', { name: 'topPanel.hide' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('top controls')).toBeVisible()

    await user.click(button)

    expect(screen.getByRole('button', { name: 'topPanel.show' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('top controls')).not.toBeVisible()
    expect(localStorage.getItem(SHOPPING_TOP_COLLAPSED_KEY)).toBe('true')
    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true)
  })

  it('restores a collapsed preference after mount', async () => {
    localStorage.setItem(SHOPPING_TOP_COLLAPSED_KEY, 'true')
    render(<ShoppingListTopPanel><div>top controls</div></ShoppingListTopPanel>)

    await waitFor(() => expect(screen.getByRole('button', { name: 'topPanel.show' })).toBeInTheDocument())
    expect(screen.getByText('top controls')).not.toBeVisible()
  })
})
