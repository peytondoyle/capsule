import { redirect } from 'next/navigation'

// The custom flow is unified: one email field decides sign-in vs sign-up.
export default function SignUpPage() {
  redirect('/sign-in')
}
