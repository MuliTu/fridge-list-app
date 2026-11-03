import { fireEvent, render, screen } from '@testing-library/react'
import { BehaviorSettingsProvider } from '../hooks/BehaviorSettingsContext'
import BehaviorSettingsModal from './BehaviorSettingsModal'
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
it('exposes behavior controls and applies changes', () => {
  localStorage.clear()
  render(<BehaviorSettingsProvider scope="test"><BehaviorSettingsModal onClose={jest.fn()} /></BehaviorSettingsProvider>)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'shoppingList:behavior.hold' }))
  const countdown = screen.getByRole('checkbox', { name: /^shoppingList:behavior.countdown/ })
  expect(countdown).toBeDisabled()
  expect(countdown).not.toBeChecked()
  fireEvent.click(screen.getByRole('radio', { name: 'shoppingList:behavior.tap' }))
  expect(countdown).not.toBeDisabled()
  expect(countdown).toBeChecked()
  fireEvent.click(screen.getByRole('radio', { name: 'shoppingList:behavior.hold' }))
  fireEvent.click(screen.getByLabelText('shoppingList:behavior.chef'))
  expect(JSON.parse(localStorage.getItem('fridge-behavior-v1:test')!)).toMatchObject({ purchaseGesture: 'hold', showChef: false })
})
