import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 회고 저장 권한 — 팀 회고 칸은 팀장만, 개인 회고는 본인만(팀장도 남의 회고는 못 고침)

let session: { claims: Record<string, unknown>; member: { id: string; role: string } | null } | null
let saved: Record<string, unknown>[]

vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({ upsert: async (row: Record<string, unknown>) => { saved.push(row); return { error: null } } }) }),
}))

const { POST } = await import('./route')
const post = (owner_key: string) => POST(new NextRequest('http://x/api/goal-retros', { method: 'POST', body: JSON.stringify({ year: 2026, month: 11, owner_key, content: '글' }) }))
const as = (id: string, role = 'member') => { session = { claims: {}, member: { id, role } } }

beforeEach(() => { session = null; saved = [] })

describe('POST /api/goal-retros', () => {
  it('미로그인 401', async () => {
    expect((await post('kim')).status).toBe(401)
  })
  it('개인 회고는 본인만', async () => {
    as('kim')
    expect((await post('kim')).status).toBe(200)
    expect((await post('lee')).status).toBe(403)
    as('lead', 'lead')
    expect((await post('kim')).status).toBe(403)
    expect(saved.map(r => r.owner_key)).toEqual(['kim'])
  })
  it('팀 회고 칸은 팀장만', async () => {
    as('kim')
    expect((await post('team')).status).toBe(403)
    as('lead', 'lead')
    expect((await post('team_agenda')).status).toBe(200)
  })
})
