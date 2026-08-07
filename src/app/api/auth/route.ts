import { NextResponse, type NextRequest } from 'next/server'
import { TEAM_LOG_COOKIE, teamLogToken } from '@/lib/team-log-auth'

export async function POST(request: NextRequest) {
  const { passcode } = await request.json().catch(() => ({ passcode: '' }))
  const expected = process.env.TEAM_LOG_PASSCODE

  if (!expected || typeof passcode !== 'string' || passcode !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(TEAM_LOG_COOKIE, teamLogToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 60, // 60일
  })
  return res
}
