import type { ReactNode } from 'react'

export type ChipVariant = 'quiet' | 'solid' | 'add'

/**
 * Tag pills. `add` is the dashed "+ TAG" affordance from the inspector, and the
 * same dashed language marks anything not real yet — pending uploads, unconfirmed
 * suggestions — so "provisional" reads identically across the app.
 */
export function Chip({
  children,
  variant = 'quiet',
  size = 'sm',
  as: Tag = 'span',
  className,
  ...rest
}: {
  children: ReactNode
  variant?: ChipVariant
  size?: 'sm' | 'md'
  as?: 'span' | 'button'
  className?: string
} & React.HTMLAttributes<HTMLElement>) {
  const sizing = size === 'sm' ? 'text-[9px] px-[9px] py-[4px]' : 'text-[10px] px-3 py-2'

  const look =
    variant === 'solid'
      ? 'bg-ink text-bg font-medium'
      : variant === 'add'
        ? 'border border-dashed border-hair-strong text-mute-3'
        : 'bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] text-mute-1'

  return (
    <Tag
      className={['mn rounded-full tracking-[0.06em] uppercase', sizing, look, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}
