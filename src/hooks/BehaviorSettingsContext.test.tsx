import { fireEvent, render, screen } from '@testing-library/react'
import { BehaviorSettingsProvider, useBehaviorSettings } from './BehaviorSettingsContext'

function Consumer() {
  const { settings, update, saveError } = useBehaviorSettings()
  return <><output>{JSON.stringify(settings)}</output><button onClick={() => update({ purchaseGesture: 'hold', showChef: false })}>Change</button>{saveError && <p role="alert">Storage failed</p>}</>
}
const view = (scope: string) => <BehaviorSettingsProvider key={scope} scope={scope}><Consumer /></BehaviorSettingsProvider>
beforeEach(() => localStorage.clear())
it('restores preferences after remount without leaking them to another user', () => {
  const { rerender, unmount } = render(view('alice'))
  fireEvent.click(screen.getByText('Change'))
  expect(screen.getByRole('status').textContent).toContain('"purchaseGesture":"hold"')
  rerender(view('bob'))
  expect(screen.getByRole('status').textContent).toContain('"purchaseGesture":"tap"')
  expect(screen.getByRole('status').textContent).toContain('"showChef":true')
  unmount()
  render(view('alice'))
  expect(screen.getByRole('status').textContent).toContain('"showChef":false')
})
it('uses safe defaults for corrupt stored settings', () => {
  localStorage.setItem('fridge-behavior-v1:alice', '{broken')
  render(view('alice'))
  expect(screen.getByRole('status').textContent).toContain('"purchaseGesture":"tap"')
})
it('reports storage failure while keeping the preference applied in memory', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
  render(view('alice'))
  fireEvent.click(screen.getByText('Change'))
  expect(screen.getByRole('alert')).toHaveTextContent('Storage failed')
  expect(screen.getByRole('status').textContent).toContain('"showChef":false')
  spy.mockRestore()
})
