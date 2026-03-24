import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentProfileClient from './StudentProfileClient'

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <StudentProfileClient studentId={id} />
}
