import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

export default function SsoCallbackPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg text-ink">
      <div className="mn text-[9px] tracking-[0.14em] text-mute-2">SIGNING YOU IN…</div>
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </main>
  )
}
