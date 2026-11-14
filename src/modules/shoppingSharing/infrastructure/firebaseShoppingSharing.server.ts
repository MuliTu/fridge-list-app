import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'
import type { Auth } from 'firebase-admin/auth'
import type { Database } from 'firebase-admin/database'
import { z } from 'zod'
import { ApplicationError, type UserPrincipal } from '../../shared'
import type { GroceryItem } from '../../../types'
import { OTHER_CATEGORY_NAME } from '../../../lib/categories'
import type { MutateList } from '../../shared/server'
import type { ShoppingShareCategory, ShoppingShareMember, ShoppingShareSnapshot, ShoppingShareSummary } from '..'

const emailSchema = z.string().trim().toLowerCase().email().max(254)
const keySchema = z.string().min(1).max(200).regex(/^[^.#$/\[\]\u0000-\u001f\u007f]+$/)
const shareIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
const scopeSchema = z.string().trim().min(1).max(120).nullable()
const itemFields = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  note: z.string().max(2000).nullable().optional(),
  quantity: z.number().positive().max(1000000).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  bought: z.boolean().optional(),
  urgency: z.enum(['normal', 'wanted', 'urgent']).optional()
}).strict()
const mutationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add'), item: itemFields.extend({ name: z.string().trim().min(1).max(100) }) }).strict(),
  z.object({ operation: z.literal('update'), itemId: keySchema, item: itemFields }).strict(),
  z.object({ operation: z.literal('delete'), itemId: keySchema }).strict()
])
export const shoppingSharingRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('provision') }).strict(),
  z.object({ action: z.literal('roster'), householdId: keySchema, listName: scopeSchema }).strict(),
  z.object({ action: z.literal('invite'), householdId: keySchema, listName: scopeSchema, email: emailSchema }).strict(),
  z.object({ action: z.literal('revoke'), householdId: keySchema, listName: scopeSchema, email: emailSchema }).strict(),
  z.object({ action: z.literal('snapshot'), shareId: shareIdSchema }).strict(),
  z.object({ action: z.literal('mutate'), shareId: shareIdSchema, mutation: mutationSchema }).strict()
])

type Share = {
  householdId: string
  listName: string | null
  ownerUid: string
  owner: ShoppingShareMember
  members?: Record<string, ShoppingShareMember>
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const emailKey = (email: string) => digest(email.trim().toLowerCase())
const shareKey = (householdId: string, listName: string | null) => digest(JSON.stringify([householdId, listName]))
const summary = (id: string, share: Share): ShoppingShareSummary => ({ id, name: share.listName ?? '', owner: share.owner })

type GroceryRows = Record<string, GroceryItem>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const groceryRows = (value: unknown): GroceryRows =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, row]) => isRecord(row)))

// Firebase's export format wraps scalar fields that carry a priority.
function scalar(value: unknown): unknown {
  return isRecord(value) && Object.hasOwn(value, '.value') ? value['.value'] : value
}

const belongsToShare = (row: GroceryItem, share: Share) =>
  (scalar(row.list_name) || null) === (share.listName ?? null)

function eligibleCategories(catalog: unknown, rows: GroceryRows, share: Share): ShoppingShareCategory[] {
  const used = new Set<string>()
  const inShare = new Set<string>()
  for (const row of Object.values(rows)) {
    const category = scalar(row.category)
    if (typeof category !== 'string') continue
    used.add(category)
    if (belongsToShare(row, share)) inShare.add(category)
  }
  // The catalog belongs to the household. An unused entry is available to any
  // share, but use exclusively in other lists keeps the entry private.
  return Object.values(catalog ?? {})
    .filter(isRecord)
    .flatMap(value => {
      const name = scalar(value.name)
      if (typeof name !== 'string' || (used.has(name) && !inShare.has(name))) return []
      return [{
        name,
        color: typeof value.color === 'string' ? value.color : '#94a3b8',
        icon: typeof value.icon === 'string' ? value.icon : '📌',
        order: typeof value.order === 'number' ? value.order : Number.MAX_SAFE_INTEGER
      }]
    })
}

function updateGrocery(row: GroceryItem, fields: z.infer<typeof itemFields>, now: string, principal: UserPrincipal) {
  const { name, ...updates } = fields
  const next = { ...row }
  const changedFields = { ...updates, ...(name !== undefined ? { item: name } : {}), modified_at: now, modified_by: principal.email }
  for (const [key, value] of Object.entries(changedFields)) {
    const current = row[key as keyof GroceryItem]
    if (value === undefined || scalar(current) === value) continue
    Object.assign(next, { [key]: value !== null && isRecord(current) && Object.hasOwn(current, '.priority')
      ? { '.value': value, '.priority': current['.priority'] }
      : value })
  }
  return next
}

