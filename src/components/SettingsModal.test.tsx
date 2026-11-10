import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BehaviorSettingsProvider } from '../hooks/BehaviorSettingsContext'
import { changeLanguage } from '../i18n/config'
import { SettingsModal } from './SettingsModal'

let currentLanguage = 'en'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: currentLanguage,
      dir: () => currentLanguage === 'he' ? 'rtl' : 'ltr'
    }
  })
}))

jest.mock('../i18n/config', () => ({
  SUPPORTED_LANGUAGES: ['he', 'en'],
  changeLanguage: jest.fn((language: string) => {
    currentLanguage = language
  })
}))

jest.mock('../hooks/DialogServiceContext', () => ({
  useDialogService: () => ({ confirm: jest.fn() })
}))

jest.mock('../hooks/ListContext', () => ({
  useListApi: () => ({
    addCategory: jest.fn(),
    deleteCategory: jest.fn(),
    updateCategory: jest.fn()
  })
}))

const baseProps = {
  categories: [],
  canEdit: true,
  stockSuggestionEnabled: true,
  keepBoughtItemsInCategories: false,
  boughtItemsPreferenceResolved: true,
  boughtItemsPreferenceSaveError: false,
  onToggleStockSuggestion: jest.fn(),
  onToggleBoughtItemsPlacement: jest.fn(() => Promise.resolve()),
  onClose: jest.fn(),
  returnFocusRef: createRef<HTMLButtonElement>()
}

const renderSettings = () => render(
  <BehaviorSettingsProvider scope="settings-test">
    <SettingsModal {...baseProps} />
  </BehaviorSettingsProvider>
)

describe('SettingsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    currentLanguage = 'en'
    localStorage.clear()
  })

  it('navigates to Language, changes language, and returns to the root panel', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /settings.languageTitle/ }))
    expect(screen.getByRole('heading', { name: 'settings.languageTitle' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'language.he' }))
    expect(changeLanguage).toHaveBeenCalledWith('he')

    await user.click(screen.getByRole('button', { name: 'settings.back' }))
    expect(screen.getByRole('heading', { name: 'settings.title' })).toBeInTheDocument()
  })

  it('keeps behavior and shopping preferences inside nested settings panels', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /settings.behaviorTitle/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'shoppingList:behavior.hold' }))
    expect(JSON.parse(localStorage.getItem('fridge-behavior-v1:settings-test')!)).toMatchObject({ purchaseGesture: 'hold' })

    await user.click(screen.getByRole('button', { name: 'settings.back' }))
    await user.click(screen.getByRole('button', { name: /settings.preferencesTitle/ }))
    await user.click(screen.getByRole('checkbox', { name: /settings.stockSuggestion/ }))
    await user.click(screen.getByRole('checkbox', { name: /settings.boughtItemsPlacement/ }))

    expect(baseProps.onToggleStockSuggestion).toHaveBeenCalledTimes(1)
    expect(baseProps.onToggleBoughtItemsPlacement).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape and does not expose edit-only panels to read-only viewers', async () => {
    const user = userEvent.setup()
    render(
      <BehaviorSettingsProvider scope="settings-test">
        <SettingsModal {...baseProps} canEdit={false} />
      </BehaviorSettingsProvider>
    )

    expect(screen.queryByRole('button', { name: /settings.preferencesTitle/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /categories:title/ })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(baseProps.onClose).toHaveBeenCalledTimes(1)
  })
})
