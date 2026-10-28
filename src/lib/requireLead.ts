import { NextResponse } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'

// 팀장(members.role 'lead')만 하는 쓰기 — 통과하면 null, 아니면 돌려줄 응답(401/403).
// 로그인 계정 id(auth_user_id)로 찾은 members 행의 role로 판단한다(사용자가 바꿀 수 있는 이름으로는 판단하지 않는다).
export async function requireLead(): Promise<NextResponse | null> {
  const session = await getCurrentMember()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (session.member?.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 옮길 수 있습니다' }, { status: 403 })
  return null
}
