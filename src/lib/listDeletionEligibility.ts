type ListDeletionEligibility = {
  authenticated: boolean
  isOwner: boolean
  activeListName: string | null
  remainingSelectableListCount: number
  pending: boolean
}

export const canDeleteActiveCustomList = ({
  authenticated,
  isOwner,
  activeListName,
  remainingSelectableListCount,
  pending
}: ListDeletionEligibility): boolean =>
  authenticated &&
  isOwner &&
  Boolean(activeListName) &&
  remainingSelectableListCount > 0 &&
  !pending
