import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DirectionProvider } from '@radix-ui/react-direction'
import { Check, CookingPot, Leaf, Package, Plus, ReceiptText, ShoppingBasket, SlidersHorizontal } from 'lucide-react'
import '../i18n/config'
import '../App.css'
import '../workspace.css'
import './shoppingMock.css'
import ListPicker from '../components/ListPicker'
import CategorySection from '../components/CategorySection'
import ShoppingListItemRow from '../components/ShoppingListItemRow'
import { createShoppingMockData, mockCategories } from './shoppingMockData'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import type { GroceryItem } from '../types'

const STORAGE_KEY = 'fridge-shopping-mock-v1'
function ShoppingMock() {
  const [entries, setEntries] = useState<GroceryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') ?? createShoppingMockData() }
    catch { return createShoppingMockData() }
  })
  const [list, setList] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [tools, setTools] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [showBought, setShowBought] = useState(false)
  const visible = entries.filter(entry => (entry.list_name ?? null) === list)
  const remaining = visible.filter(entry => !entry.bought)
  const bought = visible.filter(entry => entry.bought)
  const matches = (entry: GroceryItem) => entry.item.includes(search.trim())
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch {} }, [entries])
  const toggleBought = (key: string) => setEntries(previous => previous.map(entry => entry.key === key ? { ...entry, bought: !entry.bought } : entry))
  const toggleCategory = (category: string) => setCollapsed(previous => {
    const next = new Set(previous)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    return next
  })
  const renderRow = (entry: GroceryItem) => <ShoppingListItemRow key={entry.key} entry={entry} onCheckedChange={() => toggleBought(entry.key)} />
  return <DirectionProvider dir="rtl"><div className="frame workspace workspace-signed-in mock-workspace" dir="rtl">
    <aside className="workspace-rail"><div className="rail-brand"><Leaf />fridge.</div>
      <nav className="workspace-nav" aria-label="ניווט"><a href="/mock.html" className="active"><ShoppingBasket /><span>קניות</span></a><a href="/stock"><Package /><span>במטבח</span></a><a href="/recipes"><CookingPot /><span>מבשלים</span></a><a href="/receipts"><ReceiptText /><span>קבלות</span></a></nav>
    </aside>
    <div className="workspace-main"><header className="app-header"><div className="workspace-context"><Leaf /><strong>קניות · דמו</strong></div><button className="mock-reset" onClick={() => { setEntries(createShoppingMockData()); setCollapsed(new Set()); setSearch(''); setShowBought(false) }}>איפוס הדמו</button></header>
      <main className="workspace-content"><div className="page-heading"><h1>רשימות קניות לדוגמה</h1></div>
        <div className="shopping-workspace"><section className="shopping-primary" aria-label="רשימת קניות">
          <div className="shop-overview"><div><strong>{remaining.length}</strong><span>נשאר לקנות</span></div><span className="shop-completed"><Check size={16} />נקנו {bought.length}</span></div>
          <div className="shopping-toolbar"><ListPicker activeList={list} customLists={['קנייה שבועית', 'קמפינג']} onSelectList={value => { setList(value); setSearch('') }} /><button className="workspace-icon" aria-label="סינון הרשימה" aria-expanded={tools} onClick={() => { setTools(!tools); setSearch('') }}><SlidersHorizontal size={18} /></button></div>
          <div className="shopping-composer"><form className="quick-add" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; setEntries(previous => [...previous, { key: crypto.randomUUID(), item: name.trim(), category: OTHER_CATEGORY_NAME, bought: false, added_at: new Date().toISOString(), list_name: list, quantity: 1, unit: 'יח׳' }]); setName('') }}><input className="quick-add-input" aria-label="מוצר להוספה" placeholder="מה צריך לקנות?" value={name} onChange={event => setName(event.target.value)} /><button className="quick-add-button" aria-label="הוספת מוצר" disabled={!name.trim()}><Plus /><span>הוספה</span></button></form></div>
          {tools && <div className="list-controls-row"><input className="mock-search" aria-label="חיפוש מוצר" placeholder="חיפוש ברשימה" value={search} onChange={event => setSearch(event.target.value)} /></div>}
          <div className="shopping-list-scroll" key={list ?? 'permanent'}>
            {mockCategories.map(category => {
              const items = remaining.filter(entry => entry.category === category.name && matches(entry))
              return items.length > 0 && <CategorySection key={category.key} name={category.name} color={category.color} icon={category.icon} uncheckedCount={items.length} collapsed={collapsed.has(category.name)} onToggle={() => toggleCategory(category.name)}>{items.map(renderRow)}</CategorySection>
            })}
            {bought.length > 0 && <CategorySection name={`נקנו · ${bought.length}`} icon="✓" color="#8fbf6a" collapsed={!showBought} onToggle={() => setShowBought(!showBought)}>{bought.filter(matches).map(renderRow)}</CategorySection>}
            {visible.filter(matches).length === 0 && <div className="workspace-empty">לא נמצאו מוצרים</div>}
          </div>
        </section><aside className="shopping-aside"><div className="next-meal-card"><h3>נתוני דמו מקומיים</h3><p>הרשימה הקבועה: 120 מוצרים<br />קנייה שבועית: 18 מוצרים<br />קמפינג: 24 מוצרים</p><p>סימון והוספה נשמרים בדפדפן הזה בלבד.</p></div></aside></div>
      </main>
    </div>
  </div></DirectionProvider>
}
const root = createRoot(document.getElementById('root')!)
root.render(import.meta.env.DEV ? <ShoppingMock /> : <p>התצוגה זמינה בפיתוח מקומי בלבד.</p>)
