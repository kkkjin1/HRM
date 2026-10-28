import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 팀원 관리 API 권한 — 관리자는 로그인 계정 id로 연결된 행의 can_manage_members로만 정한다(이메일·계정 이름 무관).

type SessionMember = { id: string; name: string; role: string; canManageMembers: boolean }
let session: { claims: Record<string, unknown>; member: SessionMember | null } | null = null
const updates: Record<string, unknown>[] = []
const inserts: Record<string, unknown>[] = []

vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null } } }),
      insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null } },
      select: async () => ({ data: [], error: null }),
    }),
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  }),
}))

const { GET, POST, PATCH } = await import('./route')
const patch = (body: unknown) => PATCH(new NextRequest('http://x/api/members-admin', { method: 'PATCH', body: JSON.stringify(body) }))
const post = (body: unknown) => POST(new NextRequest('http://x/api/members-admin', { method: 'POST', body: JSON.stringify(body) }))
const ADMIN: SessionMember = { id: 'm-admin', name: '가팀장', role: 'lead', canManageMembers: true }
const PLAIN: SessionMember = { id: 'm-mem', name: '다팀원', role: 'member', canManageMembers: false }

beforeEach(() => { session = null; updates.length = 0; inserts.length = 0 })

describe('members-admin 권한', () => {
  it('미로그인 401', async () => {
    expect((await GET()).status).toBe(401)
  })
  it('연결 안 된 계정은 관리자 이메일·팀장 이름이어도 403', async () => {
    session = { claims: { email: 'ji.kim@egnis.kr', user_metadata: { name: '가팀장' } }, member: null }
    expect((await GET()).status).toBe(403)
    expect((await patch({ id: 'm-mem', role: 'lead' })).status).toBe(403)
  })
  it('관리 권한 없는 팀원은 관리자 이메일이어도 역할 변경·추가 403', async () => {
    session = { claims: { email: 'ji.kim@egnis.kr' }, member: PLAIN }
    expect((await patch({ id: 'm-mem', role: 'lead' })).status).toBe(403)
    expect((await post({ name: 'x', role: 'lead' })).status).toBe(403)
    expect(updates).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })
  it('관리자는 역할 변경 가능', async () => {
    session = { claims: {}, member: ADMIN }
    expect((await patch({ id: 'm-mem', role: 'part_lead' })).status).toBe(200)
    expect(updates).toEqual([{ role: 'part_lead' }])
  })
  it('관리 권한 플래그는 API로 바꿀 수 없다', async () => {
    session = { claims: {}, member: ADMIN }
    expect((await patch({ id: 'm-mem', can_manage_members: true })).status).toBe(400)
    expect((await patch({ id: 'm-mem', field: 'can_manage_members', value: 'true' })).status).toBe(400)
    expect(updates).toHaveLength(0)
  })
  it('관리자 본인의 계정 연결 해제·퇴사 처리는 거부(자기 잠금 방지)', async () => {
    session = { claims: {}, member: ADMIN }
    expect((await patch({ id: 'm-admin', auth_user_id: null })).status).toBe(400)
    expect((await patch({ id: 'm-admin', leave: true })).status).toBe(400)
    expect(updates).toHaveLength(0)
  })
  it('다른 사람 퇴사 처리는 삭제가 아니라 left_at 기록', async () => {
    session = { claims: {}, member: ADMIN }
    expect((await patch({ id: 'm-mem', leave: true, left_at: '2026-10-28' })).status).toBe(200)
    expect(updates).toEqual([{ left_at: '2026-10-28' }])
  })
})
