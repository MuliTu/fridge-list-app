import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, readStoredLanguage, RTL_LANGUAGES } from '../i18n/config'

// Keeps <html lang>/<html dir> in sync with the active i18n language, and applies any
// stored language preference. Both happen inside a useEffect (client-only, strictly
// post-hydration) — i18n always initializes to 'he' on both server and client so the
// very first render matches exactly; only after that commit do we switch to whatever
// the user previously chose, trading a brief flash of Hebrew for a returning
// English-preferring user for avoiding a hydration mismatch entirely.
export function useSyncHtmlLangDir() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const stored = readStoredLanguage()
    if (stored && stored !== i18n.language) changeLanguage(stored)
  }, [])

  useEffect(() => {
    const apply = (lng: string) => {
      document.documentElement.lang = lng
      document.documentElement.dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr'
    }
    apply(i18n.language)
    i18n.on('languageChanged', apply)
    return () => i18n.off('languageChanged', apply)
  }, [i18n])
}
