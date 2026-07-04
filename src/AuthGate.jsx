import { useEffect, useState } from 'react'
import { ADMIN_EMAILS, adminsRef, onAuthChange, onValue, signIn, signOutUser } from './firebase.js'
import App from './App.jsx'

export default function AuthGate() {
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
    <App user={user} canEdit={canEdit} onSignIn={handleSignIn} onSignOut={signOutUser} authError={authError} />
  )
}
