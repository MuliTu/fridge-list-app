import { render, screen } from '@testing-library/react'
import { ActiveListLabel } from '../../src/components/ActiveListLabel'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

describe('ActiveListLabel', () => {
  it('labels the permanent list using the translated permanent-list name', () => {
    render(<ActiveListLabel activeList={null} />)
    expect(
      screen.getByText(
        'shoppingList:listPicker.activeListLabel:{"listName":"shoppingList:listPicker.permanentList"}'
      )
    ).toBeInTheDocument()
  })

  it('labels a custom list using its raw, untranslated name', () => {
    render(<ActiveListLabel activeList="מסיבה" />)
    expect(
      screen.getByText('shoppingList:listPicker.activeListLabel:{"listName":"מסיבה"}')
    ).toBeInTheDocument()
  })

  it('updates the label when the active list changes', () => {
    const { rerender } = render(<ActiveListLabel activeList={null} />)
    expect(
      screen.getByText(
        'shoppingList:listPicker.activeListLabel:{"listName":"shoppingList:listPicker.permanentList"}'
      )
    ).toBeInTheDocument()

    rerender(<ActiveListLabel activeList="טיול" />)
    expect(
      screen.getByText('shoppingList:listPicker.activeListLabel:{"listName":"טיול"}')
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'shoppingList:listPicker.activeListLabel:{"listName":"shoppingList:listPicker.permanentList"}'
      )
    ).not.toBeInTheDocument()
  })
})
