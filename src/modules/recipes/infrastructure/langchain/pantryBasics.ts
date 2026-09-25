export const DEFAULT_PANTRY_BASICS = [
  'salt',
  'pepper',
  'oil',
  'water',
  'sugar',
  'flour',
  'garlic powder',
  'paprika',
  'cumin',
  'lemon juice',
  'מלח',
  'פלפל',
  'פלפל שחור',
  'שמן',
  'מים',
  'סוכר',
  'קמח',
  'אבקת שום',
  'פפריקה',
  'כמון',
  'מיץ לימון'
] as const

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

const pantryBasicSet = new Set(DEFAULT_PANTRY_BASICS.map(normalize))

export const isPantryBasic = (name: string): boolean =>
  pantryBasicSet.has(normalize(name))

export const defaultPantryBasics = (): string[] => [...DEFAULT_PANTRY_BASICS]
