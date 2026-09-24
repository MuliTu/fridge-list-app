import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type RuleNode = {
  [key: string]: RuleNode | string | boolean
}

const rootDir = resolve(__dirname, '..')
const firebaseConfig = JSON.parse(readFileSync(resolve(rootDir, 'firebase.json'), 'utf8'))
const rulesDocument = JSON.parse(readFileSync(resolve(rootDir, 'database.rules.json'), 'utf8')) as { rules: RuleNode }
const rules = rulesDocument.rules

describe('version-controlled RTDB rules', () => {
  it('points Firebase at the checked-in rules and configures only the local database emulator', () => {
    expect(firebaseConfig.database.rules).toBe('database.rules.json')
    expect(firebaseConfig.emulators.database).toEqual({ host: '127.0.0.1', port: 9000 })
  })

  it('defaults all reads and writes to denied', () => {
    expect(rules['.read']).toBe(false)
    expect(rules['.write']).toBe(false)
    expect((rules.users as RuleNode)['.read']).toBeUndefined()
    expect((rules.users as RuleNode)['.write']).toBeUndefined()
  })

  it.each(['groceries', 'categories', 'stock', 'receipts'])('denies browser writes to %s', (collection) => {
    const listRule = ((rules.users as RuleNode).$listId as RuleNode)[collection] as RuleNode
    expect(listRule['.write']).toBe(false)
    expect(listRule['.read']).toContain("firebase.sign_in_provider != 'anonymous'")
    expect(listRule['.read']).toContain("child('ownerUid').val() === auth.uid")
    expect(listRule['.read']).toContain("child('members').child(auth.uid).child('status').val() === 'approved'")
  })

  it('keeps all authority bindings server-owned', () => {
    const listRules = (rules.users as RuleNode).$listId as RuleNode
    expect((listRules.ownerUid as RuleNode)['.write']).toBe(false)
    expect(((listRules.members as RuleNode).$uid as RuleNode)['.write']).toBe(false)
    expect((listRules.invites as RuleNode)['.write']).toBe(false)
    expect((listRules.memberOf as RuleNode)['.write']).toBe(false)
    expect(((rules.identityBindings as RuleNode).$uid as RuleNode)['.write']).toBe(false)
  })

  it('allows owner-only writes solely for bounded list metadata', () => {
    const listRules = (rules.users as RuleNode).$listId as RuleNode
    for (const metadata of ['name', 'config']) {
      const writeRule = (listRules[metadata] as RuleNode)['.write']
      expect(writeRule).toContain("firebase.sign_in_provider != 'anonymous'")
      expect(writeRule).toContain("child('ownerUid').val() === auth.uid")
    }
  })

  it('allows authenticated users to write only their own bounded feedback records', () => {
    const feedbackRecordRule = (rules.feedbacks as RuleNode).$feedbackId as RuleNode

    expect((rules.feedbacks as RuleNode)['.read']).toBe(false)
    expect((rules.feedbacks as RuleNode)['.write']).toBe(false)
    expect(feedbackRecordRule['.read']).toBe(false)
    expect(feedbackRecordRule['.write']).toContain("firebase.sign_in_provider != 'anonymous'")
    expect(feedbackRecordRule['.write']).toContain("newData.child('userId').val() === auth.token.email")
    expect(feedbackRecordRule['.write']).toContain("data.child('userId').val() === auth.token.email")
    expect(feedbackRecordRule['.validate']).toContain("newData.child('message').val().length <= 4000")
    expect(feedbackRecordRule['.validate']).toContain("newData.child('status').val() === 'needs_attention'")
  })
})
