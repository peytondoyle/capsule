'use client'

/**
 * The boundary of last resort — it replaces the root layout, so it must carry
 * its own <html>/<body> and cannot rely on globals.css having loaded. Inline
 * styles only, Ledger palette hardcoded.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fbf9f5',
          color: '#2a251d',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        }}
      >
        <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.22em' }}>CAPSULE</p>
        <p style={{ fontSize: 8.5, letterSpacing: '0.14em', opacity: 0.5 }}>SOMETHING WENT WRONG</p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 24,
            padding: '8px 16px',
            fontSize: 9,
            letterSpacing: '0.1em',
            background: '#2a251d',
            color: '#fbf9f5',
            border: 0,
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          TRY AGAIN
        </button>
      </body>
    </html>
  )
}
