import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackModal } from '../../src/components/FeedbackModal'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'he' }
  })
}))

// FeedbackModal is now a "dumb" form: it validates + trims, then hands the request
// off to onSubmit and closes. The actual network submission + status toast live in
// the parent (useFeedbackToast), tested separately — so nothing here touches firebase.

describe('FeedbackModal', () => {
  it('shows a validation error and does not submit or close when the request is empty', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    const onClose = jest.fn()
    render(<FeedbackModal onClose={onClose} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(screen.getByText('feedback:requestRequired')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hands the trimmed request to onSubmit and closes immediately (non-blocking)', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    const onClose = jest.fn()
    render(<FeedbackModal onClose={onClose} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), '   add a dark mode   ')
    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(onSubmit).toHaveBeenCalledWith('add a dark mode')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes without submitting when cancel is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    const onClose = jest.fn()
    render(<FeedbackModal onClose={onClose} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'common:actions.cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
