import type { Metadata, Viewport } from 'next'
import { SITE } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#151418' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
