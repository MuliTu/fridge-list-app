import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ADMIN_EMAILS, adminsRef, onAuthChange, onValue, signIn, signOutUser } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  canEdit: boolean
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
  const [user, setUser] = useState<AuthUser | null>(DEV_USER)
  const [authError, setAuthError] = useState<string | null>(null)
  const [invitedEmails, setInvitedEmails] = useState<string[]>([])
  const isPrerendering = useIsPrerendering()

  useEffect(() => {
    if (DEV_BYPASS || isPrerendering) return
    return onAuthChange(setUser)
  }, [isPrerendering])
  useEffect(() => {
    if (isPrerendering) return
    return onValue(adminsRef, (snapshot) => setInvitedEmails(Object.values(snapshot.val() || {})))
  }, [isPrerendering])

  const handleSignIn = () => {
    setAuthError(null)
    return signIn().catch((err) => {
      console.error('[Auth] signInWithPopup rejected:', err.code, err.message)
      setAuthError(err.code || err.message)
      throw err
    })
  }

  const canEdit =
    !!user && (ADMIN_EMAILS.includes(user.email || '') || invitedEmails.includes(user.email?.toLowerCase() || ''))

  return (
    <AuthContext.Provider value={{ user, canEdit, onSignIn: handleSignIn, onSignOut: signOutUser, authError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
