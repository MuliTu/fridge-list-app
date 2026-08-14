import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserSettingsPanel from './UserSettingsPanel'
import { changeLanguage } from '../i18n/config'
import { useBoughtItemsPreference } from '../hooks/BoughtItemsPreferenceContext'
import { useStockSuggestion } from '../hooks/useStockSuggestion'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'he' }
  })
}))

jest.mock('../i18n/config', () => ({
  changeLanguage: jest.fn(),
  SUPPORTED_LANGUAGES: ['he', 'en']
}))

jest.mock('../hooks/BoughtItemsPreferenceContext', () => ({
  useBoughtItemsPreference: jest.fn()
}))

jest.mock('../hooks/useStockSuggestion', () => ({
  useStockSuggestion: jest.fn()
}))

const toggleBoughtItemsPlacement = jest.fn().mockResolvedValue(undefined)
const toggleStockSuggestion = jest.fn()

describe('UserSettingsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useBoughtItemsPreference as jest.Mock).mockReturnValue({
      keepBoughtItemsInCategories: false,
      isResolved: true,
      saveError: false,
      toggleBoughtItemsPlacement
    })
    ;(useStockSuggestion as jest.Mock).mockReturnValue({
      enabled: true,
      toggle: toggleStockSuggestion
    })
  })

  it('renders all personal preferences as clearly named controls', () => {
    render(<UserSettingsPanel />)

    expect(screen.getByRole('button', { name: /settings.language.title/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /settings.boughtItems.title/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: /settings.stockSuggestion.title/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('changes language and both shopping preferences', async () => {
    const user = userEvent.setup()
    render(<UserSettingsPanel />)

    await user.click(screen.getByRole('button', { name: /settings.language.title/ }))
    await user.click(screen.getByRole('button', { name: /settings.boughtItems.title/ }))
    await user.click(screen.getByRole('button', { name: /settings.stockSuggestion.title/ }))

    expect(changeLanguage).toHaveBeenCalledWith('en')
    expect(toggleBoughtItemsPlacement).toHaveBeenCalledTimes(1)
    expect(toggleStockSuggestion).toHaveBeenCalledTimes(1)
  })

  it('disables the persisted preference while it loads and announces save failures', () => {
    ;(useBoughtItemsPreference as jest.Mock).mockReturnValue({
      keepBoughtItemsInCategories: false,
      isResolved: false,
      saveError: true,
      toggleBoughtItemsPlacement
    })

    render(<UserSettingsPanel />)

    expect(screen.getByRole('button', { name: /settings.boughtItems.title/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('settings.preferenceSaveFailed')
  })
})
