import { SITE } from '@/lib/site'

export default function Home() {
  return (
    <main className="min-h-dvh bg-[#fbf9f5] px-8 py-16 text-[#2a251d]">
      <div className="mx-auto max-w-lg">
        <div className="mn text-[10.5px] font-semibold tracking-[0.22em]">
          {SITE.name.toUpperCase()}
        </div>
        <div className="mn mt-1.5 text-[8.5px] tracking-[0.1em] text-[#2a251d]/40">
          0 OBJECTS · 0 PEOPLE
        </div>

        <hr className="my-8 border-0 border-t border-[#2a251d]/10" />

        <p className="max-w-prose text-pretty text-[13px] leading-relaxed text-[#2a251d]/70">
          {SITE.description} Who it was from, when, where it came from, the occasion, and the
          story. Nothing is here yet.
        </p>

        <div className="mn mt-8 text-[8.5px] tracking-[0.14em] text-[#2a251d]/35">
          PHASE 0 · SHELL ONLY
        </div>
      </div>
    </main>
  )
}
