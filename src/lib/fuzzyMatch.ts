import { normalizeName } from './normalizeName'

// Bulk-import-only heuristic for suggesting an existing product a pasted/typed name
// probably refers to (e.g. "מלפפון" -> "מלפפונים", a plural/prefix drift; "עגבניה" ->
// "עגבניות" or "עגבניות שרי", a near-typo of either). Deliberately kept separate from
// normalizeName's exact-match contract (see that file's own doc comment, which
// explicitly treats "עגבניות" vs "עגבניה" as an accepted, un-fixed gap) — this fuzziness
// is an opt-in, reviewable *suggestion* surfaced only in BulkUploadModal's review step,
// never a silent auto-match, so it can't change behavior anywhere else in the app
// (Siri dedup, receipt reconciliation, stock restock all keep using exact normalizeName
// matching as before).

// Hebrew has 5 letters with a distinct "final form" (sofit) used only when the letter
// ends a word — כ/ך, מ/ם, נ/ן, פ/ף, צ/ץ. "מלפפון" (singular) ends in final-nun (ן), but
// the same letter mid-word in "מלפפונים" (plural) is the regular form (נ) — so without
// folding these to one canonical form first, the plural literally doesn't contain the
// singular as a substring at the character level, and edit distance overcounts a
// same-letter mismatch as a real substitution. Folding first is what actually makes
// the "מלפפון -> מלפפונים" suggestion example work.
const HEBREW_FINAL_TO_REGULAR: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
const foldHebrewFinals = (text: string): string =>
  Array.from(text)
    .map((ch) => HEBREW_FINAL_TO_REGULAR[ch] ?? ch)
    .join('')

// Plain Levenshtein (edit distance), iterative two-row DP — no need for anything
// fancier at the string lengths involved here (single grocery-item words).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  let curr = new Array(b.length + 1).fill(0)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

// Tolerance scales a little with word length: short words need to be near-exact,
// longer words can absorb a couple of edits (a plural suffix, one typo'd letter).
const editToleranceFor = (maxLen: number) => Math.min(2, Math.ceil(maxLen * 0.3))

function wordsCloseEnough(target: string, word: string): boolean {
  if (!target || !word) return false
  if (word.includes(target) || target.includes(word)) return true
  const maxLen = Math.max(target.length, word.length)
  return levenshtein(target, word) <= editToleranceFor(maxLen)
}

// True if `candidateName` plausibly refers to the same product as `typedName`. Checks
// the whole normalized string first, then falls back to each whitespace-separated word
// of a multi-word candidate — so a compound product name like "עגבניות שרי" still
// matches a bare "עגבניה" typo via its first word.
export function isFuzzyProductMatch(typedName: string, candidateName: string): boolean {
  const target = foldHebrewFinals(normalizeName(typedName))
  const candidate = foldHebrewFinals(normalizeName(candidateName))
  if (!target || !candidate) return false
  if (target === candidate) return true
  if (wordsCloseEnough(target, candidate)) return true
  const words = candidate.split(/\s+/)
  return words.length > 1 && words.some((word) => wordsCloseEnough(target, word))
}

// Filters candidates to fuzzy matches and ranks them best-first (exact match, then
// ascending edit distance against whichever of the candidate's words is closest) — so
// when several existing products plausibly match a typed name, the default selection
// in the review UI is the most plausible one.
export function rankFuzzyMatches<T extends { name: string }>(typedName: string, candidates: T[]): T[] {
  const target = foldHebrewFinals(normalizeName(typedName))
  if (!target) return []

  return candidates
    .map((candidate) => {
      const candidateNorm = foldHebrewFinals(normalizeName(candidate.name))
      if (!candidateNorm) return null
      if (!isFuzzyProductMatch(typedName, candidate.name)) return null
      const words = candidateNorm.split(/\s+/)
      const bestDistance = Math.min(levenshtein(target, candidateNorm), ...words.map((word) => levenshtein(target, word)))
      const score = candidateNorm === target ? -1 : bestDistance
      return { candidate, score }
    })
    .filter((entry): entry is { candidate: T; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.candidate)
}
