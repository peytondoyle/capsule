'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignIn, useSignUp } from '@clerk/nextjs'

import { Cutout } from '@/design'

type Step = 'identify' | 'code'
type Mode = 'sign-in' | 'sign-up'

/** Clerk returns either a single error or a wrapped list depending on the call. */
function codesOf(error: unknown): string[] {
  if (!error || typeof error !== 'object') return []
  const e = error as { code?: unknown; errors?: { code?: unknown }[] }
  return [e.code, ...(e.errors ?? []).map((x) => x.code)].filter(
    (c): c is string => typeof c === 'string',
  )
}

function messageOf(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const e = error as { message?: unknown; errors?: { message?: unknown }[] }
  const first = e.errors?.[0]?.message
  if (typeof first === 'string' && first) return first
  if (typeof e.message === 'string' && e.message) return e.message
  return fallback
}

/** Clerk wants E.164. Strip the formatting people type; a bare ten-digit
 *  number is assumed to be US rather than rejected. */
function e164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

export default function SignInPage() {
  const router = useRouter()
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()

  const [step, setStep] = useState<Step>('identify')
  const [mode, setMode] = useState<Mode>('sign-in')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const navigate = ({
    decorateUrl,
  }: {
    decorateUrl: (path: string) => string
  }) => {
    const url = decorateUrl('/')
    // decorateUrl may hand back an absolute URL to survive Safari ITP.
    if (url.startsWith('http')) window.location.href = url
    else router.push(url)
  }

  async function submitPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const number = e164(phone.trim())
    if (!number || busy) return

    setBusy(true)
    setError(null)

    // One field, either outcome: try to sign in, and fall through to sign-up
    // when Clerk says it has never seen this number.
    const signInAttempt = await signIn.phoneCode.sendCode({ phoneNumber: number })
    if (!signInAttempt.error) {
      setMode('sign-in')
      setStep('code')
      setBusy(false)
      return
    }

    if (!codesOf(signInAttempt.error).includes('form_identifier_not_found')) {
      setError(messageOf(signInAttempt.error, 'That number did not work.'))
      setBusy(false)
      return
    }

    const created = await signUp.create({ phoneNumber: number })
    if (created.error) {
      setError(messageOf(created.error, 'Could not start a new archive.'))
      setBusy(false)
      return
    }

    const sent = await signUp.verifications.sendPhoneCode()
    if (sent.error) {
      setError(messageOf(sent.error, 'Could not send a code.'))
      setBusy(false)
      return
    }

    setMode('sign-up')
    setStep('code')
    setBusy(false)
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = code.trim()
    if (!value || busy) return

    setBusy(true)
    setError(null)

    if (mode === 'sign-in') {
      const { error: verifyError } = await signIn.phoneCode.verifyCode({ code: value })
      if (verifyError) {
        setError(messageOf(verifyError, 'That code did not match.'))
        setBusy(false)
        return
      }
      if (signIn.status === 'complete') await signIn.finalize({ navigate })
    } else {
      const { error: verifyError } = await signUp.verifications.verifyPhoneCode({ code: value })
      if (verifyError) {
        setError(messageOf(verifyError, 'That code did not match.'))
        setBusy(false)
        return
      }
      if (signUp.status === 'complete') await signUp.finalize({ navigate })
    }

    setBusy(false)
  }

  async function resend() {
    if (busy) return
    setBusy(true)
    setError(null)
    const { error: resendError } =
      mode === 'sign-in'
        ? await signIn.phoneCode.sendCode()
        : await signUp.verifications.sendPhoneCode()
    if (resendError) setError(messageOf(resendError, 'Could not send another code.'))
    setBusy(false)
  }

  function startOver() {
    signIn.reset()
    signUp.reset()
    setStep('identify')
    setCode('')
    setError(null)
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-16 text-ink">
      <div className="w-full max-w-[344px]">
        <div className="flex justify-center">
          <Cutout
            width={132}
            silhouette="polaroid"
            cut="edge"
            rotate={-3}
            aspect={1.13}
            label="nothing filed yet"
          />
        </div>

        <div className="mt-9 text-center">
          <h1 className="mn text-[10.5px] font-semibold tracking-[0.22em]">CAPSULE</h1>
          <p className="mx-auto mt-3 max-w-[27ch] text-pretty text-[13px] leading-relaxed text-mute-1">
            {step === 'identify'
              ? 'An archive of the objects people gave you. No password — we text a code.'
              : mode === 'sign-up'
                ? 'Starting a new archive. Check your messages for a six-digit code.'
                : 'Welcome back. Check your messages for a six-digit code.'}
          </p>
        </div>

        <hr className="my-8 border-0 border-t border-hair-strong" />

        {step === 'identify' ? (
          <form onSubmit={submitPhone}>
            <label
              htmlFor="phone"
              className="mn block text-[9px] tracking-[0.14em] text-mute-2"
            >
              PHONE
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              autoFocus
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 123 4567"
              className="mt-2 w-full border-0 border-b border-hair-strong bg-transparent pb-2 text-[15px] outline-none placeholder:text-mute-3 focus:border-ink"
            />

            {error ? (
              <p role="alert" className="mn mt-3 text-[9.5px] leading-relaxed tracking-[0.06em] text-accent">
                {error.toUpperCase()}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mn mt-6 h-11 w-full rounded-[9px] bg-ink text-[10px] font-medium tracking-[0.14em] text-bg transition-opacity duration-300 disabled:opacity-45"
            >
              {busy ? 'SENDING…' : 'CONTINUE'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <label
              htmlFor="code"
              className="mn block text-[9px] tracking-[0.14em] text-mute-2"
            >
              SIX-DIGIT CODE
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="——————"
              className="mn mt-2 w-full border-0 border-b border-hair-strong bg-transparent pb-2 text-center text-[22px] tracking-[0.42em] outline-none placeholder:text-ink/20 focus:border-ink"
            />
            <p className="mn mt-3 text-[9px] tracking-[0.08em] text-mute-2">
              SENT TO {e164(phone.trim())}
            </p>

            {error ? (
              <p role="alert" className="mn mt-3 text-[9.5px] leading-relaxed tracking-[0.06em] text-accent">
                {error.toUpperCase()}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="mn mt-6 h-11 w-full rounded-[9px] bg-ink text-[10px] font-medium tracking-[0.14em] text-bg transition-opacity duration-300 disabled:opacity-45"
            >
              {busy ? 'CHECKING…' : mode === 'sign-up' ? 'START THE ARCHIVE' : 'OPEN THE ARCHIVE'}
            </button>

            <div className="mt-5 flex justify-between">
              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="mn text-[9px] tracking-[0.1em] text-mute-2 underline decoration-hair-strong underline-offset-4 disabled:opacity-45"
              >
                SEND ANOTHER
              </button>
              <button
                type="button"
                onClick={startOver}
                className="mn text-[9px] tracking-[0.1em] text-mute-2 underline decoration-hair-strong underline-offset-4"
              >
                DIFFERENT NUMBER
              </button>
            </div>
          </form>
        )}

        {/* Clerk's bot protection renders here; required for the sign-up path. */}
        <div id="clerk-captcha" className="mt-6 empty:mt-0" />
      </div>
    </main>
  )
}
