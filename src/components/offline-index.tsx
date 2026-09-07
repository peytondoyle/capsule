import { useMemo, useState } from 'react'

import { initialsOf } from '@/lib/format'
import { archiveIndex, type ArchiveIndexKind } from '@/lib/offline/indexes'
import { textValue } from '@/lib/offline/library'
import { offlineHref } from '@/lib/offline/navigation'
import type { SyncSnapshot } from '@/lib/offline/types'

export const indexLabels = { people: 'People', places: 'Places', occasions: 'Occasions' }
const inputClass = 'min-h-11 w-full border-b border-hair-strong bg-transparent px-1 text-[14px] focus-visible:outline-2 focus-visible:outline-accent'

export function OfflineIndex({ snapshot, kind, initialQuery }: { snapshot: SyncSnapshot; kind: ArchiveIndexKind; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [limit, setLimit] = useState(50)
  const rows = useMemo(() => archiveIndex(snapshot, kind, query), [snapshot, kind, query])
  const total = snapshot[kind].length
  return <section className="mx-auto mt-8 max-w-[620px]">
    <div className="flex items-baseline justify-between gap-4 border-b border-hair pb-5"><h1 className="text-[27px] font-semibold tracking-tight">{indexLabels[kind]}</h1><span className="mn text-[9px] tracking-[0.1em] text-mute-2">{total} SAVED</span></div>
    <p className="mt-4 text-[14px] leading-relaxed text-mute-2">{kind === 'people' ? 'The people behind your objects—givers, people pictured, and people in their stories.' : kind === 'places' ? 'Where your objects came from. Open a place to see the objects linked to it.' : 'The moments your objects remember. Open an occasion to see what you kept.'}</p>
    <label className="mt-6 grid gap-1"><span className="mn text-[9px] tracking-[0.1em]">SEARCH {indexLabels[kind].toUpperCase()}</span><input type="search" className={inputClass} value={query} placeholder={kind === 'people' ? 'Name or note…' : kind === 'places' ? 'Name or kind of place…' : 'Occasion name…'} onChange={event => { setQuery(event.target.value); setLimit(50); history.replaceState(null, '', offlineHref({ section: kind, query: event.target.value })) }} /></label>
    <p role="status" className="mn mt-5 text-[9px] tracking-[0.1em] text-mute-2">{rows.length} {(rows.length === 1 ? kind === 'people' ? 'Person' : kind === 'places' ? 'Place' : 'Occasion' : indexLabels[kind]).toUpperCase()}{query ? ' FOUND' : ''}</p>
    <ul className="mt-3">{rows.slice(0, limit).map(({ record, objectCount }) => <li key={record.id} className="border-b border-hair">
      <a href={offlineHref({ section: kind, entry: record.id })} className="flex min-h-16 items-center gap-3 py-4 focus-visible:outline-2 focus-visible:outline-accent">
        {kind === 'people' ? <span aria-hidden className="mn flex size-9 shrink-0 items-center justify-center rounded-full bg-panel text-[10px] font-semibold">{initialsOf(textValue(record.name), textValue(record.initials))}</span> : null}
        <div className="min-w-0 flex-1"><span className="block break-words text-[16px] font-medium">{textValue(record.name)}</span>{kind === 'places' && record.kind ? <span className="mt-1 block text-[12px] text-mute-2">{textValue(record.kind).replaceAll('_', ' ')}</span> : null}{record.localOnly ? <span className="mn mt-1 block text-[8px] tracking-[0.08em] text-accent">SAVED ON DEVICE</span> : null}</div>
        <span className="mn shrink-0 text-[9px] tracking-[0.08em] text-mute-2">{objectCount} {objectCount === 1 ? 'OBJECT' : 'OBJECTS'}</span>
      </a>
    </li>)}</ul>
    {!rows.length ? <p className="mt-8 text-[14px] text-mute-2">{query ? 'No matches. Try another name or clear the search.' : `No ${indexLabels[kind].toLowerCase()} saved yet. Add them while editing an object’s details.`}</p> : null}
    {rows.length > limit ? <button type="button" className="mn mt-5 min-h-11 px-2 text-[9px] tracking-[0.1em] underline" onClick={() => setLimit(value => value + 50)}>SHOW MORE · {rows.length - limit} REMAINING</button> : null}
  </section>
}
