'use client'

import { useOptimistic, useTransition } from 'react'

import { RetentionPill, RetentionToggle, type Retention } from '@/design'
import { setRetentionAction } from '@/server/actions/objects'

/**
 * "Still have it" / "Only here now", wired.
 *
 * The pill variant is read-only on purpose — on the phone the state is context,
 * and a tappable status dot invites accidental edits to something the archive
 * treats as a fact about the physical world.
 */
export function RetentionControl({
  objectId,
  value,
  location,
  variant = 'toggle',
}: {
  objectId: string
  value: Retention
  location?: string | null
  variant?: 'toggle' | 'pill'
}) {
  const [, startTransition] = useTransition()
  const [shown, apply] = useOptimistic(value, (_current: Retention, next: Retention) => next)

  if (variant === 'pill') {
    return <RetentionPill value={shown} location={location} />
  }

  return (
    <RetentionToggle
      value={shown}
      location={location}
      onSelect={(next) => {
        if (next === shown) return
        startTransition(async () => {
          apply(next)
          await setRetentionAction(objectId, next)
        })
      }}
    />
  )
}
