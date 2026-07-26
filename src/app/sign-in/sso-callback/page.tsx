import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

export default function SsoCallbackPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fbf9f5] text-[#2a251d]">
      <div className="mn text-[9px] tracking-[0.14em] text-[#2a251d]/40">SIGNING YOU IN…</div>
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </main>
  )
}
