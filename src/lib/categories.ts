export const OTHER_CATEGORY_NAME = 'אחר'

type DefaultCategory = {
  name: string
  color: string
  icon: string
  protected: boolean
  order: number
}

export const DEFAULT_CATEGORIES: Record<string, DefaultCategory> = {
  vegetables: { name: 'ירקות', color: '#8fbf6a', icon: '🥕', protected: false, order: 0 },
  fruits: { name: 'פירות', color: '#e8a33d', icon: '🍎', protected: false, order: 1 },
  meat: { name: 'בשר ועוף', color: '#c96a5a', icon: '🍗', protected: false, order: 2 },
  fish: { name: 'דגים', color: '#6aa8c9', icon: '🐟', protected: false, order: 3 },
  dairy: { name: 'מוצרי חלב וביצים', color: '#f0c96b', icon: '🥛', protected: false, order: 4 },
  bakery: { name: 'לחמים ומאפים', color: '#c9975a', icon: '🍞', protected: false, order: 5 },
  pantry: { name: 'מזווה', color: '#b58f5c', icon: '🥫', protected: false, order: 6 },
  snacks: { name: 'חטיפים ומתוקים', color: '#e6a3b0', icon: '🍬', protected: false, order: 7 },
  drinks: { name: 'משקאות', color: '#7bc4c4', icon: '🥤', protected: false, order: 8 },
  frozen: { name: 'קפואים', color: '#8fc7dd', icon: '🧊', protected: false, order: 9 },
  baby: { name: 'מוצרי תינוקות', color: '#d9b3d9', icon: '🍼', protected: false, order: 10 },
  pets: { name: 'מזון לחיות מחמד', color: '#a3b86a', icon: '🐾', protected: false, order: 11 },
  personal_care: { name: 'טיפוח אישי', color: '#e0919c', icon: '🧴', protected: false, order: 12 },
  cleaning: { name: 'ניקיון וכביסה', color: '#8fc7dd', icon: '🧽', protected: false, order: 13 },
  paper_hygiene: { name: 'נייר ומוצרי היגיינה', color: '#c9c9a3', icon: '🧻', protected: false, order: 14 },
  disposable_storage: { name: 'חד פעמי ואחסון', color: '#d9905a', icon: '📦', protected: false, order: 15 },
  other: { name: OTHER_CATEGORY_NAME, color: '#a8a8a8', icon: '📌', protected: true, order: 16 }
}
