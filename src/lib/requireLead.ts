import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { bestNameMatch } from '@/lib/memberMatch'
import { createServiceClient } from '@/lib/supabase/service'

// 팀장(members.role 'lead')만 하는 쓰기 — 통과하면 null, 아니면 돌려줄 응답(401/403).
// 로그인 계정 이름(user_metadata.name)을 members 이름과 맞춰 본다(goal-retros와 같은 방식).
export async function requireLead(): Promise<NextResponse | null> {
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const authName = (user.user_metadata?.name as string | undefined) ?? user.email ?? ''
  const { data } = await createServiceClient().from('members').select('id, name, role')
  const me = data ? bestNameMatch(authName, data) : null
  if (me?.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 옮길 수 있습니다' }, { status: 403 })
  return null
}