// These grants NEVER write household members/invites/memberOf. All reads and
// writes for a guest pass through this service; RTDB denies direct client access.
export class FirebaseShoppingSharingService {
  constructor(
    private readonly database: Database,
    private readonly auth: Pick<Auth, 'getUserByEmail'>,
    private readonly mutateHousehold: MutateList
  ) {}

  private identity(principal: UserPrincipal): string {
    if (!principal.emailVerified || !principal.email) {
      throw new ApplicationError('forbidden', 'A verified email is required for list sharing')
    }
    return principal.email.trim().toLowerCase()
  }

  private async profile(email: string): Promise<ShoppingShareMember> {
    try {
      const user = await this.auth.getUserByEmail(email)
      return { email, displayName: user.displayName || email, photoURL: user.photoURL || null }
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
      return { email, displayName: email, photoURL: null }
    }
  }

  private async ownShare(principal: UserPrincipal, householdId: string, listName: string | null): Promise<[string, Share]> {
    const email = this.identity(principal)
    // UID ownership is authoritative. Matching a sanitized email is insufficient:
    // different real emails can collide under the legacy household key encoding.
    const owner = await this.database.ref(`users/${householdId}/ownerUid`).get()
    if (owner.val() !== principal.uid) throw new ApplicationError('forbidden', 'Only the list owner can share this list')
    const id = shareKey(householdId, listName)
    const reference = this.database.ref(`shoppingListShares/${id}`)
    if (!(await reference.get()).exists()) {
      const profile = await this.profile(email)
      await reference.transaction((current: Share | null) => {
        if (current) return // Never overwrite/recreate grants during roster reads.
        return { householdId, listName, ownerUid: principal.uid, owner: profile }
      })
    }
    const share = (await reference.get()).val() as Share
    if (share.ownerUid !== principal.uid) throw new ApplicationError('forbidden', 'List ownership changed')
    return [id, share]
  }

  private async accessible(principal: UserPrincipal, id: string): Promise<Share> {
    const email = this.identity(principal)
    const share = (await this.database.ref(`shoppingListShares/${id}`).get()).val() as Share | null
    if (!share || (share.ownerUid !== principal.uid && share.members?.[emailKey(email)]?.email !== email)) {
      throw new ApplicationError('forbidden', 'This list is not shared with you')
    }
    // A stale grant must not survive household ownership changes.
    const owner = await this.database.ref(`users/${share.householdId}/ownerUid`).get()
    if (owner.val() !== share.ownerUid) throw new ApplicationError('forbidden', 'List ownership changed')
    return share
  }

  async discover(principal: UserPrincipal): Promise<ShoppingShareSummary[]> {
    const email = this.identity(principal)
    const index = (await this.database.ref(`shoppingListShareIndex/${emailKey(email)}`).get()).val() || {}
    const shares = await Promise.all(Object.keys(index).map(async id => {
      try { return summary(id, await this.accessible(principal, id)) }
      catch (error) {
        if (error instanceof ApplicationError && error.code === 'forbidden') return null
        throw error
      }
    }))
    return shares.filter((share): share is ShoppingShareSummary => share !== null)
  }

