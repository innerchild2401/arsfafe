import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// Force dynamic rendering to ensure environment variables are available
export const dynamic = 'force-dynamic'

export default async function Home() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      redirect('/dashboard')
    }
  } catch (error: any) {
    // NEXT_REDIRECT is expected - Next.js uses it internally for redirects
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error // Re-throw redirect errors so Next.js can handle them
    }
    console.error('Error initializing Supabase:', error)
    // Continue to show login/signup if there's an error
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          Welcome to Arsfafe
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Your intelligent knowledge center for PDF and EPUB books
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-md bg-indigo-600 px-6 py-3 text-white hover:bg-indigo-700"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-gray-600 px-6 py-3 text-white hover:bg-gray-700"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  )
}
