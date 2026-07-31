import type { ReactNode } from 'react'

import { MonoLabel } from './text'

export type FieldRow = {
  label: string
  value: ReactNode
  /** Renders the value in mono — dates and dimensions, not names or places. */
  mono?: boolean
}

/**
 * The five fields, everywhere. Hairline-separated label/value rows: mono
 * archival label on the left, warm prose value on the right.
 *
 * Ledger calls them FROM / RECEIVED / ORIGIN / OCCASION; Cabinet calls the same
 * columns GIVEN BY / ACCESSIONED / PROVENANCE / OCCASION. Same component.
 */
export function FieldRows({ rows, className }: { rows: FieldRow[]; className?: string }) {
  return (
    <dl className={['flex flex-col', className].filter(Boolean).join(' ')}>
      {rows.map((row, i) => (
        <div key={row.label} className={rowShell(i === rows.length - 1)}>
          <dt className="shrink-0">
            <MonoLabel>{row.label}</MonoLabel>
          </dt>
          <dd
            className={
              row.mono
                ? 'mn text-right text-[11.5px]'
                : 'text-right text-[12.5px] font-medium text-ink'
            }
          >
            {row.value ?? <span className="text-mute-3">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The row chrome, shared by the read and edit views so they cannot drift into
 * two different rhythms — the edit panel has to land on exactly the baseline
 * grid the read panel left, or toggling EDIT visibly nudges the whole column.
 */
function rowShell(last: boolean) {
  return ['flex items-center justify-between gap-3 border-t border-hair py-[9px]', last ? 'border-b' : '']
    .filter(Boolean)
    .join(' ')
}

export type EditableFieldRow = {
  label: string
  /** Form field name — must match what saveFieldsAction reads. */
  name: string
  defaultValue?: string | null
  placeholder?: string
  /**
   * `date` renders a native picker. Worth the browser chrome: hand-typing an
   * ISO string was the whole complaint, and the value posts as YYYY-MM-DD
   * either way.
   */
  type?: 'text' | 'date'
}

/**
 * The same five fields, writable in place.
 *
 * Deliberately not a boxed form: each value keeps the hairline row it had when
 * it was read-only, gains a transparent bottom rule that inks in on focus, and
 * nothing grows a border. "Hairline rules, never boxes" applies to inputs too —
 * a panel of bordered text fields would read as a settings dialogue, not as the
 * archive's own inspector.
 */
export function FieldRowsEdit({ rows }: { rows: EditableFieldRow[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row, i) => (
        <div key={row.name} className={rowShell(i === rows.length - 1)}>
          <dt className="shrink-0">
            <label htmlFor={`field-${row.name}`}>
              <MonoLabel>{row.label}</MonoLabel>
            </label>
          </dt>
          <dd className="min-w-0 flex-1 text-right">
            <input
              id={`field-${row.name}`}
              name={row.name}
              type={row.type ?? 'text'}
              defaultValue={row.defaultValue ?? ''}
              placeholder={row.placeholder}
              className={[
                'appearance-none border-b border-transparent bg-transparent text-right',
                'outline-none transition-colors focus:border-hair-strong',
                'placeholder:font-normal placeholder:text-mute-3',
                row.type === 'date'
                  ? // Sized to its content and pushed right by the row, not
                    // stretched: Chrome lays a date input's shadow tree out as
                    // [edit][spacer][indicator], so a full-width one pins its
                    // digits to the left however it is text-aligned, and the one
                    // mono field in the panel ends up the only one off the grid.
                    'mn mn-date w-auto text-[11.5px] tabular-nums'
                  : 'w-full text-[12.5px] font-medium text-ink',
              ].join(' ')}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}
