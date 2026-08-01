# Task: the Board hover card

> ## ✅ DONE — shipped 2026-08-01 as `aefc8ad`. Do not implement this again.
> Kept for the traps in "The four traps" below, which are still the best reference for
> anyone changing `src/app/board/canvas.tsx` — the transformed world layer and the pointer
> hit-test break naive changes in ways the code does not advertise.
>
> One correction to what follows: this brief claimed the source contained `scale(1.06)` for
> the `dragging` state. **It did not.** The code had `scale(1.02)` for `active` only; the
> 1.06 drag lift was added as part of this task.

Self-contained brief for an agent with no memory of prior sessions. Read
[CLAUDE.md](../CLAUDE.md) first — the non-negotiable design rules and platform traps there
apply to every line of this task. This is the **last deferred item from phase 8**; finishing
it closes the Board.

## State (verified 2026-08-01)

| | |
|---|---|
| Branch | `master`, clean, pushed — `12a5749` |
| Production | live, on Neon project `old-math-03360848` (personal org) |
| Audit | 38 of 38 closed |
| This task | not started; no branch, no partial work |
| Scope | **presentation only** — no schema change, no query change, no Server Action |

Everything the card renders is already in the client. `getBoard()` was extended on
2026-08-01 to carry `placeName`, `receivedAt`, `receivedPrecision`, `story` and `tags`, and
`Item` in `src/app/board/canvas.tsx` already declares all of them. **Do not add a query.**

## What to build

From the design source, [docs/CAPSULE-V2-PLAN.md:369-372](CAPSULE-V2-PLAN.md):

> Draggable cutouts. The dragged one goes `scale(1.06)`, heavy shadow, and grows a
> **hover card** to its right: title, mono meta, hairline, `DROP HERE TO FILE UNDER`, and
> the target cluster's implied tags — one filled, one ghosted. Corner label
> `DRAGGING · 1 OBJECT`.

Two pieces:

1. **The card** — appears beside the cutout currently being dragged, on desktop only.
   Contents, in order:
   - Title (sans, tight tracking — it is prose)
   - Meta line: giver · date · place (mono, uppercase — it is data). Use `receivedLabel()`
     from `src/lib/format.ts` for the date; never format a date inline.
   - `<Hairline />`
   - `DROP HERE TO FILE UNDER` (mono, `--mute-3`)
   - The hovered cluster's `impliedTags`: **first tag filled (`<Chip variant="solid">`),
     the rest ghosted (`<Chip variant="add">`)**. When the pointer is not over a cluster,
     show the tags area empty or omit it — do not invent placeholder tags.
2. **The corner label** — `DRAGGING · 1 OBJECT`, fixed in a screen corner while a drag is
   in progress. Mono, uppercase, same floating-chrome treatment as the zoom chip
   (`canvas.tsx` line 586, bottom-right): `color-mix(in srgb, var(--panel) 94%, transparent)`
   plus a `--shadow-ink` shadow.

## Where the state already is

All in [`src/app/board/canvas.tsx`](../src/app/board/canvas.tsx). Nothing new is needed:

| What you need | Where it is |
|---|---|
| Which object is being dragged | `dragId` — line 131 |
| Which cluster the pointer is over | `hoverCluster` — line 132 (already updated on every move, line 294) |
| Is this a touch device | `coarse` — line 138 |
| That cluster's implied tags | `clusters.find(c => c.id === hoverCluster)?.impliedTags` |
| The dragged object's fields | `visibleItems.find(i => i.id === dragId)` |
| Its board position | `positions[dragId]` |
| Live pointer position | **not currently in state — see below** |

`hoverCluster` is set inside `onPointerMove` (line 294) and cleared in `cancelDrag`
(line 222) and `onPointerUp` (line 325). You get cluster tracking for free.

## The four traps

These are the ways this task goes wrong. They are specific to this codebase.

**1. The world layer is scaled.** The cutouts live inside a div with
`transform: translate(x,y) scale(s)` and `transformOrigin: '0 0'` (line 374). Default zoom
is **0.62**. A card rendered inside that layer inherits the scale, so its 13px text renders
at ~8px and its hairlines go sub-pixel. Two acceptable fixes:

- Render the card **outside** the transformed layer, positioned in screen coordinates
  (`viewport.x + pos.x * viewport.scale`), or
- Render it inside and counter-scale with `scale(${1 / viewport.scale})` plus a matching
  `transformOrigin`.

The first is simpler and is what the zoom chip and toolbar already do. Whichever you pick,
**verify at a non-default zoom** — scroll to zoom before judging it.

**2. It must not intercept the pointer.** `onPointerDown` decides drag-vs-pan with
`event.target.closest('[data-board-id]')` (line 247), and there is a comment at line 268
recording that pointer capture on chrome made every toolbar button inert. Give
the card `pointer-events: none`. It is passive during a drag; nothing in it is clickable.

**3. Do not nest it inside the cutout wrapper.** That wrapper takes a `transform` for the
peel (`translateY(-14px) rotate(2.5deg)`, line 428) and the `Cutout` itself carries a
persisted rotation. A child inherits both and the card ends up tilted. Make it a sibling.

