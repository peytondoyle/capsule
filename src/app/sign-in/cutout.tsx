/**
 * A single die-cut sticker, hand-rolled for the sign-in page.
 *
 * Two-layer shadow on `filter: drop-shadow` rather than `box-shadow` so it
 * traces the silhouette. Phase 3 replaces this with the real <Cutout> primitive
 * (silhouette presets, cut styles, tilt); until then this is the one place the
 * product's signature shows up.
 */
export function Cutout() {
  return (
    <div
      style={{
        transform: 'rotate(-3deg)',
        filter:
          'drop-shadow(0 10px 14px rgba(52,42,26,.17)) drop-shadow(0 1px 1.5px rgba(52,42,26,.14))',
      }}
    >
      {/* polaroid preset: extra bottom chin */}
      <div className="box-border w-[132px] bg-white p-[7px] pb-[26px]">
        <div
          className="flex h-[104px] items-end p-2"
          style={{
            background: 'repeating-linear-gradient(128deg,#dfd8c9 0 5px,#eae4d8 5px 10px)',
          }}
        >
          <span className="mn text-[7px] uppercase tracking-[0.1em] text-[#948a79]">
            nothing filed yet
          </span>
        </div>
      </div>
    </div>
  )
}
