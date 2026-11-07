export const DUPLICATE_SCAN_ALGORITHM_VERSION = 'lexical-v1'
export const DUPLICATE_SCAN_MAX_ATTEMPTS = 5

export type DuplicateCandidate = {
  id: string
  name: string
  bought: boolean
}
export type DuplicateMatch = {
  findingId: string
  itemIds: [string, string]
  algorithmVersion: string
  reason: 'alias' | 'exact' | 'substring' | 'token_overlap' | 'edit_distance'
  score: number
}
export type DuplicateScanJobRef = { listId: string; itemId: string }
export type ClaimedDuplicateScanJob = DuplicateScanJobRef & { workerId: string; attempts: number }

export const duplicateScanJobId = (listId: string, itemId: string): string =>
  `job_${stableHash(`${listId}\u0000${itemId}`, 2166136261)}${stableHash(`${listId}\u0000${itemId}`, 2246822519)}`

export type DuplicateScanRepository = {
  findReadyJobs(nowIso: string, limit: number): Promise<DuplicateScanJobRef[]>
  claim(job: DuplicateScanJobRef, workerId: string, nowIso: string, leaseUntilIso: string): Promise<ClaimedDuplicateScanJob | null>
  loadCandidates(listId: string): Promise<DuplicateCandidate[]>
  complete(job: ClaimedDuplicateScanJob, findings: DuplicateMatch[], nowIso: string): Promise<void>
  fail(job: ClaimedDuplicateScanJob, errorCode: string, nowIso: string): Promise<void>
}

const ALIASES: ReadonlyArray<ReadonlyArray<string>> = [
  ['חלב', 'chalav', 'milk'],
  ['לחם', 'lechem', 'bread'],
  ['ביצים', 'ביצה', 'eggs', 'egg'],
  ['עגבניה', 'עגבניות', 'tomato', 'tomatoes']
]

const normalize = (value: string): string => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ')

const aliasGroup = (value: string): number => ALIASES.findIndex((group) => group.includes(value))

const boundedEditDistance = (left: string, right: string, maximum: number): number | null => {
  if (Math.abs(left.length - right.length) > maximum) return null
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    let rowMinimum = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      )
      rowMinimum = Math.min(rowMinimum, current[rightIndex])
    }
    if (rowMinimum > maximum) return null
    previous = current
  }
  return previous[right.length] <= maximum ? previous[right.length] : null
}

const stableHash = (value: string, seed: number): string => {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const findingId = (leftId: string, rightId: string): string => {
  const pair = [leftId, rightId].sort()
  const identity = `${DUPLICATE_SCAN_ALGORITHM_VERSION}\u0000${pair.join('\u0000')}`
  return `pair_${stableHash(identity, 2166136261)}${stableHash(identity, 2246822519)}`
}

export const matchDuplicatePair = (left: DuplicateCandidate, right: DuplicateCandidate): DuplicateMatch | null => {
  if (left.id === right.id || left.bought || right.bought) return null
  const leftName = normalize(left.name)
  const rightName = normalize(right.name)
  if (!leftName || !rightName) return null
  const itemIds = [left.id, right.id].sort() as [string, string]
  const base = { findingId: findingId(left.id, right.id), itemIds, algorithmVersion: DUPLICATE_SCAN_ALGORITHM_VERSION }
  if (leftName === rightName) return { ...base, reason: 'exact', score: 1 }
  const leftAlias = aliasGroup(leftName)
  if (leftAlias >= 0 && leftAlias === aliasGroup(rightName)) return { ...base, reason: 'alias', score: 0.98 }

  const shortest = Math.min(leftName.length, rightName.length)
  if (shortest >= 4 && (leftName.includes(rightName) || rightName.includes(leftName))) {
    return { ...base, reason: 'substring', score: Number((shortest / Math.max(leftName.length, rightName.length)).toFixed(3)) }
  }
  const leftTokens = new Set(leftName.split(' '))
  const rightTokens = new Set(rightName.split(' '))
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const tokenScore = overlap / Math.max(leftTokens.size, rightTokens.size)
  if (overlap > 0 && tokenScore >= 2 / 3) return { ...base, reason: 'token_overlap', score: Number(tokenScore.toFixed(3)) }

  if (!leftName.includes(' ') && !rightName.includes(' ') && shortest >= 5) {
    const maximum = shortest >= 8 ? 2 : 1
    const distance = boundedEditDistance(leftName, rightName, maximum)
    if (distance !== null) {
      return { ...base, reason: 'edit_distance', score: Number((1 - distance / Math.max(leftName.length, rightName.length)).toFixed(3)) }
    }
  }
  return null
}

export const findDuplicateMatches = (sourceId: string, candidates: DuplicateCandidate[]): DuplicateMatch[] => {
  const source = candidates.find((candidate) => candidate.id === sourceId)
  if (!source || source.bought) return []
  return candidates
    .map((candidate) => matchDuplicatePair(source, candidate))
    .filter((match): match is DuplicateMatch => match !== null)
    .sort((left, right) => left.findingId.localeCompare(right.findingId))
}

export const processDuplicateScanJobs = async (
  repository: DuplicateScanRepository,
  options: { now: Date; workerId: string; limit?: number; leaseMs?: number }
): Promise<{ claimed: number; completed: number; failed: number }> => {
  const nowIso = options.now.toISOString()
  const leaseUntilIso = new Date(options.now.getTime() + (options.leaseMs ?? 60_000)).toISOString()
  const ready = await repository.findReadyJobs(nowIso, Math.max(1, Math.min(options.limit ?? 10, 25)))
  let claimed = 0
  let completed = 0
  let failed = 0
  for (const reference of ready) {
    const job = await repository.claim(reference, options.workerId, nowIso, leaseUntilIso)
    if (!job) continue
    claimed += 1
    try {
      const candidates = await repository.loadCandidates(job.listId)
      await repository.complete(job, findDuplicateMatches(job.itemId, candidates), nowIso)
      completed += 1
    } catch {
      await repository.fail(job, 'scan_failed', nowIso)
      failed += 1
    }
  }
  return { claimed, completed, failed }
}
