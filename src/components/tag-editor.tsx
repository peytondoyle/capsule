'use client'

import { useOptimistic, useRef, useState, useTransition } from 'react'

import { Chip } from '@/design'
import { addTagAction, removeTagAction } from '@/server/actions/objects'

type Tag = { id: string; name: string }

/**
 * Tags, optimistic. A tag is a two-word thought — waiting on a round trip to
 * see it appear is the difference between filing things and not bothering.
 */
export function Tags({ objectId, tags }: { objectId: string; tags: Tag[] }) {
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [shown, apply] = useOptimistic(
    tags,
    (current: Tag[], change: { type: 'add'; name: string } | { type: 'remove'; id: string }) =>
      change.type === 'add'
        ? [...current, { id: `pending:${change.name}`, name: change.name }]
        : current.filter((tag) => tag.id !== change.id),
  )

  function add(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      apply({ type: 'add', name: trimmed })
      await addTagAction(objectId, trimmed)
    })
  }

  function remove(tag: Tag) {
    if (tag.id.startsWith('pending:')) return
    startTransition(async () => {
      apply({ type: 'remove', id: tag.id })
      await removeTagAction(objectId, tag.id)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((tag) => (
        <Chip
          key={tag.id}
          as="button"
          size="md"
          onClick={() => remove(tag)}
          // These chips DELETE. Their accessible name was just the tag text, so
          // a screen reader announced "Portugal, button" for a control that
          // removes Portugal, and nothing sighted said so either — hence the ×.
          aria-label={`Remove tag ${tag.name}`}
          title={`Remove ${tag.name}`}
          className={tag.id.startsWith('pending:') ? 'opacity-50' : undefined}
        >
          {tag.name}
          <span aria-hidden className="ml-1.5 text-mute-3">
            ×
          </span>
        </Chip>
      ))}

      {adding ? (
        <form
          action={() => {
            add(inputRef.current?.value ?? '')
            if (inputRef.current) inputRef.current.value = ''
            setAdding(false)
          }}
        >
          <input
            ref={inputRef}
            name="tag"
            autoFocus
            placeholder="tag"
            // Commit on blur rather than discard. Typing a tag and clicking
            // away silently threw it out — the one interaction where losing
            // what someone typed is least excusable, since the whole control
            // is three keystrokes long.
            onBlur={(event) => {
              const value = event.currentTarget.value.trim()
              if (value) add(value)
              event.currentTarget.value = ''
              setAdding(false)
            }}
            onKeyDown={(event) => {
              // Escape is the discard, explicitly.
              if (event.key === 'Escape') {
                event.currentTarget.value = ''
                setAdding(false)
              }
            }}
            className="mn w-[110px] rounded-full border border-dashed border-hair-strong bg-transparent px-3 py-2 text-[10px] tracking-[0.06em] uppercase outline-none placeholder:text-mute-3"
          />
        </form>
      ) : (
        <Chip as="button" size="md" variant="add" onClick={() => setAdding(true)}>
          + tag
        </Chip>
      )}
    </div>
  )
}
