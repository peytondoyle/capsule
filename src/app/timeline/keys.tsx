'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { timelineHref } from '@/lib/timeline'
import type { TimelineSort } from '@/server/objects'

/**
 * The Ledger's keyboard. Desktop is where the archive gets *read*, and until
 * this existed the app had no keyboard surface at all beyond the crop editor's
 * arrow keys — the loudest difference from a native Mac app.
 *
 *   ← / →      walk the archive, in the stream's own order
 *   ⌘K or /    focus search
 *   e          edit the selected object in the inspector
 *   n          accession — new photographs
 *   Escape     leave edit mode
 *
 * Navigation is URL state (`?lot=`), so the walker is router.push over the
 * ordered lot list the page already rendered — no client copy of the archive,
 * and the inspector updates exactly as if the cutout had been clicked.
 */
export function TimelineKeys({
  lots,
  activeLot,
  query,
  sort,
  editing,
}: {
  lots: number[]
  activeLot: number | null
  query: string | null
  sort: TimelineSort
  editing: boolean
}) {
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      // ⌘K reaches through everything, like every Mac app's palette key.
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
        return
      }

      if (typing) {
        // Escape backs out of edit mode even from inside its own fields —
        // otherwise the one place you most want it is the one place it fails.
        if (event.key === 'Escape' && editing && activeLot !== null) {
          router.push(timelineHref({ lot: activeLot, q: query, sort }))
        }
        return
      }

      switch (event.key) {
        case '/':
          event.preventDefault()
          document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
          return
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (lots.length === 0) return
          event.preventDefault()
          const at = activeLot === null ? -1 : lots.indexOf(activeLot)
          const next =
            event.key === 'ArrowRight'
              ? lots[Math.min(at + 1, lots.length - 1)]
              : lots[Math.max(at - 1, 0)]
          if (next !== undefined && next !== activeLot) {
            router.push(timelineHref({ lot: next, q: query, sort }))
          }
          return
        }
        case 'e':
          if (activeLot !== null && !editing) {
            event.preventDefault()
            router.push(timelineHref({ lot: activeLot, q: query, sort, edit: true }))
          }
          return
        case 'n':
          event.preventDefault()
          router.push('/accession')
          return
        case 'Escape':
          if (editing && activeLot !== null) {
            router.push(timelineHref({ lot: activeLot, q: query, sort }))
          }
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, lots, activeLot, query, sort, editing])

  return null
}
