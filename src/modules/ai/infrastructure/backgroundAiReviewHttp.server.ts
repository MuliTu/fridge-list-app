import '@tanstack/react-start/server-only'

import { withDeadline } from '../../../lib/withDeadline'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { getDatabaseWithUrl, type Database, type DataSnapshot } from 'firebase-admin/database'
import { getFirebaseAdminApp, parseJsonRequest, type AuthenticatedUserHandler } from '../../identity/server'
import { FirebaseAdminListAuthorizationRepository } from '../../recipes/server'
import { ApplicationError } from '../../shared'
import { createListMutation, type MutateList } from '../../shared/server'
import {
  BACKGROUND_REVIEW_CATEGORY_CORRECTION_LIMIT,
  BACKGROUND_REVIEW_CATEGORY_LIMIT,
  BACKGROUND_REVIEW_ITEM_LIMIT,
  applyBackgroundReviewSchema,
  backgroundReviewCategoryCorrections,
  backgroundReviewItems,
  backgroundReviewRequestSchema,
  type BackgroundReviewItem
} from '../domain/backgroundAiReview'
import { GroqRateLimitError, reviewWithGroq } from './groqBackgroundReview.server'

const responseHeaders = { 'Cache-Control': 'no-store' }
const pause = 60_000
const providerTimeout = 25_000
const leaseDuration = 120_000
const firebaseTimeout = 5_000

type QuotaState = { token?: string; expiresAt?: number; nextCallAt?: number }

const status = (outcome: string, statusCode: number, retryAfterSeconds?: number) =>
  Response.json({ outcome, retryAfterSeconds }, {
    status: statusCode,
    headers: { ...responseHeaders, ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}) }
  })

const cooldown = (snapshot: DataSnapshot) => {
  const value: QuotaState = snapshot.val() ?? {}
  return Math.max(1, Math.ceil((Math.max(value.nextCallAt ?? 0, value.expiresAt ?? 0) - Date.now()) / 1000))
}

const addedAtSchema = z.string().datetime({ offset: true })

const readGroceries = async (db: Database, listId: string) => {
  const query = db.ref(`users/${listId}/groceries`).orderByChild('list_name')
  const primary = await query.equalTo(null).limitToFirst(BACKGROUND_REVIEW_ITEM_LIMIT + 1).get()
  if (primary.numChildren() > BACKGROUND_REVIEW_ITEM_LIMIT) {
    return { exceeded: true, items: [], addedAtByKey: new Map<string, number>() }
  }
  const legacy = await query.equalTo('').limitToFirst(BACKGROUND_REVIEW_ITEM_LIMIT + 1 - primary.numChildren()).get()
  const entries: BackgroundReviewItem[] = []
  const addedAtByKey = new Map<string, number>()
  for (const snapshot of [primary, legacy]) snapshot.forEach((child) => {
    const entry = child.val()
    const key = child.key!
    entries.push({ key, item: entry?.item, bought: entry?.bought, list_name: entry?.list_name, category: entry?.category })
    const addedAt = addedAtSchema.safeParse(entry?.added_at)
    if (addedAt.success) {
      const time = Date.parse(addedAt.data)
      if (Number.isFinite(time)) addedAtByKey.set(key, time)
    }
  })
  return { exceeded: primary.numChildren() + legacy.numChildren() > BACKGROUND_REVIEW_ITEM_LIMIT, items: backgroundReviewItems(entries), addedAtByKey }
}

const categoryNames = (values: readonly unknown[]) => new Set(values.flatMap((value) => {
  const name = value && typeof value === 'object' && 'name' in value ? value.name : null
  return typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 100 ? [name] : []
}))

const readCategories = async (db: Database, listId: string) => {
  const snapshot = await db.ref(`users/${listId}/categories`).limitToFirst(BACKGROUND_REVIEW_CATEGORY_LIMIT + 1).get()
  if (snapshot.numChildren() > BACKGROUND_REVIEW_CATEGORY_LIMIT) return new Set<string>()
  const values: unknown[] = []
  snapshot.forEach((child) => { values.push(child.val()) })
  return categoryNames(values)
}

const digest = (items: BackgroundReviewItem[]) => createHash('sha256').update(JSON.stringify(items)).digest('hex')

