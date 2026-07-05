import { createContext, useContext, useEffect, useState } from 'react'
import { ADMIN_EMAILS, adminsRef, onAuthChange, onValue, signIn, signOutUser } from './firebase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [invitedEmails, setInvitedEmails] = useState([])

  useEffect(() => onAuthChange(setUser), [])
  useEffect(() => onValue(adminsRef, (snapshot) => setInvitedEmails(Object.values(snapshot.val() || {}))), [])

  const handleSignIn = () => {
    setAuthError(null)
    return signIn().catch((err) => {
      console.error('[Auth] signInWithPopup rejected:', err.code, err.message)
      setAuthError(err.code || err.message)
      throw err
    })
  }

  const canEdit = !!user && (ADMIN_EMAILS.includes(user.email) || invitedEmails.includes(user.email?.toLowerCase()))

  return (
    <AuthContext.Provider value={{ user, canEdit, onSignIn: handleSignIn, onSignOut: signOutUser, authError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
