import { canDeleteActiveCustomList } from './listDeletionEligibility'

const eligible = {
  authenticated: true,
  isOwner: true,
  activeListName: 'Weekend trip',
  remainingSelectableListCount: 1,
  pending: false
}

describe('custom-list deletion eligibility', () => {
  it('allows an owner to delete the last custom list when the permanent list remains', () => {
    expect(canDeleteActiveCustomList(eligible)).toBe(true)
  })

  it.each([
    ['signed-out user', { authenticated: false }],
    ['shared participant', { isOwner: false }],
    ['permanent list', { activeListName: null }],
    ['list without a fallback', { remainingSelectableListCount: 0 }],
    ['pending deletion', { pending: true }]
  ])('fails closed for a %s', (_label, override) => {
    expect(canDeleteActiveCustomList({ ...eligible, ...override })).toBe(false)
  })
})
