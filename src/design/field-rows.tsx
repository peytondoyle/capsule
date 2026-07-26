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
        <div
          key={row.label}
          className={[
            'flex justify-between gap-4 border-t border-hair py-[9px]',
            i === rows.length - 1 ? 'border-b' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
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
