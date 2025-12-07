import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error_param = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/albums'

  console.log('[Auth Callback] URL:', request.url)
  console.log('[Auth Callback] Code:', code ? 'present' : 'missing')
  console.log('[Auth Callback] Error param:', error_param)
  console.log('[Auth Callback] Error description:', error_description)

  if (error_param) {
    console.error('[Auth Callback] OAuth error:', error_param, error_description)
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error_description || error_param)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    console.log('[Auth Callback] Exchange result:', error ? `Error: ${error.message}` : 'Success')
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }

  // Return the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
}
