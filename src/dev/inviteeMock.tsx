import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DirectionProvider } from '@radix-ui/react-direction'
import { Leaf, LogOut, Plus, ShoppingBasket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '../i18n/config'
import '../App.css'
import '../workspace.css'
import './inviteeMock.css'
import ShoppingListItemRow from '../components/ShoppingListItemRow'
import CategorySection from '../components/CategorySection'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import type { GroceryItem } from '../types'

const initialItems: GroceryItem[] = [
  { key: 'invitee-milk', item: 'חלב', category: 'מוצרי חלב וביצים', bought: false, quantity: 2, unit: 'יח׳', note: '3%', added_at: '2026-11-04T07:30:00.000Z', created_by: 'muli@example.com' },
  { key: 'invitee-tomatoes', item: 'עגבניות שרי', category: 'ירקות', bought: false, quantity: 1, unit: 'ק״ג', added_at: '2026-11-04T07:32:00.000Z', created_by: 'guest@example.com' },
  { key: 'invitee-bread', item: 'לחם מחמצת', category: 'לחם ומאפים', bought: false, quantity: 1, unit: 'יח׳', added_at: '2026-11-04T07:35:00.000Z', created_by: 'muli@example.com' },
  { key: 'invitee-coffee', item: 'קפה שחור', category: 'שתייה', bought: true, quantity: 1, unit: 'יח׳', added_at: '2026-11-03T17:10:00.000Z', created_by: 'guest@example.com' }
]

const previewCategories = [
  { name: 'מוצרי חלב וביצים', en: 'Dairy & eggs', icon: '🥛', color: '#8db7d6' },
  { name: 'ירקות', en: 'Vegetables', icon: '🥬', color: '#79b36b' },
  { name: 'לחם ומאפים', en: 'Bread & bakery', icon: '🥖', color: '#d3a76d' },
  { name: 'שתייה', en: 'Drinks', icon: '🥤', color: '#a88bd4' },
  { name: 'אחר', en: 'Other', icon: '📌', color: '#9ea7a1' }
]

const previewCopy = {
  he: {
    privacy: 'המוזמנים יכולים לראות ולערוך רק את הרשימה הזאת. רשימות אחרות, מלאי וקבלות נשארים פרטיים.',
    sharedWithMe: 'רשימות ששותפו איתי', sharedList: 'רשימה משותפת', title: 'קנייה שבועית',
    sharedBy: 'שותפה על ידי Muli · השינויים מסתנכרנים אוטומטית', itemName: 'שם הפריט', add: 'הוספה'
  },
  en: {
    privacy: 'Invitees can view and edit this list only. Other lists, stock, and receipts stay private.',
    sharedWithMe: 'Shared with me', sharedList: 'Shared list', title: 'Weekly shop',
    sharedBy: 'Shared by Muli · Changes sync automatically', itemName: 'Item name', add: 'Add'
  }
}

function InviteeAvatars() {
  return <div className="list-member-avatars" aria-label="Muli, Guest">
    <span className="list-member-avatar" title="Muli"><span aria-label="Muli">MU</span></span>
    <span className="list-member-avatar" title="Guest"><span aria-label="Guest">GU</span></span>
  </div>
}

function InviteeMock() {
  const { t, i18n } = useTranslation('common')
  const [items, setItems] = useState(initialItems)
  const [name, setName] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState(new Set<string>())
  const [boughtCollapsed, setBoughtCollapsed] = useState(true)
  const otherLanguage = SUPPORTED_LANGUAGES.find(language => language !== i18n.language) || 'en'
  const language = i18n.language === 'en' ? 'en' : 'he'
  const copy = previewCopy[language]
  const remaining = items.filter(item => !item.bought)
  const bought = items.filter(item => item.bought)

  const toggleCategory = (category: string) => setCollapsedCategories(previous => {
    const next = new Set(previous)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    return next
  })

  const patchItem = (key: string, fields: Partial<GroceryItem>) => {
    setItems(previous => previous.map(item => item.key === key ? { ...item, ...fields } : item))
    return Promise.resolve()
  }

  const addItem = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setItems(previous => [...previous, {
      key: crypto.randomUUID(), item: trimmed, category: 'אחר', bought: false,
      quantity: 1, unit: 'יח׳', added_at: new Date().toISOString(),
      created_by: 'guest@example.com'
    }])
    setName('')
  }

  return <DirectionProvider dir={i18n.dir()}>
    <div className="frame workspace workspace-signed-in invitee-workspace" dir={i18n.dir()}>
      <aside className="workspace-rail">
        <div className="rail-brand"><Leaf />fridge.</div>
        <nav className="workspace-nav" aria-label={t('tabs.label')}>
          <a className="active" href="/invitee.html"><ShoppingBasket /><span>{t('tabs.shoppingList')}</span></a>
        </nav>
        <div className="invitee-privacy-note">{copy.privacy}</div>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <div className="workspace-context"><Leaf /><strong>{copy.sharedWithMe}</strong></div>
          <div className="invitee-header-actions">
            <button className="icon-btn lang-switch-btn" onClick={() => changeLanguage(otherLanguage)} aria-label={t('language.label')}>
              {t(`language.${otherLanguage}`)}
            </button>
            <button className="icon-btn" aria-label={t('auth.signOut')}><LogOut size={18} /></button>
          </div>
        </header>
        <main className="workspace-content" id="main-content">
          <section className="shared-shopping-list invitee-list" aria-label={copy.sharedList}>
            <div className="invitee-preview-badge">DEV · INVITEE</div>
            <div className="list-sharing-bar">
              <div><p className="invitee-eyebrow">{copy.sharedList}</p><h1>{copy.title}</h1></div>
              <InviteeAvatars />
            </div>
            <p className="invitee-shared-by">{copy.sharedBy}</p>
            <div className="invitee-overview"><strong>{remaining.length}</strong><span>{t('workspace.leftToGet')}</span></div>
            <form className="quick-add invitee-quick-add" onSubmit={addItem}>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder={copy.itemName} aria-label={copy.itemName} />
              <Button type="submit" disabled={!name.trim()}><Plus size={18} />{copy.add}</Button>
            </form>
            <div className="invitee-category-grid">
              {previewCategories.map(category => {
                const categoryItems = remaining.filter(item => item.category === category.name)
                if (!categoryItems.length) return null
                return <CategorySection key={category.name} {...category} name={language === 'en' ? category.en : category.name}
                  uncheckedCount={categoryItems.length}
                  collapsed={collapsedCategories.has(category.name)}
                  onToggle={() => toggleCategory(category.name)}>
                  {categoryItems.map(item => <ShoppingListItemRow key={item.key} entry={item} canEdit
                    onCheckedChange={() => patchItem(item.key, { bought: true })} />)}
                </CategorySection>
              })}
              {bought.length > 0 && <div className="invitee-completed-section">
                <CategorySection name={`${t('workspace.packed', { count: bought.length })}`} icon="✓" color="#91b66f"
                  uncheckedCount={bought.length} collapsed={boughtCollapsed} onToggle={() => setBoughtCollapsed(previous => !previous)}>
                  {bought.map(item => <ShoppingListItemRow key={item.key} entry={item} canEdit
                    onCheckedChange={() => patchItem(item.key, { bought: false })} />)}
                </CategorySection>
              </div>}
            </div>
            {!items.length && <p>{language === 'en' ? 'This list is empty.' : 'הרשימה ריקה.'}</p>}
          </section>
        </main>
      </div>
    </div>
  </DirectionProvider>
}

const root = createRoot(document.getElementById('root')!)
root.render(<InviteeMock />)
