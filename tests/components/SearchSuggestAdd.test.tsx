import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchSuggestAdd } from '../../src/components/SearchSuggestAdd'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

describe('SearchSuggestAdd', () => {
  it('renders the no-results copy and a suggest-add button, both carrying the query', () => {
    render(<SearchSuggestAdd query="banana" onSuggestAdd={jest.fn()} />)

    expect(screen.getByText('shoppingList:search.noResults:{"query":"banana"}')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'shoppingList:search.suggestAdd:{"query":"banana"}' })
    ).toBeInTheDocument()
  })

  it('calls onSuggestAdd when the button is clicked', async () => {
    const user = userEvent.setup()
    const onSuggestAdd = jest.fn()
    render(<SearchSuggestAdd query="banana" onSuggestAdd={onSuggestAdd} />)

    await user.click(screen.getByRole('button', { name: /suggestAdd/ }))
    expect(onSuggestAdd).toHaveBeenCalledTimes(1)
  })
})
