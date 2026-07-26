'use client'

import { useEffect } from 'react'

/**
 * The doc's exact numbers. Changing them changes the feel, so they live here
 * named rather than inline.
 */
const MAX_DEG = 13
const PERSPECTIVE = 800
const LIFT_Z = 6

/**
 * Installs one document-level pointer listener that tilts whichever
 * `[data-sticker]` the pointer is over, composing onto that element's existing
 * server-rendered `rotate(Ndeg)` base transform.
 *
 * Ported from the design doc's own script, and delegated for the same reason it
 * is there: the Ledger renders hundreds of cutouts, and one listener plus zero
 * client components beats hundreds of mounted handlers.
 *
 * Mount once per surface shell. Opt a cutout in with `interactive`.
 */
export function TiltLayer() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Coarse pointers get the device-orientation treatment instead — "tilt to
    // catch the light" on the phone means the phone, not a finger.
    if (window.matchMedia('(pointer: coarse)').matches) return

    let hot: HTMLElement | null = null
    let base = ''

    const release = () => {
      if (hot) hot.style.transform = base
      hot = null
      base = ''
    }

    const onMove = (event: PointerEvent) => {
      const target = event.target as Element | null
      const el = target?.closest?.('[data-sticker]') as HTMLElement | null

      if (hot && hot !== el) release()
      if (!el || el.dataset.state === 'dragging') return

      if (hot !== el) {
        hot = el
        // Read the base off the DOM rather than tracking it in React — the
        // server rendered it, and this keeps the two from fighting.
        base = el.style.transform
      }

      const box = el.getBoundingClientRect()
      const dx = (event.clientX - box.left) / box.width - 0.5
      const dy = (event.clientY - box.top) / box.height - 0.5

      el.style.transform =
        `${base} perspective(${PERSPECTIVE}px) ` +
        `rotateY(${dx * MAX_DEG}deg) rotateX(${-dy * MAX_DEG}deg) translateZ(${LIFT_Z}px)`
    }

    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerleave', release, true)
    window.addEventListener('blur', release)

    return () => {
      release()
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerleave', release, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  return null
}
