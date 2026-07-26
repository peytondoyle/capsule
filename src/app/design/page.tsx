import type { Metadata } from 'next'

import {
  CUT_STYLE_KEYS,
  Chip,
  Cutout,
  FieldRows,
  GrainSurface,
  Inspector,
  Meta,
  MonoLabel,
  RetentionPill,
  RetentionToggle,
  SILHOUETTES,
  SILHOUETTE_KEYS,
  ScanFrame,
  SectionLabel,
  ShelfRule,
  SheetPhone,
  StickerDeck,
  Surface,
  TiltLayer,
  type SurfaceName,
} from '@/design'

export const metadata: Metadata = {
  title: 'Capsule — design system',
  robots: { index: false, follow: false },
}

const SURFACES: SurfaceName[] = ['ledger', 'board', 'cabinet']

const ROWS = [
  { label: 'From', value: 'Dad' },
  { label: 'Received', value: '12 Nov 2019', mono: true },
  { label: 'Origin', value: 'Lisbon Airport, gate 24' },
  { label: 'Occasion', value: 'Coming home' },
]

const STORY =
  'He wrote the gate number on the back in case I forgot where to meet him. I did forget. He waited anyway, holding two coffees, for an hour and ten.'

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="border-t border-hair px-8 py-10">
      <div className="mb-6">
        <h2 className="mn text-[10px] font-semibold tracking-[0.18em] uppercase">{title}</h2>
        {note ? (
          <p className="mt-2 max-w-[68ch] text-[12.5px] leading-relaxed text-pretty text-mute-1">
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

const SECTIONS = [
  'silhouettes',
  'cuts',
  'states',
  'type',
  'fields',
  'texture',
  'capture',
  'assemblies',
] as const
type SectionName = (typeof SECTIONS)[number]

/** Every primitive, on one surface. Rendered three times, once per palette. */
function Gallery({ surface, section }: { surface: SurfaceName; section?: SectionName }) {
  const isCabinet = surface === 'cabinet'
  const show = (name: SectionName) => !section || section === name

  return (
    <Surface name={surface} className="rounded-[10px] border border-hair">
      <div className="flex items-baseline justify-between border-b border-hair px-6 py-3">
        <span className="mn text-[10px] font-semibold tracking-[0.2em] uppercase">{surface}</span>
        <span className="mn text-[8.5px] tracking-[0.12em] uppercase text-mute-3">
          {isCabinet ? 'lit vitrine' : surface === 'board' ? 'work surface' : 'paper'}
        </span>
      </div>

      <div className="space-y-10 p-6">
        {/* --- silhouettes ------------------------------------------------ */}
        {show('silhouettes') ? (
        <div>
          <SectionLabel className="mb-4">Silhouettes · cut style “edge”</SectionLabel>
          <div className="flex flex-wrap items-end gap-8">
            {SILHOUETTE_KEYS.map((key, i) => (
              <div key={key} className="w-[124px]">
                <Cutout
                  width={112}
                  silhouette={key}
                  cut="edge"
                  rotate={[-3, 1.5, -6, 2.5, -1.5, 4, -4][i % 7]!}
                  aspect={key === 'ticket' ? 2.2 : 1.15}
                  label={SILHOUETTES[key].label.toLowerCase()}
                  interactive
                />
                <Meta className="mt-3">{key}</Meta>
              </div>
            ))}
          </div>
        </div>

        ) : null}

        {/* --- cut styles ------------------------------------------------- */}
        {show('cuts') ? (
        <div>
          <SectionLabel className="mb-4">Cut style · silhouette “card”</SectionLabel>
          <div className="flex flex-wrap items-end gap-8">
            {CUT_STYLE_KEYS.map((key, i) => (
              <div key={key} className="w-[124px]">
                <Cutout
                  width={112}
                  silhouette="card"
                  cut={key}
                  rotate={[-2, 3, -5, 1][i]!}
                  label={key.replace('_', '-')}
                  interactive
                />
                <Meta className="mt-3">{key}</Meta>
              </div>
            ))}
          </div>
        </div>

        ) : null}

        {/* --- states ----------------------------------------------------- */}
        {show('states') ? (
        <div>
          <SectionLabel className="mb-4">States</SectionLabel>
          <div className="flex flex-wrap items-end gap-8">
            {(['idle', 'active', 'pending', 'dragging'] as const).map((state) => (
              <div key={state} className="w-[124px]">
                <Cutout
                  width={112}
                  silhouette="ticket"
                  cut="die_cut"
                  rotate={-1.5}
                  aspect={2.2}
                  state={state}
                  label={state}
                />
                <Meta className="mt-3">{state}</Meta>
              </div>
            ))}
          </div>
        </div>

        ) : null}

        {/* --- type + chips ---------------------------------------------- */}
        {show('type') ? (
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SectionLabel className="mb-4">Type</SectionLabel>
            <div className="space-y-3">
              <h3 className="text-[19px] leading-[1.25] font-semibold tracking-[-0.025em]">
                Boarding pass, LIS → JFK
              </h3>
              <Meta>DAD · 12 NOV 2019 · LISBON</Meta>
              <p className="max-w-[42ch] text-[12.5px] leading-[1.6] text-pretty text-mute-1">
                {STORY}
              </p>
              <div className="flex gap-4">
                <MonoLabel>From</MonoLabel>
                <span className="mn text-[11.5px]">0147 · 78 × 210 MM</span>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-4">Chips</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <Chip variant="solid">Portugal</Chip>
              <Chip>Paper</Chip>
              <Chip>Dad</Chip>
              <Chip variant="add">+ tag</Chip>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip size="md" variant="solid">
                Nina
              </Chip>
              <Chip size="md">Theo</Chip>
              <Chip size="md" variant="add">
                + someone
              </Chip>
            </div>
          </div>
        </div>

        ) : null}

        {/* --- fields + retention ---------------------------------------- */}
        {show('fields') ? (
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SectionLabel className="mb-4">Field rows</SectionLabel>
            <FieldRows rows={ROWS} />
          </div>
          <div className="space-y-6">
            <RetentionToggle value="retained" location="In the blue tin, top shelf" />
            <RetentionPill value="retained" location="Blue tin, top shelf" />
            <RetentionPill value="digital_only" />
          </div>
        </div>

        ) : null}

        {/* --- surface-specific ------------------------------------------ */}
        {show('texture') ? (
        <div>
          <SectionLabel className="mb-4">Surface texture</SectionLabel>
          {surface === 'cabinet' ? (
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <span className="mn text-[9px] tracking-[0.18em] uppercase text-mute-2">
                  Shelf I
                </span>
                <span className="text-[13px] font-medium">Lisbon, November 2019</span>
                <span className="mn ml-auto text-[9px] tracking-[0.1em] uppercase text-mute-3">
                  14 lots
                </span>
              </div>
              <div className="flex items-end gap-8 pb-1">
                <Cutout width={140} silhouette="ticket" cut="edge" rotate={-2} aspect={2.2} />
                <Cutout width={70} silhouette="card" cut="edge" rotate={3} aspect={0.8} />
                <Cutout width={86} silhouette="bust" cut="loose" rotate={-4} />
              </div>
              <ShelfRule />
              <div className="flex items-baseline gap-3 pt-4">
                <span className="mn text-[9px] tracking-[0.18em] uppercase text-mute-2">
                  Shelf III
                </span>
                <span className="text-[13px] font-medium">Unattributed</span>
                <span className="mn ml-auto text-[9px] tracking-[0.1em] uppercase text-accent">
                  7 lots awaiting entry
                </span>
              </div>
              <div className="flex items-end gap-8 pb-1 opacity-55">
                <Cutout width={76} silhouette="card" cut="edge" rotate={-3} />
                <Cutout width={52} silhouette="circle" cut="edge" rotate={2} />
              </div>
              <ShelfRule dim />
            </div>
          ) : (
            <GrainSurface className="overflow-hidden rounded-[12px] border border-hair">
              <div className="flex h-[190px] items-center gap-10 px-6">
                <Cutout width={132} silhouette="ticket" cut="edge" rotate={-5} aspect={2.1} interactive />
                <Cutout width={92} silhouette="blob" cut="loose" rotate={4} interactive />
                <Cutout width={104} silhouette="polaroid" cut="edge" rotate={-2} interactive />
              </div>
            </GrainSurface>
          )}
        </div>

        ) : null}

        {/* --- capture ---------------------------------------------------- */}
        {show('capture') ? (
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <SectionLabel className="mb-4">Sticker deck</SectionLabel>
            <StickerDeck
              className="h-[190px]"
              top={{ width: 150, silhouette: 'card', cut: 'edge', rotate: 1.5, label: 'ticket stub' }}
            />
          </div>
          <div>
            <SectionLabel className="mb-4">
              Scan frame · {isCabinet ? 'brackets' : 'handles'}
            </SectionLabel>
            <div className="pt-3 pb-12 pl-3">
              <ScanFrame
                variant={isCabinet ? 'brackets' : 'handles'}
                scanning={isCabinet}
                caption={
                  isCabinet ? (
                    <>
                      Edges locked · hold still
                      <br />
                      <span style={{ color: 'var(--accent)' }}>Reading text on the face…</span>
                    </>
                  ) : (
                    <>
                      Edge found automatically
                      <br />
                      Drag a corner to correct
                    </>
                  )
                }
              >
                <Cutout width={168} silhouette="card" cut="edge" rotate={-2} label="detected: postcard" />
              </ScanFrame>
            </div>
          </div>
        </div>

        ) : null}

        {/* --- assemblies -------------------------------------------------- */}
        {show('assemblies') ? (
        <div>
          <SectionLabel className="mb-4">Inspector · sheet</SectionLabel>
          <div className="flex flex-wrap items-start gap-8">
            <div className="flex overflow-hidden rounded-[10px] border border-hair">
              <Inspector
                width={isCabinet ? 344 : 322}
                hero={
                  <Cutout
                    width={isCabinet ? 200 : 216}
                    silhouette="ticket"
                    cut="die_cut"
                    rotate={-1.5}
                    aspect={2.1}
                    label={isCabinet ? 'recto · verso →' : 'scan · 2400 dpi'}
                    interactive
                  />
                }
                lot={isCabinet ? 'Lot 0147' : 'OBJ-0147'}
                aside={isCabinet ? 'Paper · 78 × 210 mm' : undefined}
                title={
                  <>
                    Boarding pass,
                    <br />
                    {isCabinet ? 'Lisbon to New York' : 'LIS → JFK'}
                  </>
                }
                rows={
                  <FieldRows
                    rows={
                      isCabinet
                        ? [
                            { label: 'Given by', value: 'Dad' },
                            { label: 'Accessioned', value: '12 Nov 2019', mono: true },
                            { label: 'Provenance', value: 'Lisbon, gate 24' },
                            { label: 'Occasion', value: 'Coming home' },
                          ]
                        : ROWS
                    }
                  />
                }
                story={STORY}
                storyLabel={isCabinet ? 'Note' : 'The story'}
                footer={
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>Portugal</Chip>
                    <Chip>Paper</Chip>
                    <Chip>Dad</Chip>
                    <Chip variant="add">+ tag</Chip>
                  </div>
                }
              >
                <RetentionToggle value="retained" location="In the blue tin, top shelf" />
              </Inspector>
            </div>

            <div className="w-[300px] overflow-hidden rounded-[22px] border border-hair">
              <SheetPhone>
                <div className="mt-4 flex items-center gap-3.5">
                  <Cutout width={74} silhouette="ticket" cut="edge" rotate={-3} aspect={2} />
                  <div className="min-w-0">
                    <div className="text-[17px] leading-[1.2] font-semibold tracking-[-0.025em]">
                      Boarding pass, LIS → JFK
                    </div>
                    <Meta className="mt-1.5">DAD · 12 NOV 2019</Meta>
                  </div>
                </div>
                <p className="mt-3.5 text-[13.5px] leading-[1.55] text-pretty text-mute-1">
                  He wrote the gate number on the back in case I forgot where to meet him.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <Chip size="md">Lisbon</Chip>
                  <Chip size="md">Dad</Chip>
                  <Chip size="md">Paper</Chip>
                </div>
                <div className="mt-5 mb-6 flex gap-2">
                  <button className="h-11 flex-1 rounded-[11px] border border-hair-strong text-[13px] font-medium">
                    Peel &amp; move
                  </button>
                  <button className="h-11 flex-1 rounded-[11px] bg-ink text-[13px] font-medium text-bg">
                    Open
                  </button>
                </div>
              </SheetPhone>
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </Surface>
  )
}

export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string; section?: string }>
}) {
  // ?surface=cabinet renders one palette on its own, which is how you actually
  // diff a surface against the doc without a 9000px scroll.
  const { surface, section } = await searchParams
  const only = SURFACES.find((name) => name === surface)
  const shown = only ? [only] : SURFACES
  const oneSection = SECTIONS.find((name) => name === section)

  return (
    <main data-surface="ledger" className="min-h-dvh bg-bg text-ink">
      <TiltLayer />

      <header className={only ? 'px-8 pt-6 pb-4' : 'px-8 pt-14 pb-8'}>
        <div className="mn text-[10.5px] font-semibold tracking-[0.22em] uppercase">
          Capsule · design system
        </div>
        {only ? (
          <div className="mn mt-2 flex gap-3 text-[9px] tracking-[0.12em] uppercase text-mute-2">
            {SURFACES.map((name) => (
              <a key={name} href={`/design?surface=${name}`} className="underline-offset-4 hover:underline">
                {name}
              </a>
            ))}
            <a href="/design" className="underline-offset-4 hover:underline">
              all surfaces
            </a>
            <span className="text-mute-3">·</span>
            {SECTIONS.map((name) => (
              <a
                key={name}
                href={`/design?surface=${only}&section=${name}`}
                className={
                  oneSection === name
                    ? 'text-ink underline underline-offset-4'
                    : 'underline-offset-4 hover:underline'
                }
              >
                {name}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-pretty text-mute-1">
            Every primitive, every surface, every state. Diff this against{' '}
            <span className="mn">Capsule.dc.html</span> — it is the gate for phase 3. Prose is warm,
            data is archival; hairlines instead of boxes; every object is a die-cut cutout with a
            white sticker edge and a real shadow. Hover a cutout to check the tilt.
          </p>
        )}
      </header>

      {shown.map((name) => (
        <Section
          key={name}
          id={name}
          title={name}
          note={
            name === 'ledger'
              ? 'Time is the spine. Stickers sit still and behave.'
              : name === 'board'
                ? 'Space is the spine. You arrange them by hand.'
                : 'The object is the spine. One at a time, lit.'
          }
        >
          <Gallery surface={name} section={oneSection} />
        </Section>
      ))}

      <footer className="mn px-8 py-10 text-[8.5px] tracking-[0.14em] uppercase text-mute-3">
        Phase 3 · design system
      </footer>
    </main>
  )
}