  async execute(principal: UserPrincipal, raw: unknown): Promise<unknown> {
    const parsed = shoppingSharingRequestSchema.safeParse(raw)
    if (!parsed.success) throw new ApplicationError('invalid_input', 'Invalid list sharing request')
    const input = parsed.data
    if (input.action === 'provision') {
      const email = this.identity(principal)
      const householdId = email.replace(/[.#$[\]]/g, '_')
      const profile = await this.profile(email)
      const result = await this.database.ref(`users/${householdId}`).transaction(current => {
        if (current?.ownerUid && current.ownerUid !== principal.uid) return
        // Existing unbound data needs an audited migration, never self-claiming.
        if (current?.name && !current.ownerUid) return
        return { ...current, ownerUid: principal.uid, normalizedOwnerEmail: email,
          name: current?.name || `הרשימה של ${profile.displayName}`.slice(0, 120) }
      })
      if (!result.committed) throw new ApplicationError('forbidden', 'List ownership requires verification')
      const name = (await this.database.ref(`users/${householdId}/name`).get()).val()
      return { name }
    }
    if (input.action === 'snapshot' || input.action === 'mutate') {
      const share = await this.accessible(principal, input.shareId)
      if (input.action === 'mutate') {
        await this.mutate(principal, share, input.mutation)
        return { ok: true }
      }
      const household = (await this.database.ref(`users/${share.householdId}`).get()).val()
      if (household?.ownerUid !== share.ownerUid) throw new ApplicationError('forbidden', 'List ownership changed')
      const rows = groceryRows(household.groceries)
      const items: GroceryItem[] = Object.entries(rows)
        .filter(([, row]) => belongsToShare(row, share))
        .map(([key, row]) => {
          // Whitelist fields; no household metadata, other list names, or image
          // document references are returned to scoped guests.
          return { key, item: row.item, category: row.category, bought: row.bought,
            added_at: row.added_at, note: row.note ?? null, quantity: row.quantity ?? null,
            unit: row.unit ?? null, urgency: row.urgency ?? 'normal' }
        })
      const categories = eligibleCategories(household.categories, rows, share)
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'he'))
      return { ...summary(input.shareId, share), isOwner: share.ownerUid === principal.uid,
        members: Object.values(share.members || {}), items, categories } satisfies ShoppingShareSnapshot
    }
    const [id, share] = await this.ownShare(principal, input.householdId, input.listName)
    if (input.action === 'invite' || input.action === 'revoke') {
      if (input.email === share.owner.email) throw new ApplicationError('conflict', 'The owner is already a member')
      const memberKey = emailKey(input.email)
      const profile = input.action === 'invite' ? await this.profile(input.email) : null
      await this.database.ref().update({
        [`shoppingListShares/${id}/members/${memberKey}`]: profile,
        [`shoppingListShareIndex/${memberKey}/${id}`]: profile ? true : null
      })
      return { ok: true }
    }
    return { ...summary(id, share), isOwner: true, members: Object.values(share.members || {}), items: [], categories: [] } satisfies ShoppingShareSnapshot
  }

  private async mutate(principal: UserPrincipal, share: Share, mutation: z.infer<typeof mutationSchema>): Promise<void> {
    const groceries = this.database.ref(`users/${share.householdId}/groceries`)
    const now = new Date().toISOString()
    const makeGrocery = (item: z.infer<typeof itemFields> & { name: string }) => {
      const { name, ...fields } = item
      return { ...fields, item: name, category: fields.category ?? OTHER_CATEGORY_NAME, bought: false,
        added_at: now, modified_at: now, modified_by: principal.email, created_by: principal.email, list_name: share.listName ?? null }
    }
    if (mutation.operation !== 'delete' && mutation.item.category && mutation.item.category !== OTHER_CATEGORY_NAME) {
      const category = mutation.item.category
      const itemId = mutation.operation === 'update' ? mutation.itemId : groceries.push().key
      if (!itemId) throw new ApplicationError('upstream_failed', 'Firebase did not assign a grocery key')
      const addedGrocery = mutation.operation === 'add' ? makeGrocery(mutation.item) : undefined
      // Categories and all list scopes share this parent. The conditional write
      // rechecks both on conflicts and preserves unrelated Firebase metadata.
      const result = await this.mutateHousehold(share.householdId, household => {
        if (scalar(household.ownerUid) !== share.ownerUid) throw new ApplicationError('forbidden', 'List ownership changed')
        const rows = groceryRows(household.groceries)
        const current = Object.hasOwn(rows, itemId) ? rows[itemId] : undefined
        if (mutation.operation === 'update' && !(current && belongsToShare(current, share))) {
          throw new ApplicationError('forbidden', 'Item does not belong to this shared list')
        }
        if (mutation.operation === 'add' && current) throw new ApplicationError('conflict', 'Grocery key already exists')
        if (scalar(current?.category) !== category && !eligibleCategories(household.categories, rows, share).some(entry => entry.name === category)) {
          throw new ApplicationError('invalid_input', 'Category is unavailable for this shared list')
        }
        const next = current ? updateGrocery(current, mutation.item, now, principal) : addedGrocery
        return {
          value: { ...household, groceries: { ...household.groceries as Record<string, unknown>, [itemId]: next } },
          result: true
        }
      })
      if (!result) throw new ApplicationError('forbidden', 'List ownership changed')
      return
    }
    if (mutation.operation === 'add') {
      await groceries.push(makeGrocery(mutation.item))
      return
    }
    // Check list_name INSIDE the transaction, so moving an item to another list
    // between authorization and write cannot let an old guest modify it.
    let authorizedItem = false
    const result = await groceries.child(mutation.itemId).transaction((row: GroceryItem | null) => {
      authorizedItem = false
      // The first callback may see an empty local cache. A null no-op forces a
      // server compare/retry; aborting here would reject valid uncached items.
      if (!row) return null
      if (!belongsToShare(row, share)) return
      authorizedItem = true
      if (mutation.operation === 'delete') return null
      return updateGrocery(row, mutation.item, now, principal)
    })
    if (!result.committed || !authorizedItem) throw new ApplicationError('forbidden', 'Item does not belong to this shared list')
  }
}