const reviewDatabase = (environment: NodeJS.ProcessEnv): Database => {
  const configuredUrl = environment.FIREBASE_DATABASE_URL ?? ''
  const base = new URL(configuredUrl)
  if (environment.FRIDGE_DEMO_MODE !== 'true' &&
    (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    environment.FIREBASE_DATABASE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('Invalid background review database configuration')
  }
  return getDatabaseWithUrl(configuredUrl.replace(/\/$/, ''), getFirebaseAdminApp(environment))
}

type StoredGrocery = BackgroundReviewItem & Record<string, unknown>
type User = { uid: string; email: string | null }
type Household = {
  ownerUid?: string
  members?: Record<string, { status?: string; role?: string }>
  groceries?: Record<string, StoredGrocery>
  categories?: Record<string, unknown>
  listChangeHistory?: Record<string, unknown>
  backgroundReviewOperations?: Record<string, { fingerprint: string; result: ReviewApplyResult }>
}

type ReviewApplyResult = {
  removed: number; renamed: number; skipped: number
  removedKeys: string[]; renamedKeys: string[]; skippedKeys: string[]
  recategorized?: number; recategorizedKeys?: string[]
}

const containsPriority = (value: unknown): boolean => Boolean(value && typeof value === 'object' &&
  (Object.hasOwn(value, '.priority') || Object.values(value).some(containsPriority)))

const replayKeys = (value: unknown): string[] => value && typeof value === 'object'
  ? Object.values(value).filter((key): key is string => typeof key === 'string') : []

const applyReview = async (
  db: Database, mutateList: MutateList, listId: string, user: User, now: Date, input: unknown, signal: AbortSignal
): Promise<Response> => {
  const parsed = applyBackgroundReviewSchema.safeParse(input)
  if (!parsed.success) return status('invalid', 400)
  const { version, removals, renames, categoryChanges, actorUid, operationId } = parsed.data
  if (actorUid !== user.uid) return status('forbidden', 403)
  const operationKey = createHash('sha256').update(JSON.stringify([user.uid, listId, 'background-review', operationId])).digest('hex')
  const fingerprint = createHash('sha256').update(JSON.stringify({
    version, removals: [...removals].sort(), renames: [...renames].sort((a, b) => a.key.localeCompare(b.key)),
    ...(categoryChanges.length ? { categoryChanges: [...categoryChanges].sort((a, b) => a.key.localeCompare(b.key)) } : {})
  })).digest('hex')
  let outcome: ReviewApplyResult | undefined
  let rejection = 'stale'

  const list = db.ref(`users/${listId}`)
  const history = list.child('listChangeHistory')
  const changedAt = now.toISOString()
  const operations = [
    ...removals.map((key) => ({ key, type: 'removed' as const, name: null, historyId: history.push().key! })),
    ...renames.map(({ key, name }) => ({ key, type: 'renamed' as const, name, historyId: history.push().key! }))
  ]
  const hasCategoryChanges = categoryChanges.length > 0
  const applied = await mutateList(listId, (exported) => {
    signal.throwIfAborted()
    const household = exported as Household
    // Unrelated export subtrees and their metadata pass through verbatim.
    // Fail closed only for values this command decodes; the ETag protects
    // this eligibility check against concurrent metadata changes.
    if (containsPriority({ ownerUid: household.ownerUid, member: household.members?.[user.uid],
      groceries: household.groceries, categories: hasCategoryChanges ? household.categories : undefined, replay: household.backgroundReviewOperations?.[operationKey] })) {
      rejection = 'ineligible'; return undefined
    }
    const member = household.members?.[user.uid]
    if (household.ownerUid !== user.uid && (member?.status !== 'approved' || member?.role !== 'editor')) return undefined
    // The common ancestor is required for membership, version, audit and replay
    // atomicity. Bound this opt-in command; unrelated subtrees are preserved.
    if (Buffer.byteLength(JSON.stringify(household)) > 1_048_576) { rejection = 'ineligible'; return undefined }
    const replay = household.backgroundReviewOperations?.[operationKey]
    if (replay) {
      if (replay.fingerprint !== fingerprint) { rejection = 'conflict'; return undefined }
      // RTDB omits empty arrays. Restore the complete HTTP response shape.
      outcome = { ...replay.result, removedKeys: replayKeys(replay.result.removedKeys),
        renamedKeys: replayKeys(replay.result.renamedKeys), skippedKeys: replayKeys(replay.result.skippedKeys),
        ...(hasCategoryChanges ? { recategorizedKeys: replayKeys(replay.result.recategorizedKeys) } : {}) }
      return { value: exported, result: outcome }
    }
    if (Object.keys(household.backgroundReviewOperations ?? {}).filter((key) => key !== '.priority').length >= 500) { rejection = 'ineligible'; return undefined }
    const groceries = { ...household.groceries }
    const entries = Object.entries(groceries).map(([key, item]) => ({ ...item, key }))
    const mainItems = backgroundReviewItems(entries)
    if (mainItems.length > BACKGROUND_REVIEW_ITEM_LIMIT || digest(mainItems) !== version) return undefined
    const mainKeys = new Set(mainItems.map(({ key }) => key))
    if (hasCategoryChanges) {
      const values = Object.values(household.categories ?? {})
      if (values.length > BACKGROUND_REVIEW_CATEGORY_LIMIT) { rejection = 'ineligible'; return undefined }
      const allowed = new Map(backgroundReviewCategoryCorrections(mainItems, categoryNames(values), 'en')
        .map(({ key, category }) => [key, category]))
      if (categoryChanges.some(({ key, category }) => allowed.get(key) !== category)) return undefined
    }
    const audit = { ...household.listChangeHistory }
    const removedKeys: string[] = []
    const renamedKeys: string[] = []
    const skippedKeys: string[] = []
    for (const operation of operations) {
      const item = groceries[operation.key]
      if (!mainKeys.has(operation.key) || !Object.hasOwn(groceries, operation.key) || !item || typeof item.item !== 'string') return undefined
      // Cross-database image deletion cannot join this RTDB transaction.
      // Keep image-backed rows intact and report them explicitly as skipped.
      if (!operation.name && (item.image_ref || item.image_url)) { skippedKeys.push(operation.key); continue }
      audit[operation.historyId] = {
        type: operation.type,
        itemKey: operation.key,
        itemName: operation.name ?? item.item,
        listName: item.list_name ?? null,
        changedAt,
        changedBy: user.email,
        ...(operation.name ? { previousName: item.item } : {})
      }
      if (operation.name) {
        renamedKeys.push(operation.key)
        groceries[operation.key] = { ...item, item: operation.name, modified_at: changedAt, modified_by: user.email }
      } else {
        removedKeys.push(operation.key)
        delete groceries[operation.key]
      }
    }
    for (const { key, category } of categoryChanges) {
      groceries[key] = { ...groceries[key], category, modified_at: changedAt, modified_by: user.email }
    }
    outcome = { removed: removedKeys.length, renamed: renamedKeys.length, skipped: skippedKeys.length,
      removedKeys, renamedKeys, skippedKeys,
      ...(hasCategoryChanges ? { recategorized: categoryChanges.length, recategorizedKeys: categoryChanges.map(({ key }) => key) } : {}) }
    const next = { ...household, groceries, ...(operations.length ? { listChangeHistory: audit } : {}),
      backgroundReviewOperations: { ...household.backgroundReviewOperations, [operationKey]: { fingerprint, result: outcome } } }
    if (Buffer.byteLength(JSON.stringify(next)) > 1_048_576) { rejection = 'ineligible'; return undefined }
    return { value: next, result: outcome }
  }, { timeoutMs: firebaseTimeout, maxBytes: 1_048_576, signal })
  if (!applied) return status(rejection, rejection === 'ineligible' ? 422 : 409)
  return Response.json(applied, { headers: responseHeaders })
}

type HandlerOptions = {
  environment: NodeJS.ProcessEnv
  getAuthenticatedUserHandler: () => AuthenticatedUserHandler
  database?: () => Database
  analyze?: typeof reviewWithGroq
  mutateList?: MutateList
}

export const createBackgroundAiReviewHandler = ({
  environment,
  getAuthenticatedUserHandler,
  database = () => reviewDatabase(environment),
  analyze = reviewWithGroq,
  mutateList
}: HandlerOptions) => async ({ request, listId }: { request: Request; listId: string }): Promise<Response> => {
  if (environment.BACKGROUND_AI_REVIEW_ENABLED !== 'true' ||
    (environment.FRIDGE_DEMO_MODE === 'true' && !environment.BACKGROUND_AI_REVIEW_SYNTHETIC_LIST_ID)) {
    return status('disabled', 404)
  }
  const isDemo = environment.FRIDGE_DEMO_MODE === 'true'
  if (isDemo && (environment.NODE_ENV !== 'development' || listId !== environment.BACKGROUND_AI_REVIEW_SYNTHETIC_LIST_ID)) {
    return status('disabled', 404)
  }
  try {
    const apiKey = isDemo
      ? await withDeadline(() => readFile(environment.BACKGROUND_AI_REVIEW_SYNTHETIC_CREDENTIAL_FILE ?? '', 'utf8').then((key) => key.trim()), firebaseTimeout, request.signal)
      : environment.GROQ_BACKGROUND_REVIEW_API_KEY?.trim() || environment.GROQ_API_KEY?.trim()
    if (!apiKey) return status('unavailable', 503)
    return await withDeadline((attemptSignal) => getAuthenticatedUserHandler().handle(
      request,
      request.method === 'GET' ? () => undefined : parseJsonRequest<unknown>,
      async ({ principal, now: requestedAt }, input) => {
        if (principal.uid === 'dev-bypass') {
          throw new ApplicationError('forbidden', 'A verified account is required')
        }
        attemptSignal.throwIfAborted()
        const firebase = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
          try { return await withDeadline(work, firebaseTimeout, attemptSignal) }
          catch (error) {
            if (error instanceof ApplicationError) throw error
            throw new ApplicationError('unavailable', 'Review data temporarily unavailable')
          }
        }
        const db = database()
        const authorization = new FirebaseAdminListAuthorizationRepository(db)
        await firebase(() => authorization.assertAccessible(principal, listId, 'write'))
        if (request.method === 'GET') return Response.json({ enabled: true, synthetic: isDemo }, { headers: responseHeaders })
        if (request.method === 'PUT') return applyReview(db, mutateList ?? createListMutation(db.app, environment.FIREBASE_DATABASE_URL ?? ''), listId, principal, requestedAt, input, attemptSignal)

        const parsed = backgroundReviewRequestSchema.safeParse(input)
        if (!parsed.success) return status('invalid', 400)
        const { version, language } = parsed.data
        const initial = await firebase(() => readGroceries(db, listId))
        if (initial.exceeded || initial.items.some(({ item }) => item.length > 200)) return status('ineligible', 422)
        if (digest(initial.items) !== version) return status('stale', 409)
        if (initial.items.length === 0) return status('ineligible', 422)
        // The demo permits only rows marked by the isolated fixture. A copied
        // grocery record or a browser-supplied arbitrary body cannot reach Groq.
        if (isDemo && initial.items.some(({ item }) => !/^Synthetic grocery [0-9]{1,4}$/.test(item))) {
          return status('ineligible', 422)
        }

        const lease = db.ref(isDemo ? '_server/backgroundAiReview/syntheticGroq' : '_server/backgroundAiReview/groq')
        const token = randomUUID()
        const now = Date.now()
        const claim = await firebase((signal) => lease.transaction((current: QuotaState | null) => {
          if (signal.aborted) return undefined
          if ((current?.expiresAt ?? 0) > now || (current?.nextCallAt ?? 0) > now) return undefined
          return { token, expiresAt: now + leaseDuration, nextCallAt: current?.nextCallAt ?? 0 }
        }))
        if (!claim.committed) return status('rate_limited', 429, cooldown(claim.snapshot))

        let retryAt = 0
        let dispatchedAt: number | null = null
        try {
          // Recheck the source and membership immediately before any egress.
          const source = await firebase(() => readGroceries(db, listId))
          if (source.exceeded || digest(source.items) !== version) return status('stale', 409)
          await firebase(() => authorization.assertAccessible(principal, listId, 'write'))
          if (Date.now() + providerTimeout >= now + leaseDuration) return status('unavailable', 503)
          attemptSignal.throwIfAborted()
          dispatchedAt = Date.now()
          const result = await withDeadline((signal) => analyze(apiKey, source.items, language, signal, undefined, source.addedAtByKey), providerTimeout, attemptSignal)
          await firebase(() => authorization.assertAccessible(principal, listId, 'write'))
          const [latest, categories] = await firebase(() => Promise.all([
            readGroceries(db, listId),
            readCategories(db, listId)
          ]))
          if (latest.exceeded || digest(latest.items) !== version) return status('stale', 409)
          const removedBySuggestion = new Set(result.duplicates.flatMap(({ removeKeys }) => removeKeys))
          const categoryChanges = backgroundReviewCategoryCorrections(latest.items, categories, language)
            .filter(({ key }) => !removedBySuggestion.has(key))
            .slice(0, BACKGROUND_REVIEW_CATEGORY_CORRECTION_LIMIT)
          return Response.json({ version, result: categoryChanges.length ? { ...result, categoryChanges } : result }, { headers: responseHeaders })
        } catch (error) {
          if (error instanceof GroqRateLimitError) {
            retryAt = Date.now() + error.retryAfterSeconds * 1000
            return status('rate_limited', 429, Math.max(1, Math.ceil((Math.max(retryAt,
              (dispatchedAt ?? Date.now()) + pause) - Date.now()) / 1000)))
          }
          if (error instanceof ApplicationError) throw error
          return status('unavailable', 502)
        } finally {
          // Until this succeeds, the 120-second lease prevents another start.
          // Dispatch occurs within the 45-second attempt, so lease expiry also
          // preserves at least 60 seconds after even the latest allowed start.
          await withDeadline((signal) => lease.transaction((current: QuotaState | null) => {
            if (signal.aborted) return undefined
            // A cold SDK cache supplies null before reading the authoritative
            // value. Returning null forces compare-and-retry; undefined would
            // abort locally and strand the successful request's active lease.
            if (current === null) return null
            if (current.token !== token) return undefined
            return { nextCallAt: Math.max(current.nextCallAt ?? 0,
              dispatchedAt === null ? 0 : dispatchedAt + pause,
              retryAt) }
          }), firebaseTimeout).catch(() => undefined)
        }
      }
    ), 45_000, request.signal)
  } catch {
    return status('unavailable', 503)
  }
}
