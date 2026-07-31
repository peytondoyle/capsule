import Link from 'next/link'

/**
 * The '‹' back chevron, which six pages render.
 *
 * It was six copies of the same glyph, and they had drifted: four had no
 * accessible name at all, the two that did disagreed ("Back" vs "Back to
 * timeline"), and the 24px hit area had to be pasted into each of them
 * separately. A glyph this small is exactly the control that needs a hit area
 * and a name, so it owns both here.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-ml-1.5 flex size-6 items-center justify-center text-[15px] text-mute-2"
    >
      ‹
    </Link>
  )
}
