import { recipeCandidateSchema } from '../../modules/recipes'
import type { RecipeCandidate } from '../../types'

const PREFIX = 'fridge.recipe-save.v1:'
type Identity = { uid: string; token: string }
type PendingSave = { uid: string; listId: string; operationId: string; recipe: RecipeCandidate }
type Options = {
  identity(): Promise<Identity>
  storage(): Storage
  fetch?: typeof fetch
  uuid?: () => string
}

const scope = (uid: string, listId: string) => PREFIX + JSON.stringify([uid, listId]) + ':'

export const clearPendingRecipeSaves = (storage: Storage): void => {
  for (const key of Object.keys(storage)) if (key.startsWith(PREFIX)) storage.removeItem(key)
}

export const createRecipeSaveClient = (options: Options) => ({
  async pending(listId: string): Promise<RecipeCandidate[]> {
    const { uid } = await options.identity()
    const storage = options.storage()
    return Object.keys(storage).filter((key) => key.startsWith(scope(uid, listId))).flatMap((key) => {
      try {
        const entry = JSON.parse(storage.getItem(key)!) as PendingSave
        if (entry.uid !== uid || entry.listId !== listId) return []
        return [recipeCandidateSchema.parse(entry.recipe)]
      } catch { return [] }
    })
  },
  async save(listId: string, recipe: RecipeCandidate): Promise<{ key: string }> {
    const { uid, token } = await options.identity()
    const normalized = recipeCandidateSchema.parse(recipe)
    const storage = options.storage()
    const key = scope(uid, listId) + JSON.stringify([normalized.source.graphRunId, normalized.id])
    const previous = storage.getItem(key)
    let operationId = (options.uuid ?? (() => crypto.randomUUID()))()
    if (previous) {
      const entry = JSON.parse(previous) as PendingSave
      if (entry.uid !== uid || entry.listId !== listId || JSON.stringify(entry.recipe) !== JSON.stringify(normalized)) {
        throw new Error('This pending save belongs to different recipe data')
      }
      operationId = entry.operationId
    }
    // Persist before sending; unavailable storage fails closed instead of losing replay identity.
    storage.setItem(key, JSON.stringify({ uid, listId, operationId, recipe: normalized } satisfies PendingSave))
    const response = await (options.fetch ?? fetch)('/api/recipes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ listId, operationId, recipe: normalized })
    })
    if (!response.ok) throw new Error(`Recipe save failed (${response.status}); retry keeps the same operation`)
    const result = await response.json() as { key?: unknown }
    if (typeof result.key !== 'string' || !result.key) throw new Error('Recipe save returned an invalid response')
    storage.removeItem(key)
    return { key: result.key }
  }
})
