import { renderHook, act, waitFor } from '@testing-library/react'
import { useOnboarding } from './useOnboarding'
import { getOnboardingDismissed, setOnboardingDismissed } from '../lib/firebase'

jest.mock('../lib/firebase', () => ({
  getOnboardingDismissed: jest.fn(),
  setOnboardingDismissed: jest.fn()
}))

describe('useOnboarding', () => {
  beforeEach(() => {
    ;(getOnboardingDismissed as jest.Mock).mockReset()
    ;(setOnboardingDismissed as jest.Mock).mockReset().mockResolvedValue(undefined)
  })

  it('never opens when there is no signed-in email', () => {
    const { result } = renderHook(() => useOnboarding(null))

    expect(result.current.isOpen).toBe(false)
    expect(getOnboardingDismissed).not.toHaveBeenCalled()
  })

  it('opens once Firebase resolves with no prior dismissal', async () => {
    ;(getOnboardingDismissed as jest.Mock).mockResolvedValue(false)
    const { result } = renderHook(() => useOnboarding('owner@example.com'))

    expect(result.current.isOpen).toBe(false)
    await waitFor(() => expect(result.current.isOpen).toBe(true))
  })

  it('stays closed when Firebase resolves with a prior dismissal', async () => {
    ;(getOnboardingDismissed as jest.Mock).mockResolvedValue(true)
    const { result } = renderHook(() => useOnboarding('owner@example.com'))

    await waitFor(() => expect(getOnboardingDismissed).toHaveBeenCalledWith('owner@example.com'))
    expect(result.current.isOpen).toBe(false)
  })

  it('close(false) hides the modal but does not persist dismissal', async () => {
    ;(getOnboardingDismissed as jest.Mock).mockResolvedValue(false)
    const { result } = renderHook(() => useOnboarding('owner@example.com'))
    await waitFor(() => expect(result.current.isOpen).toBe(true))

    act(() => result.current.close(false))

    expect(result.current.isOpen).toBe(false)
    expect(setOnboardingDismissed).not.toHaveBeenCalled()
  })

  it('close(true) hides the modal and persists dismissal to Firebase', async () => {
    ;(getOnboardingDismissed as jest.Mock).mockResolvedValue(false)
    const { result } = renderHook(() => useOnboarding('owner@example.com'))
    await waitFor(() => expect(result.current.isOpen).toBe(true))

    act(() => result.current.close(true))

    expect(result.current.isOpen).toBe(false)
    expect(setOnboardingDismissed).toHaveBeenCalledWith('owner@example.com')
  })

  it('replay() reopens the modal even after a persisted dismissal', async () => {
    ;(getOnboardingDismissed as jest.Mock).mockResolvedValue(true)
    const { result } = renderHook(() => useOnboarding('owner@example.com'))
    await waitFor(() => expect(getOnboardingDismissed).toHaveBeenCalled())
    expect(result.current.isOpen).toBe(false)

    act(() => result.current.replay())

    expect(result.current.isOpen).toBe(true)
  })
})
