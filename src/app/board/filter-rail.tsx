'use client'

import { useState } from 'react'

export type FilterGroup = 'people' | 'places' | 'years' | 'kinds'
export type FilterSelection = Record<FilterGroup, ReadonlySet<string>>
export type Facets = Record<FilterGroup, Array<{ value: string; count: number }>>

export const FILTER_GROUPS: Array<{ key: FilterGroup; label: string }> = [
  { key: 'people', label: 'People' },
  { key: 'places', label: 'Places' },
  { key: 'years', label: 'Years' },
  { key: 'kinds', label: 'Kind' },
]

export function emptySelection(): FilterSelection {
  return { people: new Set(), places: new Set(), years: new Set(), kinds: new Set() }
}

export function toggled(
  selection: FilterSelection,
  group: FilterGroup,
  value: string,
): FilterSelection {
  const next = new Set(selection[group])
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return { ...selection, [group]: next }
}

const VISIBLE = 8

/**
 * The top-left FILTER stack: PEOPLE / PLACES / YEARS / KIND. One group open at
 * a time — the rail floats over the canvas, and four open lists would curtain
 * the objects the filter exists to reveal.
 */
export function FilterRail({
  facets,
  selected,
  onToggle,
  onClear,
  className,
}: {
  facets: Facets
  selected: FilterSelection
  onToggle: (group: FilterGroup, value: string) => void
  onClear: () => void
  className?: string
}) {
  const [open, setOpen] = useState<FilterGroup | null>(null)
  const active = FILTER_GROUPS.reduce((n, { key }) => n + selected[key].size, 0)

  return (
    <div
      className={[
        'mn flex w-[168px] flex-col rounded-[12px] border border-hair-strong p-1.5 text-[9px] tracking-[0.08em]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        background: 'color-mix(in srgb, var(--panel) 94%, transparent)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 22px rgb(var(--shadow-ink) / 0.12)',
      }}
    >
      <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-1">
        <span className="font-medium tracking-[0.13em]" style={{ color: 'var(--mute-2)' }}>
          FILTER
        </span>
        {active > 0 ? (
          <button onClick={onClear} className="tracking-[0.08em]" style={{ color: 'var(--accent)' }}>
            CLEAR
          </button>
        ) : null}
      </div>

      {FILTER_GROUPS.map(({ key, label }) => {
        const options = facets[key]
        const picked = selected[key]
        const expanded = open === key
        return (
          <div key={key}>
            <button
              onClick={() => setOpen(expanded ? null : key)}
              aria-expanded={expanded}
              disabled={options.length === 0}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 uppercase disabled:opacity-45"
              style={{ color: picked.size ? 'var(--ink)' : 'var(--mute-2)' }}
            >
              <span className={picked.size ? 'font-medium' : undefined}>
                {label}
                {picked.size ? ` · ${picked.size}` : ''}
              </span>
              <span aria-hidden style={{ color: 'var(--mute-3)' }}>
                {expanded ? '▾' : '▸'}
              </span>
            </button>
            {expanded ? (
              <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="mb-1 flex flex-col gap-0.5 px-1">
                {options.slice(0, VISIBLE).map(({ value, count }) => {
                  const on = picked.has(value)
                  return (
                    <button
                      key={value}
                      onClick={() => onToggle(key, value)}
                      aria-pressed={on}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left uppercase"
                      style={{
                        background: on
                          ? 'color-mix(in srgb, var(--ink) 10%, transparent)'
                          : undefined,
                        color: on ? 'var(--ink)' : 'var(--mute-2)',
                      }}
                    >
                      <span className={['truncate', on ? 'font-medium' : undefined].filter(Boolean).join(' ')}>
                        {value}
                      </span>
                      <span style={{ color: 'var(--mute-3)' }}>{count}</span>
                    </button>
                  )
                })}
                {options.length > VISIBLE ? (
                  <span className="px-1.5 py-1 uppercase" style={{ color: 'var(--mute-3)' }}>
                    + {options.length - VISIBLE} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
