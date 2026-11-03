import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rules = JSON.parse(readFileSync(resolve(__dirname, '../database.sharing.rules.json'), 'utf8')).rules

describe('deployed per-shopping-list isolation rules', () => {
  it('does not grant access at the root, users collection or household parent', () => {
    expect(rules['.read']).toBe(false)
    expect(rules['.write']).toBe(false)
    expect(rules.users['.read']).toBeUndefined()
    expect(rules.users['.write']).toBeUndefined()
    expect(rules.users.$listId['.read']).toBeUndefined()
    expect(rules.users.$listId['.write']).toBeUndefined()
  })

  it.each(['groceries', 'categories', 'stock', 'receipts', 'recipes', 'purchaseHistory', 'listChangeHistory', 'name', 'config'])('keeps owner browser access to %s without granting it to invited guests', field => {
    for (const operation of ['.read', '.write']) {
      expect(rules.users.$listId[field][operation]).toContain("child('ownerUid').val() === auth.uid")
      expect(rules.users.$listId[field][operation]).toContain("sign_in_provider != 'anonymous'")
      expect(rules.users.$listId[field][operation]).not.toContain('invites')
    }
  })

  it('keeps authority fields and both scoped sharing indexes server-owned', () => {
    for (const field of ['ownerUid', 'normalizedOwnerEmail', 'members', 'invites', 'memberOf']) {
      expect(rules.users.$listId[field]['.write']).toBe(false)
    }
    for (const field of ['shoppingListShares', 'shoppingListShareIndex']) {
      expect(rules[field]).toEqual({ '.read': false, '.write': false })
    }
  })

  it('also closes public access to legacy copies of household data', () => {
    for (const node of ['lists', 'groceries', 'categories', 'stock', 'receipts', 'admins']) {
      for (const operation of ['.read', '.write']) {
        expect(rules[node][operation]).toContain("child('muli_turiel@gmail_com').child('ownerUid').val() === auth.uid")
        expect(rules[node][operation]).toContain("sign_in_provider != 'anonymous'")
      }
    }
  })
})
