import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_EMAILS, addAdminEmail, adminsRef, onValue, removeAdminEmail } from '../lib/firebase'

interface AdminsModalProps {
  onClose: () => void
}

export default function AdminsModal({ onClose }: AdminsModalProps) {
  const { t } = useTranslation()
  const [invitedEmails, setInvitedEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onValue(adminsRef, (snapshot) => setInvitedEmails(Object.values(snapshot.val() || {}))), [])

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('admins:invalidEmail'))
      return
    }
    setError(null)
    try {
      await addAdminEmail(trimmed)
      setNewEmail('')
    } catch (err) {
      setError(`${t('admins:addFailed')}: ${err.message}`)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('admins:title')}</h2>
        <p className="modal-note-readonly">
          {t('admins:explanation')}
        </p>

        <div className="category-rows">
          {ADMIN_EMAILS.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <span className="admin-owner-tag">{t('admins:ownerTag')}</span>
            </div>
          ))}
          {invitedEmails.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <button className="stock-icon-btn" onClick={() => removeAdminEmail(email)} aria-label={t('admins:removeAdmin')}>
                🗑
              </button>
            </div>
          ))}
        </div>

        <div className="category-row">
          <input
            className="modal-input"
            type="email"
            placeholder={t('admins:emailPlaceholder')}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="stock-icon-btn" onClick={handleAdd} aria-label={t('admins:addAdmin')}>
            ➕
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn primary" onClick={onClose}>
            {t('common:actions.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
