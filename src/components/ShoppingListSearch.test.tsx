import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShoppingListSearch from './ShoppingListSearch'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

describe('ShoppingListSearch', () => {
  afterEach(() => jest.clearAllMocks())

  it('renders the search input with its accessible label', () => {
    render(<ShoppingListSearch value="" onChange={jest.fn()} />)
    expect(screen.getByLabelText('shoppingList:search.label')).toBeInTheDocument()
  })

  it('reflects the current value', () => {
    render(<ShoppingListSearch value="milk" onChange={jest.fn()} />)
    expect(screen.getByLabelText('shoppingList:search.label')).toHaveValue('milk')
  })

  it('calls onChange as the user types', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<ShoppingListSearch value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('shoppingList:search.label'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('hides the clear button when the query is empty', () => {
    render(<ShoppingListSearch value="" onChange={jest.fn()} />)
    expect(screen.queryByLabelText('shoppingList:search.clear')).not.toBeInTheDocument()
  })

  it('shows a clear button that resets the value when there is a query', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<ShoppingListSearch value="milk" onChange={onChange} />)

    await user.click(screen.getByLabelText('shoppingList:search.clear'))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
