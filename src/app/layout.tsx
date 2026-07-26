import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'

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
        </ClerkProvider>
      </body>
    </html>
  )
}
