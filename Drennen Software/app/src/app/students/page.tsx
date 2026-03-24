import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentsPageClient from './StudentsPageClient'

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <StudentsPageClient />
}
