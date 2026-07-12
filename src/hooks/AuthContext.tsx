import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { onAuthChange, signIn, signOutUser } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import type { AuthUser } from '../types'

// canEdit/canView used to live here as flat, app-wide booleans (gated on a
// hardcoded ADMIN_EMAILS array + a global /admins invite list). Multi-tenant lists
// replaced that: "can I edit" is now a property of a specific list (am I a member
// of the currently active one), not of the app as a whole — see
// src/hooks/ListContext.tsx's useActiveList(), which is where those checks live now.
interface AuthContextValue {
  user: AuthUser | null
  // True once Firebase has resolved whether a session already exists (or immediately
  // for the dev bypass) — lets consumers avoid flashing a "please sign in" screen for
  // a returning, already-authenticated user while that check is still in flight.
  authResolved: boolean
  onSignIn: () => Promise<unknown>
  onSignOut: () => Promise<void>
  authError: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Local-dev-only auth bypass, enabled via .env.local (gitignored, never pushed) — lets
// you exercise canEdit-gated actions without a real Google sign-in popup. Has no
// effect in production builds since import.meta.env.DEV is false there regardless of
// what's in the env file.
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'
const DEV_USER: AuthUser | null = DEV_BYPASS
  ? {
      email: import.meta.env.VITE_DEV_AUTH_EMAIL || 'dev@example.com',
      displayName: import.meta.env.VITE_DEV_AUTH_NAME || 'Dev User'
    }
  : null

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [user, setUser] = useState<AuthUser | null>(DEV_USER)
  const [authResolved, setAuthResolved] = useState(DEV_BYPASS)
  const [authError, setAuthError] = useState<string | null>(null)
  const isPrerendering = useIsPrerendering()

  useEffect(() => {
    if (DEV_BYPASS || isPrerendering) return
    return onAuthChange((nextUser) => {
      setUser(nextUser)
      setAuthResolved(true)
    })
  }, [isPrerendering])

  const handleSignIn = () => {
    setAuthError(null)
    return signIn().catch((err) => {
      console.error('[Auth] signInWithPopup rejected:', err.code, err.message)
      // Firebase Auth's popup flow relays state back through sessionStorage on a
      // hidden cross-origin iframe (authDomain) — any browser that partitions or
      // blocks that storage (Safari's cross-site tracking prevention, an app's
      // built-in in-app browser like Gmail/WhatsApp, private browsing) breaks the
      // handshake and throws exactly this error, with no user-actionable code, only
      // a long internal English message. Same root cause this project already hit
      // with signInWithRedirect (see CLAUDE.md's Auth section) — surfaced here
      // instead of Firebase's raw text, since a real invited user hit this and had
      // no way to know what to do about it.
      const isStorageBlocked =
        err.code === 'auth/missing-initial-state' || /missing initial state|sessionStorage/i.test(err.message || '')
      // The storage-blocked message is already a complete, translated sentence — the
      // generic code/message fallback still needs the "Sign-in error:" label for
      // context, since it's a short raw Firebase code on its own otherwise.
      setAuthError(isStorageBlocked ? t('auth.signInStorageBlocked') : `${t('auth.signInError')}: ${err.code || err.message}`)
      throw err
    })
  }

  return (
    <AuthContext.Provider value={{ user, authResolved, onSignIn: handleSignIn, onSignOut: signOutUser, authError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
