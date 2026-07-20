import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import commonHe from './locales/he/common.json'
import shoppingListHe from './locales/he/shoppingList.json'
import stockHe from './locales/he/stock.json'
import receiptsHe from './locales/he/receipts.json'
import categoriesHe from './locales/he/categories.json'
import adminsHe from './locales/he/admins.json'
import changelogHe from './locales/he/changelog.json'
import feedbackHe from './locales/he/feedback.json'
import listsHe from './locales/he/lists.json'
import onboardingHe from './locales/he/onboarding.json'
import whatsNewHe from './locales/he/whatsNew.json'
import purchaseInsightsHe from './locales/he/purchaseInsights.json'

import commonEn from './locales/en/common.json'
import shoppingListEn from './locales/en/shoppingList.json'
import stockEn from './locales/en/stock.json'
import receiptsEn from './locales/en/receipts.json'
import categoriesEn from './locales/en/categories.json'
import adminsEn from './locales/en/admins.json'
import changelogEn from './locales/en/changelog.json'
import feedbackEn from './locales/en/feedback.json'
import listsEn from './locales/en/lists.json'
import onboardingEn from './locales/en/onboarding.json'
import whatsNewEn from './locales/en/whatsNew.json'
import purchaseInsightsEn from './locales/en/purchaseInsights.json'

export const SUPPORTED_LANGUAGES = ['he', 'en'] as const
export const RTL_LANGUAGES = ['he']
const STORAGE_KEY = 'appLanguage'

const resources = {
  he: {
    common: commonHe,
    shoppingList: shoppingListHe,
    stock: stockHe,
    receipts: receiptsHe,
    categories: categoriesHe,
    admins: adminsHe,
    changelog: changelogHe,
    feedback: feedbackHe,
    lists: listsHe,
    onboarding: onboardingHe,
    whatsNew: whatsNewHe,
    purchaseInsights: purchaseInsightsHe
  },
  en: {
    common: commonEn,
    shoppingList: shoppingListEn,
    stock: stockEn,
    receipts: receiptsEn,
    categories: categoriesEn,
    admins: adminsEn,
    changelog: changelogEn,
    feedback: feedbackEn,
    lists: listsEn,
    onboarding: onboardingEn,
    whatsNew: whatsNewEn,
    purchaseInsights: purchaseInsightsEn
  }
}

export const readStoredLanguage = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored) ? stored : null
  } catch {
    return null
  }
}

// Always init with 'he', on both server and client, regardless of what's stored in
// localStorage — this guarantees the client's first render matches the server-rendered
// HTML exactly. Applying a stored non-default preference happens strictly after mount
// (see useSyncHtmlLangDir / the effect in Layout.tsx), which trades a brief flash of
// Hebrew for a returning English-preferring user for avoiding a hydration mismatch
// (previously React discarded the entire server-rendered HTML and did a full
// client-side re-render whenever the stored language differed from the SSR default).
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'he',
    fallbackLng: 'he',
    defaultNS: 'common',
    ns: ['common', 'shoppingList', 'stock', 'receipts', 'categories', 'admins', 'changelog', 'feedback', 'lists', 'onboarding', 'whatsNew', 'purchaseInsights'],
    interpolation: { escapeValue: false }
  })
}

export const changeLanguage = (lng: string) => {
  i18n.changeLanguage(lng)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, lng)
    } catch {
      // best-effort persistence only
    }
  }
}

export default i18n
