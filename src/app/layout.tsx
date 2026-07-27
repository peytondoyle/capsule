import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'

import { Pwa } from '@/components/pwa'
import { SITE } from '@/lib/site'
import './globals.css'

/**
 * SF Pro and SF Mono are not webfont-licensable, and they are what the design
 * is drawn in. The token stack puts the system SF families first, so on Apple
 * hardware these two are never fetched at all; elsewhere they carry the same
 * prose/metadata split. Self-hosted by next/font, so metadata never reflows.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#151418' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`} data-surface="ledger">
      <body>
        {/* Ledger paper palette. Element-level overrides (hairlines instead of
            Clerk's default card borders) land with the design system in phase 3. */}
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: '#2a251d',
              colorPrimaryForeground: '#fbf9f5',
              colorBackground: '#fbf9f5',
              colorForeground: '#2a251d',
              colorMutedForeground: 'rgba(42,37,29,0.55)',
              colorInput: '#ffffff',
              colorInputForeground: '#2a251d',
              colorBorder: 'rgba(42,37,29,0.14)',
              colorDanger: '#a8552b',
              colorSuccess: '#5b8c5a',
              fontFamily: 'var(--font-sans)',
              fontFamilyMono: 'var(--font-mono)',
              borderRadius: '7px',
            },
          }}
        >
          {children}
          <Pwa />
        </ClerkProvider>
      </body>
    </html>
  )
}
