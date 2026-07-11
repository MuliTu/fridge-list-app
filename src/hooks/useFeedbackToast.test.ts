import { renderHook, act, waitFor } from '@testing-library/react'
import { useFeedbackToast } from './useFeedbackToast'
import { submitFeedback } from '../lib/firebase'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'he' } })
}))

jest.mock('../lib/firebase', () => ({
  submitFeedback: jest.fn()
}))

jest.mock('../hooks/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'muli.turiel@gmail.com', displayName: 'Muli Turiel' } })
}))

// The hook reads the current route via useRouterState to attach it to the payload.
jest.mock('@tanstack/react-router', () => ({
  useRouterState: () => '/stock'
}))

describe('useFeedbackToast', () => {
  beforeEach(() => jest.clearAllMocks())

  it('starts with no toast', () => {
    const { result } = renderHook(() => useFeedbackToast())
    expect(result.current.toast).toBeNull()
  })

  it('shows a pending toast immediately, then success once the submission resolves', async () => {
    let resolve!: (v: { error: boolean }) => void
    ;(submitFeedback as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useFeedbackToast())

    act(() => {
      result.current.submit('add a dark mode')
    })
    expect(result.current.toast?.status).toBe('pending')
    expect(submitFeedback).toHaveBeenCalledWith({
      request: 'add a dark mode',
      route: '/stock',
      user: { email: 'muli.turiel@gmail.com', displayName: 'Muli Turiel' },
      language: 'he'
    })

    await act(async () => {
      resolve({ error: false })
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('success'))
  })

  it('resolves to an error toast when the submission fails', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: true, message: 'boom' })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('add a dark mode')
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('error'))
  })

  it('trims the request and ignores an empty/whitespace-only submit', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: false })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('   ')
    })
    expect(submitFeedback).not.toHaveBeenCalled()
    expect(result.current.toast).toBeNull()

    await act(async () => {
      await result.current.submit('  milk shortage  ')
    })
    expect(submitFeedback).toHaveBeenCalledWith(expect.objectContaining({ request: 'milk shortage' }))
  })

  it('dismiss clears the active toast', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: false })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('add a dark mode')
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('success'))

    act(() => result.current.dismiss())
    expect(result.current.toast).toBeNull()
  })
})
