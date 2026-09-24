import { renderHook, act } from '@testing-library/react'
import { useListSort } from '../../src/hooks/useListSort'

const STORAGE_KEY = 'listSortByUserList'

describe('useListSort', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "default" when localStorage is empty', () => {
    const { result } = renderHook(() => useListSort('__permanent__', 'muli@example.com'))
    expect(result.current.sortOption).toBe('default')
  })

  it('setSortOption updates the current value', () => {
    const { result } = renderHook(() => useListSort('__permanent__', 'muli@example.com'))

    act(() => result.current.setSortOption('name-asc'))

    expect(result.current.sortOption).toBe('name-asc')
  })

  it('keeps the preference separate per list for the same user', () => {
    const permanent = renderHook(() => useListSort('__permanent__', 'muli@example.com'))
    const party = renderHook(() => useListSort('מסיבה', 'muli@example.com'))

    act(() => permanent.result.current.setSortOption('name-asc'))

    expect(permanent.result.current.sortOption).toBe('name-asc')
    expect(party.result.current.sortOption).toBe('default')
  })

  it('keeps the preference separate per user for the same list (Scenario 6)', () => {
    const userA = renderHook(() => useListSort('__permanent__', 'a@example.com'))
    const userB = renderHook(() => useListSort('__permanent__', 'b@example.com'))

    act(() => userA.result.current.setSortOption('updated-desc'))

    expect(userA.result.current.sortOption).toBe('updated-desc')
    expect(userB.result.current.sortOption).toBe('default')
  })

  it('persists the preference to localStorage', () => {
    const { result } = renderHook(() => useListSort('__permanent__', 'muli@example.com'))

    act(() => result.current.setSortOption('name-desc'))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')).toEqual({
      'muli@example.com:__permanent__': 'name-desc'
    })
  })

  it('restores a previously stored preference on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'muli@example.com:__permanent__': 'updated-asc' }))

    const { result } = renderHook(() => useListSort('__permanent__', 'muli@example.com'))

    expect(result.current.sortOption).toBe('updated-asc')
  })

  it('falls back to "default" if localStorage holds malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')

    const { result } = renderHook(() => useListSort('__permanent__', 'muli@example.com'))

    expect(result.current.sortOption).toBe('default')
  })

  it('falls back to an "anon" bucket when no user email is available', () => {
    const { result } = renderHook(() => useListSort('__permanent__', null))

    act(() => result.current.setSortOption('name-asc'))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')).toEqual({
      'anon:__permanent__': 'name-asc'
    })
  })
})
