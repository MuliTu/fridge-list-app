import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListPicker } from '../../src/components/ListPicker'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const baseProps = {
  activeList: null as string | null,
  customLists: [] as string[],
  onSelectList: jest.fn()
}

describe('ListPicker', () => {
  afterEach(() => jest.clearAllMocks())

  it('always renders the permanent list pill', () => {
    render(<ListPicker {...baseProps} />)
    expect(screen.getByText('shoppingList:listPicker.permanentList')).toBeInTheDocument()
  })

  it('renders a pill per custom list', () => {
    render(<ListPicker {...baseProps} customLists={['מסיבה', 'טיול']} />)
    expect(screen.getByText('מסיבה')).toBeInTheDocument()
    expect(screen.getByText('טיול')).toBeInTheDocument()
  })

  it('calls onSelectList(null) when the permanent list pill is clicked', async () => {
    const onSelectList = jest.fn()
    const user = userEvent.setup()
    render(<ListPicker {...baseProps} onSelectList={onSelectList} />)

    await user.click(screen.getByText('shoppingList:listPicker.permanentList'))
    expect(onSelectList).toHaveBeenCalledWith(null)
  })

  it('calls onSelectList(name) when a custom list pill is clicked', async () => {
    const onSelectList = jest.fn()
    const user = userEvent.setup()
    render(<ListPicker {...baseProps} customLists={['מסיבה']} onSelectList={onSelectList} />)

    await user.click(screen.getByText('מסיבה'))
    expect(onSelectList).toHaveBeenCalledWith('מסיבה')
  })

  it('does not render list-management actions (they live in the sidebar now)', () => {
    render(<ListPicker {...baseProps} activeList="מסיבה" />)
    expect(screen.queryByText('shoppingList:listPicker.newList')).not.toBeInTheDocument()
    expect(screen.queryByText('shoppingList:listPicker.deleteList')).not.toBeInTheDocument()
    expect(screen.queryByText('shoppingList:listPicker.bulkUpload')).not.toBeInTheDocument()
    expect(screen.queryByText('shoppingList:listPicker.shareMissing')).not.toBeInTheDocument()
  })
})
