import { useSearch } from '@tanstack/react-router'
import { useActiveList } from '../hooks/ListContext'
import { sanitizeEmailKey } from '../lib/firebase'
import ListSharingBar from './ListSharingBar'

// The sidebar opens per-shopping-list sharing, never a household-wide grant.
export default function ListMembersModal({ onClose }: { onClose: () => void }) {
  const { activeList, isOwner } = useActiveList()
  const search = useSearch({ strict: false }) as { list?: string; shared?: string }
  if (!activeList || !isOwner || search.shared) return null
  return <ListSharingBar householdId={sanitizeEmailKey(activeList.id)} listName={search.list || null} initiallyOpen onClose={onClose} />
}
