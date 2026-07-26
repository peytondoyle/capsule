import { SectionLabel } from './text'

/**
 * "Still have it" / "Only here now".
 *
 * The one state that is not one of the five fields, and the reason the archive
 * is not just a photo album: some of these entries replace the physical object
 * and some do not.
 */

export type Retention = 'retained' | 'digital_only'

/** Desktop inspector: segmented control plus the where-is-it line. */
export function RetentionToggle({
  value,
  location,
  onSelect,
}: {
  value: Retention
  location?: string | null
  onSelect?: (next: Retention) => void
}) {
  const options: Array<{ key: Retention; label: string }> = [
    { key: 'retained', label: 'Still have it' },
    { key: 'digital_only', label: 'Only here now' },
  ]

  return (
    <div>
      <SectionLabel className="mb-[9px]">The object itself</SectionLabel>
      <div className="flex gap-1.5" role="group">
        {options.map((option) => {
          const selected = option.key === value
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              onClick={onSelect ? () => onSelect(option.key) : undefined}
              className={[
                'flex-1 rounded-[7px] py-2 text-center text-[11.5px] transition-colors',
                selected
                  ? 'bg-ink font-medium text-bg'
                  : 'border border-hair-strong text-mute-1',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {value === 'retained' && location ? (
        <div className="mn mt-[9px] text-[9px] tracking-[0.05em] uppercase text-mute-2">
          {location}
        </div>
      ) : null}
    </div>
  )
}

/** Phone object view: a single pill with the status dot. */
export function RetentionPill({
  value,
  location,
}: {
  value: Retention
  location?: string | null
}) {
  const retained = value === 'retained'
  return (
    <div className="flex items-center gap-2.5 rounded-[11px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-3.5 py-3">
      <span
        aria-hidden
        className="size-[7px] rounded-full"
        style={{
          background: retained ? 'var(--ok)' : 'var(--mute-3)',
          // The Cabinet lights its dot; on paper a glow would look like a bug.
          boxShadow: retained ? '0 0 8px color-mix(in srgb, var(--ok) 60%, transparent)' : 'none',
        }}
      />
      <span className="text-[12.5px] font-medium">
        {retained ? 'Still have it' : 'Only here now'}
      </span>
      {retained && location ? (
        <span className="mn ml-auto text-[9px] tracking-[0.06em] uppercase text-mute-2">
          {location}
        </span>
      ) : null}
    </div>
  )
}
