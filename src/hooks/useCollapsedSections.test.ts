import { renderHook, act } from '@testing-library/react'
import { useCollapsedSections } from './useCollapsedSections'

const STORAGE_KEY = 'collapsedCategories'

describe('useCollapsedSections', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with nothing collapsed when localStorage is empty', () => {
    const { result } = renderHook(() => useCollapsedSections())
    expect(result.current.isCollapsed('vegetables')).toBe(false)
  })

  it('toggle collapses a category, and toggling again expands it', () => {
    const { result } = renderHook(() => useCollapsedSections())

    act(() => result.current.toggle('vegetables'))
    expect(result.current.isCollapsed('vegetables')).toBe(true)

    act(() => result.current.toggle('vegetables'))
    expect(result.current.isCollapsed('vegetables')).toBe(false)
  })

  it('collapsing one category does not affect another', () => {
    const { result } = renderHook(() => useCollapsedSections())

    act(() => result.current.toggle('vegetables'))

    expect(result.current.isCollapsed('vegetables')).toBe(true)
    expect(result.current.isCollapsed('fruits')).toBe(false)
  })

  it('persists collapsed state to localStorage', () => {
    const { result } = renderHook(() => useCollapsedSections())

    act(() => result.current.toggle('vegetables'))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual(['vegetables'])
  })

  it('restores previously collapsed categories from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['fruits']))

    const { result } = renderHook(() => useCollapsedSections())

    expect(result.current.isCollapsed('fruits')).toBe(true)
    expect(result.current.isCollapsed('vegetables')).toBe(false)
  })

  it('falls back to nothing collapsed if localStorage holds malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')

    const { result } = renderHook(() => useCollapsedSections())

    expect(result.current.isCollapsed('vegetables')).toBe(false)
  })
})
