'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Chip, SectionLabel, StickerDeck } from '@/design'
import { fileItemAction, skipItemsAction } from '@/server/actions/intake'

type Suggestion = { value: string; confidence: number }
type Item = {
  id: string
  cutoutUrl: string | null
  suggestions: Record<string, Suggestion | undefined> | null
}

/**
 * "TAP WHAT'S TRUE. THE REST CAN WAIT."
 *
 * The instruction is the design. Nothing is required, every suggestion is a
 * chip you confirm rather than a field you correct, and the story is one line
 * you can skip. An item filed with nothing but a photograph is a success — it
 * just lands in Unfiled.
 */
export function Filer({
  items,
  people,
  places,
}: {
  items: Item[]
  people: string[]
  places: string[]
}) {
  // Always the head of the list. Filing or skipping revalidates /queue and the
  // handled item drops out of listPendingIntake, so the array shortening *is*
  // the advance — incrementing an index on top of that skipped every other
  // item and ended the queue early.
  const item = items[0]

  if (!item) {
    return (
      <div className="pt-16 text-center">
        <p className="text-[14px] text-mute-1">Nothing left to file.</p>
        <a
          href="/timeline"
          className="mn mt-6 inline-flex h-11 items-center rounded-[11px] bg-ink px-5 text-[10px] tracking-[0.14em] text-bg"
        >
          BACK TO THE TIMELINE
        </a>
      </div>
    )
  }

  return (
    // Keyed by item id so every card starts blank. Resetting this in an effect
    // would mean a render where the new card briefly shows the old card's answers.
    <Card
      key={item.id}
      item={item}
      people={people}
      places={places}
      remaining={items.length}
    />
  )
}

function Card({
  item,
  people,
  places,
  remaining,
}: {
  item: Item
  people: string[]
  places: string[]
  remaining: number
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const personRef = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<{ person?: string; place?: string; date?: string }>({})
  const [namingPerson, setNamingPerson] = useState(false)

  const suggested = item.suggestions ?? {}

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  const placeOptions = [
    ...new Set([suggested.place?.value, ...places].filter(Boolean)),
  ] as string[]
  const dateOptions = [...new Set([suggested.date?.value].filter(Boolean))] as string[]

  return (
    <form
      action={(formData) => run(() => fileItemAction(item.id, formData))}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center justify-between">
        <a href="/timeline" className="text-[13px] text-mute-2">
          Done
        </a>
        <span className="mn text-[9px] tracking-[0.14em] text-mute-3">
          {remaining} UNFILED
        </span>
        <button
          type="button"
          onClick={() => run(() => skipItemsAction([item.id]))}
          disabled={busy}
          className="text-[13px] text-mute-2"
        >
          Skip
        </button>
      </div>

      <div className="flex flex-col items-center py-6">
        <StickerDeck
          depth={Math.min(2, Math.max(0, remaining - 1))}
          top={{
            width: 200,
            silhouette: 'card',
            cut: 'edge',
            rotate: 1.5,
            src: item.cutoutUrl ?? undefined,
            label: item.cutoutUrl ? undefined : 'not cut out yet',
          }}
        />
        <a
          href={`/accession/${item.id}`}
          className="mn mt-4 text-[8.5px] tracking-[0.12em] text-mute-2 underline decoration-hair-strong underline-offset-4 uppercase"
        >
          Adjust the cut
        </a>
      </div>

      <input type="hidden" name="title" value={suggested.title?.value ?? 'Untitled'} />
      {suggested.kind?.value ? (
        <input type="hidden" name="kind" value={suggested.kind.value} />
      ) : null}
      {chosen.date ? <input type="hidden" name="receivedAt" value={chosen.date} /> : null}
      {chosen.place ? <input type="hidden" name="place" value={chosen.place} /> : null}

      <SectionLabel className="mb-2.5">Tap what&rsquo;s true. The rest can wait.</SectionLabel>

      <div className="flex flex-wrap items-center gap-1.5">
        {people.map((name) => (
          <Chip
            key={name}
            as="button"
            size="md"
            variant={chosen.person === name ? 'solid' : 'quiet'}
            onClick={() =>
              setChosen((c) => ({ ...c, person: c.person === name ? undefined : name }))
            }
          >
            {name}
          </Chip>
        ))}

        {namingPerson ? (
          <input
            ref={personRef}
            name="givenBy"
            autoFocus
            placeholder="who?"
            className="mn w-[120px] rounded-full border border-dashed border-hair-strong bg-transparent px-3 py-2 text-[10px] tracking-[0.06em] uppercase outline-none placeholder:text-mute-3"
          />
        ) : (
          <>
            {chosen.person ? <input type="hidden" name="givenBy" value={chosen.person} /> : null}
            <Chip as="button" size="md" variant="add" onClick={() => setNamingPerson(true)}>
              + someone
            </Chip>
          </>
        )}
      </div>

      {placeOptions.length || dateOptions.length ? (
        <>
          <div className="my-4 h-px bg-hair" />
          <div className="flex flex-wrap gap-1.5">
            {placeOptions.map((name) => (
              <Chip
                key={name}
                as="button"
                size="md"
                variant={chosen.place === name ? 'solid' : 'quiet'}
                onClick={() =>
                  setChosen((c) => ({ ...c, place: c.place === name ? undefined : name }))
                }
              >
                {name}
                {suggested.place?.value === name ? (
                  <span className="ml-2 text-accent">
                    {Math.round(suggested.place.confidence * 100)}%
                  </span>
                ) : null}
              </Chip>
            ))}
            {dateOptions.map((value) => (
              <Chip
                key={value}
                as="button"
                size="md"
                variant={chosen.date === value ? 'solid' : 'quiet'}
                onClick={() =>
                  setChosen((c) => ({ ...c, date: c.date === value ? undefined : value }))
                }
              >
                {value}
                {suggested.date?.value === value ? (
                  <span className="ml-2 text-accent">
                    {Math.round(suggested.date.confidence * 100)}%
                  </span>
                ) : null}
              </Chip>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-4 rounded-[12px] border border-hair-strong bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] p-3.5">
        <SectionLabel className="mb-1.5">Why it matters · optional</SectionLabel>
        <textarea
          name="story"
          rows={2}
          placeholder="Say one sentence and move on…"
          className="w-full resize-none border-0 bg-transparent text-[13.5px] leading-[1.5] outline-none placeholder:text-mute-3"
        />
      </div>

      <div className="mt-auto flex items-center gap-2 pt-5 pb-6">
        <a
          href="/timeline"
          aria-label="Home"
          className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-hair-strong text-[16px] text-mute-2"
        >
          ⌂
        </a>
        <button
          type="submit"
          disabled={busy}
          className="h-11 flex-1 rounded-[12px] bg-ink text-[14px] font-medium text-bg disabled:opacity-45"
        >
          {busy ? 'Filing…' : remaining > 1 ? `File it · ${remaining - 1} left` : 'File it'}
        </button>
      </div>
    </form>
  )
}
