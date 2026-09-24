import { renderHook, act } from '@testing-library/react'
import { useShowPurchased } from '../../src/hooks/useShowPurchased'

const STORAGE_KEY = 'showPurchasedByList'

describe('useShowPurchased', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to hidden (false) when localStorage is empty', () => {
    const { result } = renderHook(() => useShowPurchased('__permanent__'))
    expect(result.current.showPurchased).toBe(false)
  })

  it('toggle reveals purchased items, and toggling again hides them', () => {
    const { result } = renderHook(() => useShowPurchased('__permanent__'))

    act(() => result.current.toggle())
    expect(result.current.showPurchased).toBe(true)

    act(() => result.current.toggle())
    expect(result.current.showPurchased).toBe(false)
  })

  it('keeps the preference separate per list', () => {
    const permanent = renderHook(() => useShowPurchased('__permanent__'))
    const party = renderHook(() => useShowPurchased('מסיבה'))

    act(() => permanent.result.current.toggle())

    expect(permanent.result.current.showPurchased).toBe(true)
    // Toggling the permanent list must not reveal purchased items on another list.
    expect(party.result.current.showPurchased).toBe(false)
  })

  it('persists the preference to localStorage', () => {
    const { result } = renderHook(() => useShowPurchased('מסיבה'))

    act(() => result.current.toggle())

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')).toEqual({ מסיבה: true })
  })

  it('restores a previously stored preference on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ __permanent__: true }))

    const { result } = renderHook(() => useShowPurchased('__permanent__'))

    expect(result.current.showPurchased).toBe(true)
  })

  it('falls back to hidden if localStorage holds malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')

    const { result } = renderHook(() => useShowPurchased('__permanent__'))

    expect(result.current.showPurchased).toBe(false)
  })
})
