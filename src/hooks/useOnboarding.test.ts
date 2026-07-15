import { renderHook, act } from '@testing-library/react'
import { useOnboarding } from './useOnboarding'

const STORAGE_KEY = 'onboardingDismissed'

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('opens by default when nothing is stored', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.isOpen).toBe(true)
  })

  it('close(false) hides the modal but does not persist dismissal', () => {
    const { result } = renderHook(() => useOnboarding())

    act(() => result.current.close(false))

    expect(result.current.isOpen).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('close(true) hides the modal and persists dismissal', () => {
    const { result } = renderHook(() => useOnboarding())

    act(() => result.current.close(true))

    expect(result.current.isOpen).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('does not open by default on mount when dismissal was previously stored', () => {
    localStorage.setItem(STORAGE_KEY, 'true')

    const { result } = renderHook(() => useOnboarding())

    expect(result.current.isOpen).toBe(false)
  })

  it('replay() reopens the modal even after a persisted dismissal', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.isOpen).toBe(false)

    act(() => result.current.replay())

    expect(result.current.isOpen).toBe(true)
  })
})
