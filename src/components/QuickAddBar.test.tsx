import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickAddBar from './QuickAddBar'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

describe('QuickAddBar', () => {
  it('submits a trimmed item on Enter and clears the input', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, '  חלב{Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('חלב'))
    expect(input).toHaveValue('')
  })

  it('does not submit an empty value', async () => {
    const onAdd = jest.fn()
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)

    await user.type(screen.getByLabelText('shoppingList:quickAdd.label'), '   {Enter}')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps the value and announces an error when adding fails', async () => {
    const onAdd = jest.fn().mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<QuickAddBar onAdd={onAdd} />)
    const input = screen.getByLabelText('shoppingList:quickAdd.label')

    await user.type(input, 'חלב{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(input).toHaveValue('חלב')
  })
})