**4. `scale(1.06)` on the dragged cutout is already handled — do not re-add it in CSS.**
`tokens.css` had exactly this bug: an inline `transform` on `Cutout` always beats a
stylesheet rule, so a `.cutout-shadow[data-state='active'] { transform: scale(...) }` never
applied on any surface. It is composed into the inline transform in `cutout.tsx` instead.
If the drag lift needs adjusting, do it there.

## Design rules that apply here

From CLAUDE.md — violating these makes it look wrong in a way polish will not recover:

- **Prose is warm, data is archival.** Title and story are sans with tight tracking.
  Every date, count, label and tag is mono, uppercase, letter-spaced, via `.mn` or the
  `<Meta>` / `<MonoLabel>` primitives in `src/design/text.tsx`.
- **Hairline rules, never boxes.** 1px at 8–14% ink. The card gets a hairline border and a
  `--panel` background — not a bordered card with a heavy outline.
- **Shadows use `filter: drop-shadow`, never `box-shadow`.**
- **Never invent colours.** Use `--ink`, `--mute-1/2/3`, `--hair`, `--hair-strong`,
  `--accent`, `--panel`. The muted scale was rebalanced for WCAG contrast on 2026-08-01 —
  **do not lighten `--mute-2` or `--mute-3`**; all three steps currently clear 4.5:1 and
  the contrast maths is commented in `src/design/tokens.css`.
- **No `Math.random()` in a component.** Rotation is persisted, never random at render.

Reuse the existing primitives rather than writing new markup: `Meta`, `MonoLabel`,
`Hairline` from `src/design/text.tsx`, and `Chip` from `src/design/chip.tsx`
(`variant: 'quiet' | 'solid' | 'add'`, `size: 'sm' | 'md'`).

## Desktop only

The phone Board already has its own answer: tapping a cutout opens `BoardSheet`
(`src/app/board/sheet.tsx`). A drag-following card on a touch screen would sit under the
thumb. Gate it the way the filter rail is gated — `max-sm:hidden`, or skip rendering when
`coarse` is true (that flag already exists at `canvas.tsx` line ~137, from
`matchMedia('(pointer: coarse)')`, the same test `TiltLayer` uses).

## How to verify — read this, it is the part that usually goes wrong

**`/board` is auth-gated and sign-in is phone-only (SMS to the owner's phone). You will not
be able to sign in.** Do not claim the feature works because the code looks right.

The sanctioned path is the design gallery, which is public:

1. Add a section to `src/app/design/page.tsx`. Push a name into the `SECTIONS` array
   (line 79) and add one `{show('your-name') ? ( … ) : null}` block inside `Gallery`. The
   nav links and the `?section=` filter both follow automatically.
2. Render the card in **all three surface palettes** — the gallery renders `Gallery` once
   per surface — and in both states: pointer over a cluster (tags shown, one filled one
   ghosted) and not over one.
3. The gallery is a server component. An interactive demo needs a `'use client'` child —
   see `src/app/design/filter-rail-demo.tsx` for the pattern.
4. Check it at `http://localhost:3000/design?surface=board&section=<your-name>`.

Then run all three gates and **show the output**:

```bash
npm run build && npm run typecheck && npm run lint
```

`npm run dev` serves on :3000. Note `.claude/launch.json` runs `dev:verify`, which repoints
the dev server at the Neon `verify` branch and needs `DATABASE_URL_VERIFY`; it also has
`autoPort`, so read the port from the output rather than assuming 3000.

Two habits this repo records because they cost real time:

- **A grep is not a fix.** A status re-check twice reported a defect gone on the strength of
  a string match and was wrong both times.
- **Green gates have twice certified a dead feature** — once when photo capture was entirely
  broken in production, once when a sort control did not sort. Assert on what the page
  renders, not on what the build says.

## Done means

- [ ] Card appears beside the dragged cutout and follows it, on desktop
- [ ] Title in sans; giver/date/place in mono uppercase via `receivedLabel()`
- [ ] Hairline, then `DROP HERE TO FILE UNDER`
- [ ] Over a cluster: first implied tag filled, remainder ghosted
- [ ] `DRAGGING · 1 OBJECT` corner label while dragging
- [ ] Legible at 0.62 zoom **and** after zooming in/out
- [ ] Does not intercept pointer events; drag, pan, and every toolbar button still work
- [ ] Hidden on coarse pointers
- [ ] A `/design` section renders it in all three palettes, both tag states
- [ ] `npm run build && npm run typecheck && npm run lint` all pass, output shown
- [ ] `npm run db:verify:desktop -- --owner user_seed_dev` still passes (39 checks; it needs
      the explicit owner because the verify branch now holds two users)

## Out of scope

Do not touch: `src/server/**`, the drag/persist logic, `tokens.css` colour values, the phone
sheet, or the filter rail. If the card seems to need a new field, re-read `Item` in
`canvas.tsx` — it is probably already there.
