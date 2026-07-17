import { useEffect, useState } from 'react'
import { onValue, whatsNewRef } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import type { WhatsNew } from '../types'

export function useWhatsNew() {
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null)
  const isPrerendering = useIsPrerendering()

  useEffect(() => {
    if (isPrerendering) return
    return onValue(whatsNewRef, (snapshot) => {
      setWhatsNew(snapshot.val())
    })
  }, [isPrerendering])

  return { whatsNew }
}
