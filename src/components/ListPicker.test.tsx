import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ListPicker from './ListPicker'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const baseProps = {
  activeList: null as string | null,
  customLists: [] as string[],
  canEdit: false,
  hasUnbought: false,
  onSelectList: jest.fn(),
  onCreateList: jest.fn(),
  onDeleteList: jest.fn(),
  onShareMissing: jest.fn(),
  onBulkUpload: jest.fn()
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

  it('hides "new list" and "delete list" when the viewer cannot edit', () => {
    render(<ListPicker {...baseProps} canEdit={false} activeList="מסיבה" />)
    expect(screen.queryByText('shoppingList:listPicker.newList')).not.toBeInTheDocument()
    expect(screen.queryByText('shoppingList:listPicker.deleteList')).not.toBeInTheDocument()
  })

  it('shows "new list" when editable, but hides "delete list" while on the permanent list', () => {
    render(<ListPicker {...baseProps} canEdit={true} activeList={null} />)
    expect(screen.getByText('shoppingList:listPicker.newList')).toBeInTheDocument()
    expect(screen.queryByText('shoppingList:listPicker.deleteList')).not.toBeInTheDocument()
  })

  it('shows "delete list" when editable and viewing a custom list', () => {
    render(<ListPicker {...baseProps} canEdit={true} activeList="מסיבה" />)
    expect(screen.getByText('shoppingList:listPicker.deleteList')).toBeInTheDocument()
  })

  it('only shows "share missing" when there are unbought items', () => {
    const { rerender } = render(<ListPicker {...baseProps} hasUnbought={false} />)
    expect(screen.queryByText('shoppingList:listPicker.shareMissing')).not.toBeInTheDocument()

    rerender(<ListPicker {...baseProps} hasUnbought={true} />)
    expect(screen.getByText('shoppingList:listPicker.shareMissing')).toBeInTheDocument()
  })
})
