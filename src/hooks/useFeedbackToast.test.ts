import { renderHook, act, waitFor } from '@testing-library/react'
import { useFeedbackToast } from './useFeedbackToast'
import { createFeedbackOperationId, submitFeedback } from '../lib/firebase'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'he' } })
}))

jest.mock('../lib/firebase', () => ({
  createFeedbackOperationId: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks()
    ;(createFeedbackOperationId as jest.Mock).mockReturnValue('operation-1')
  })

  it('starts with no toast', () => {
    const { result } = renderHook(() => useFeedbackToast())
    expect(result.current.toast).toBeNull()
  })

  it('shows a pending toast immediately, then success once the submission resolves', async () => {
    let resolve!: (v: {
      error: false
      submissionId: string
      status: 'ticket_created'
    }) => void
    ;(submitFeedback as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useFeedbackToast())

    act(() => {
      result.current.submit('add a dark mode')
    })
    expect(result.current.toast?.status).toBe('pending')
    expect(submitFeedback).toHaveBeenCalledWith({
      request: 'add a dark mode',
      operationId: 'operation-1',
      route: '/stock',
      user: { email: 'muli.turiel@gmail.com', displayName: 'Muli Turiel' },
      language: 'he'
    })

    await act(async () => {
      resolve({
        error: false,
        submissionId: 'operation-1',
        status: 'ticket_created'
      })
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('success'))
  })

  it('shows a distinct saved state when dispatch is pending retry', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({
      error: false,
      submissionId: 'operation-1',
      status: 'pending'
    })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('add a dark mode')
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('saved'))
  })

  it('resolves to an error toast when the submission fails', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: true, message: 'boom' })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('add a dark mode')
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('error'))
  })

  it('reuses one logical operation id for concurrent attempts and an uncertain retry', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({ error: true, message: 'network' })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await Promise.all([
        result.current.submit('same feedback'),
        result.current.submit('same feedback')
      ])
      await result.current.submit('same feedback')
    })

    expect(createFeedbackOperationId).toHaveBeenCalledTimes(1)
    expect(submitFeedback).toHaveBeenCalledTimes(3)
    expect(submitFeedback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operationId: 'operation-1' })
    )
    expect(submitFeedback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operationId: 'operation-1' })
    )
    expect(submitFeedback).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ operationId: 'operation-1' })
    )
  })

  it('creates a fresh operation id after a definitive durable receipt', async () => {
    ;(createFeedbackOperationId as jest.Mock)
      .mockReturnValueOnce('operation-1')
      .mockReturnValueOnce('operation-2')
    ;(submitFeedback as jest.Mock).mockResolvedValue({
      error: false,
      submissionId: 'operation-1',
      status: 'ticket_created'
    })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('same feedback')
      await result.current.submit('same feedback')
    })

    expect(submitFeedback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operationId: 'operation-1' })
    )
    expect(submitFeedback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operationId: 'operation-2' })
    )
  })

  it('trims the request and ignores an empty/whitespace-only submit', async () => {
    ;(submitFeedback as jest.Mock).mockResolvedValue({
      error: false,
      submissionId: 'operation-1',
      status: 'ticket_created'
    })
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
    ;(submitFeedback as jest.Mock).mockResolvedValue({
      error: false,
      submissionId: 'operation-1',
      status: 'ticket_created'
    })
    const { result } = renderHook(() => useFeedbackToast())

    await act(async () => {
      await result.current.submit('add a dark mode')
    })
    await waitFor(() => expect(result.current.toast?.status).toBe('success'))

    act(() => result.current.dismiss())
    expect(result.current.toast).toBeNull()
  })
})
