import crypto from 'crypto'
import { cookies } from 'next/headers'

export const TEAM_LOG_COOKIE = 'team_log_auth'

// TEAM_LOG_PASSCODE가 바뀌면 이 토큰도 바뀌어서 기존 쿠키가 자동으로 무효화된다.
export function teamLogToken() {
  const secret = process.env.TEAM_LOG_PASSCODE ?? ''
  return crypto.createHash('sha256').update(`team-log:${secret}`).digest('hex')
}

export function isValidTeamLogToken(token: string | undefined) {
  if (!token || !process.env.TEAM_LOG_PASSCODE) return false
  const expected = teamLogToken()
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function isTeamLogRequestAuthorized() {
  const cookieStore = await cookies()
  return isValidTeamLogToken(cookieStore.get(TEAM_LOG_COOKIE)?.value)
}
