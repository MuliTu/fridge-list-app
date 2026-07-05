import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from './AuthContext.jsx'
import { GroceriesFeedProvider, useGroceriesFeed } from './GroceriesFeedContext.jsx'
import CategoriesModal from './CategoriesModal.jsx'
import AdminsModal from './AdminsModal.jsx'
import { useCategories } from './useCategories.js'

export default function Layout({ children }) {
  return (
    <GroceriesFeedProvider>
      <LayoutContent>{children}</LayoutContent>
    </GroceriesFeedProvider>
  )
}

function LayoutContent({ children }) {
  const { user, canEdit, onSignIn, onSignOut, authError } = useAuth()
  const { status, toast } = useGroceriesFeed()
  const [showMenu, setShowMenu] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showAdmins, setShowAdmins] = useState(false)
  const { categories } = useCategories()

  return (
    <div className="frame">
      <header>
        <div className="user-chip">
          {user ? (
            <>
              {canEdit && (
                <div className="menu-wrap">
                  <button className="icon-btn" onClick={() => setShowMenu((v) => !v)} aria-label="תפריט">
                    ⚙️
                  </button>
                  {showMenu && (
                    <>
                      <div className="menu-overlay" onClick={() => setShowMenu(false)} />
                      <div className="menu-dropdown">
                        <button
                          className="menu-item"
                          onClick={() => {
                            setShowMenu(false)
                            setShowCategories(true)
                          }}
                        >
                          🗂 ניהול קטגוריות
                        </button>
                        <button
                          className="menu-item"
                          onClick={() => {
                            setShowMenu(false)
                            setShowAdmins(true)
                          }}
                        >
                          👥 שיתוף עריכה
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <span>
                {user.displayName || user.email}
                {!canEdit && ' · צפייה בלבד'}
              </span>
              <button className="signout-btn" onClick={onSignOut}>
                התנתקות
              </button>
            </>
          ) : (
            <button className="signout-btn" onClick={onSignIn}>
              התחברות לעריכה
            </button>
          )}
        </div>
        {authError && <div className="header-error">שגיאת התחברות: {authError}</div>}
        <h1>🛒 רשימת הבית</h1>
        <div className="sub">מתעדכן בזמן אמת</div>
        <div className="tabs">
          <Link to="/" className="tab-btn" activeProps={{ className: 'tab-btn active' }} activeOptions={{ exact: true }}>
            🛒 רשימת קניות
          </Link>
          <Link to="/stock" className="tab-btn" activeProps={{ className: 'tab-btn active' }}>
            📦 מלאי
          </Link>
          <Link to="/receipts" className="tab-btn" activeProps={{ className: 'tab-btn active' }}>
            🧾 קבלות
          </Link>
        </div>
      </header>

      {toast && <div className="toast">🛒 {toast}</div>}

      {children}

      <div className="status">{status}</div>

      {showCategories && <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} />}
      {showAdmins && <AdminsModal onClose={() => setShowAdmins(false)} />}
    </div>
  )
}
