import { render, screen, act } from '@testing-library/react'
import { FeedbackStatusToast } from '../../src/components/FeedbackStatusToast'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('FeedbackStatusToast', () => {
  it('renders nothing when there is no toast', () => {
    const { container } = render(<FeedbackStatusToast toast={null} onDismiss={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces status via role=status and shows the pending message with a spinner', () => {
    render(<FeedbackStatusToast toast={{ id: 1, status: 'pending' }} onDismiss={jest.fn()} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('feedback:statusPending')
    expect(toast.querySelector('.feedback-toast-spinner')).toBeInTheDocument()
  })

  it('shows the success message without a spinner', () => {
    render(<FeedbackStatusToast toast={{ id: 1, status: 'success' }} onDismiss={jest.fn()} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('feedback:success')
    expect(toast.querySelector('.feedback-toast-spinner')).not.toBeInTheDocument()
  })

  it('shows the error message on failure', () => {
    render(<FeedbackStatusToast toast={{ id: 1, status: 'error' }} onDismiss={jest.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('feedback:error')
  })

  it('auto-dismisses a terminal toast after the timeout, but never a pending one', () => {
    jest.useFakeTimers()
    try {
      const onDismiss = jest.fn()
      const { rerender } = render(
        <FeedbackStatusToast toast={{ id: 1, status: 'pending' }} onDismiss={onDismiss} />
      )
      act(() => {
        jest.advanceTimersByTime(10000)
      })
      expect(onDismiss).not.toHaveBeenCalled()

      rerender(<FeedbackStatusToast toast={{ id: 1, status: 'success' }} onDismiss={onDismiss} />)
      act(() => {
        jest.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
