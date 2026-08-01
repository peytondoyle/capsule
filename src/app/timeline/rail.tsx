import Link from 'next/link'

import type { ArchiveSummary } from '@/server/archive'
import type { listPeopleWithCounts } from '@/server/people'
import { agoLabel, countLine, initialsOf } from '@/lib/format'
import { UnfiledBadge } from '@/components/badge'

type People = Awaited<ReturnType<typeof listPeopleWithCounts>>

/**
 * The 198px left rail. Everything in it is a count, so everything in it is
 * mono — the only prose is the person's own name.
 */
export function Rail({ summary, people }: { summary: ArchiveSummary; people: People }) {
  const nav = [
    { label: 'Timeline', href: '/timeline', count: summary.objects, active: true },
    { label: 'People', href: '/people', count: summary.people },
    { label: 'Places', href: '/places', count: summary.places },
    { label: 'Occasions', href: '/occasions', count: summary.occasions },
    // Rust, always: the whole point of the number is that it nags.
    { label: 'Unfiled', href: '/queue', count: summary.unfiled, accent: true },
  ]

  return (
    <nav className="hidden w-[198px] shrink-0 flex-col border-r border-hair pt-5 lg:flex">
      <UnfiledBadge count={summary.unfiled} />
      <div className="px-[18px] pb-5">
        <div className="mn text-[10.5px] font-semibold tracking-[0.22em]">CAPSULE</div>
        <div className="mn mt-[5px] text-[8.5px] tracking-[0.1em] text-mute-2">
          {countLine([summary.objects, 'object'], [summary.people, 'person'])}
        </div>
      </div>

      {/* The Ledger, the Board and the Cabinet are three views of one archive,
          but until now only the Cabinet linked to the other two — from here the
          only way to reach them was to type the URL. */}
      <ul className="mb-3 flex gap-1 px-2.5">
        {(
          [
            ['LEDGER', '/timeline', true],
            ['BOARD', '/board', false],
            ['CABINET', '/cabinet', false],
          ] as const
        ).map(([label, href, active]) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'mn block rounded px-1.5 py-1 text-[8.5px] tracking-[0.14em]',
                active ? 'text-ink' : 'text-mute-3 hover:text-mute-1',
              ].join(' ')}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-px px-2.5">
        {nav.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={[
                'flex items-center justify-between rounded-md px-2 py-[7px] text-[12.5px]',
                item.active
                  ? 'bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] font-medium'
                  : 'text-mute-1',
              ].join(' ')}
            >
              {item.label}
              <span
                className={[
                  'mn text-[9px]',
                  item.accent && item.count > 0 ? 'text-accent' : 'text-mute-2',
                ].join(' ')}
              >
                {item.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {people.length > 0 ? (
        <>
          <div className="mx-[18px] mt-6 mb-2.5 border-t border-hair pt-4">
            <span className="mn text-[8.5px] tracking-[0.14em] text-mute-3">GIVEN BY</span>
          </div>
          <ul className="flex flex-col gap-0.5 px-2.5">
            {people.slice(0, 8).map((person) => (
              <li key={person.id}>
                <Link
                  href={`/people/${person.id}`}
                  className="flex items-center gap-[9px] rounded-md px-2 py-[5px]"
                >
                  <span
                    aria-hidden
                    className="mn flex size-[21px] shrink-0 items-center justify-center rounded-full text-[8.5px] font-semibold"
                    style={{ background: '#e7e0d3', color: '#6d6355' }}
                  >
                    {initialsOf(person.name, person.initials)}
                  </span>
                  <span className="truncate text-[12px] text-mute-1">{person.name}</span>
                  <span className="mn ml-auto text-[9px] text-mute-2">{person.objectCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-auto border-t border-hair px-[18px] py-3.5">
        <div className="mn text-[8.5px] leading-[1.6] tracking-[0.1em] text-mute-3">
          LAST ADDED
          <br />
          {agoLabel(summary.lastAddedAt)}
        </div>
      </div>
    </nav>
  )
}
