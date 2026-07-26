import { clerkMiddleware } from '@clerk/nextjs/server'

// Next 16 renamed middleware.ts -> proxy.ts.
// No route gating here on purpose: Clerk's current guidance is to protect the
// resource with `auth.protect()` in the page / Server Action / Route Handler.
export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next internals and static assets, but keep the webmanifest excluded
    // too so the PWA manifest is never routed through auth.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
