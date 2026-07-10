import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackModal from './FeedbackModal'
import { submitFeedback } from '../lib/firebase'
import { useAuth } from '../hooks/AuthContext'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'he' }
  })
}))

// Mock at the ../lib/firebase boundary — the component's own logic (validation,
// double-submit guard, success/error state) is under test, not the network call.
jest.mock('../lib/firebase', () => ({
  submitFeedback: jest.fn()
}))

jest.mock('../hooks/AuthContext', () => ({
  useAuth: jest.fn()
}))

// FeedbackModal reads the current route via useRouterState to attach it to the payload.
jest.mock('@tanstack/react-router', () => ({
  useRouterState: () => '/stock'
}))

const mockUser = { email: 'muli.turiel@gmail.com', displayName: 'Muli Turiel' }

describe('FeedbackModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({ user: mockUser })
  })

  it('shows a validation error and does not submit when the request is empty', async () => {
    const user = userEvent.setup()
    render(<FeedbackModal onClose={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(screen.getByText('feedback:requestRequired')).toBeInTheDocument()
    expect(submitFeedback).not.toHaveBeenCalled()
  })

  it('submits the request with auto-populated route/user/language and shows the success state', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: false })
    const user = userEvent.setup()
    render(<FeedbackModal onClose={jest.fn()} />)

    await user.type(screen.getByRole('textbox'), 'add a dark mode')
    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(submitFeedback).toHaveBeenCalledWith({
      request: 'add a dark mode',
      route: '/stock',
      user: mockUser,
      language: 'he'
    })
    expect(await screen.findByText('feedback:success')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'feedback:sendAnother' })).toBeInTheDocument()
  })

  it('shows a recoverable error message when submission fails', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: true, message: 'boom' })
    const user = userEvent.setup()
    render(<FeedbackModal onClose={jest.fn()} />)

    await user.type(screen.getByRole('textbox'), 'add a dark mode')
    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(await screen.findByText('feedback:error')).toBeInTheDocument()
    // The success state must NOT show on failure — the request isn't lost.
    expect(screen.queryByText('feedback:success')).not.toBeInTheDocument()
  })

  it('trims whitespace before submitting', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: false })
    const user = userEvent.setup()
    render(<FeedbackModal onClose={jest.fn()} />)

    await user.type(screen.getByRole('textbox'), '   milk shortage   ')
    await user.click(screen.getByRole('button', { name: 'feedback:submit' }))

    expect(submitFeedback).toHaveBeenCalledWith(expect.objectContaining({ request: 'milk shortage' }))
  })
})
