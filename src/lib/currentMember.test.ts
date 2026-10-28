import { beforeEach, describe, expect, it, vi } from 'vitest'

// 서버 신원 판별 회귀 테스트 — 권한은 로그인 계정 id(JWT sub) ↔ members.auth_user_id 연결로만 정한다.
// 사용자가 바꿀 수 있는 계정 이름(user_metadata.name)·이메일로는 누구의 권한도 얻을 수 없어야 한다.

type Row = { id: string; name: string; role: string; auth_user_id: string | null; left_at: string | null; can_manage_members: boolean }
let claims: Record<string, unknown> | null = null
let rows: Row[] = []
let dbError = false

vi.mock('@/lib/auth', () => ({ requireUser: async () => claims }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const filters: [keyof Row, unknown][] = []
      const q = {
        select: () => q,
        eq: (col: keyof Row, v: unknown) => { filters.push([col, v]); return q },
        is: (col: keyof Row, v: unknown) => { filters.push([col, v]); return q },
        maybeSingle: async () => {
          if (dbError) return { data: null, error: { message: 'column members.auth_user_id does not exist' } }
          const hit = rows.filter(r => filters.every(([c, v]) => r[c] === v))
          return { data: hit[0] ?? null, error: null }
        },
      }
      return q
    },
  }),
}))

const { getCurrentMember, sessionName } = await import('./currentMember')
const { requireLead } = await import('./requireLead')

const LEAD: Row = { id: 'm-lead', name: '가팀장', role: 'lead', auth_user_id: 'u-lead', left_at: null, can_manage_members: true }
const PART: Row = { id: 'm-part', name: '나파트', role: 'part_lead', auth_user_id: 'u-part', left_at: null, can_manage_members: true }
const MEMBER: Row = { id: 'm-mem', name: '다팀원', role: 'member', auth_user_id: 'u-mem', left_at: null, can_manage_members: false }

beforeEach(() => {
  claims = null
  rows = [LEAD, PART, MEMBER]
  dbError = false
})

describe('getCurrentMember', () => {
  it('로그인 안 했으면 null', async () => {
    expect(await getCurrentMember()).toBeNull()
  })
  it('JWT sub로 연결된 팀원을 찾는다', async () => {
    claims = { sub: 'u-mem', user_metadata: { name: '다팀원' } }
    expect((await getCurrentMember())?.member).toEqual({ id: 'm-mem', name: '다팀원', role: 'member', canManageMembers: false })
  })
  it('계정 이름을 팀장 이름으로 바꿔도 본인 그대로', async () => {
    claims = { sub: 'u-mem', user_metadata: { name: '가팀장' } }
    expect((await getCurrentMember())?.member?.id).toBe('m-mem')
  })
  it('연결 안 된 계정은 팀장 이름·관리자 이메일이어도 null', async () => {
    claims = { sub: 'u-other', email: 'ji.kim@egnis.kr', user_metadata: { name: '가팀장' } }
    expect((await getCurrentMember())?.member).toBeNull()
  })
  it('sub가 없으면 null', async () => {
    claims = { user_metadata: { name: '가팀장' } }
    expect((await getCurrentMember())?.member).toBeNull()
  })
  it('퇴사자는 null', async () => {
    rows = [LEAD, { ...MEMBER, left_at: '2026-10-28' }]
    claims = { sub: 'u-mem' }
    expect((await getCurrentMember())?.member).toBeNull()
  })
  it('DB 적용 전(컬럼 없음)·조회 실패면 이름이 맞아도 null — 이름으로 대신 찾지 않는다', async () => {
    dbError = true
    claims = { sub: 'u-lead', user_metadata: { name: '가팀장' } }
    expect((await getCurrentMember())?.member).toBeNull()
  })
  it('관리 권한은 DB 플래그 그대로', async () => {
    claims = { sub: 'u-part' }
    expect((await getCurrentMember())?.member?.canManageMembers).toBe(true)
  })
  it('저장 기록 이름: 연결된 팀원 이름, 없으면 이메일(계정 이름은 쓰지 않음)', async () => {
    claims = { sub: 'u-mem', user_metadata: { name: '가팀장' } }
    expect(sessionName((await getCurrentMember())!)).toBe('다팀원')
    claims = { sub: 'u-x', email: 'x@egnis.kr', user_metadata: { name: '가팀장' } }
    expect(sessionName((await getCurrentMember())!)).toBe('x@egnis.kr')
  })
})

describe('requireLead', () => {
  it('미로그인 401', async () => {
    expect((await requireLead())?.status).toBe(401)
  })
  it('팀장 통과', async () => {
    claims = { sub: 'u-lead' }
    expect(await requireLead()).toBeNull()
  })
  it('파트장은 팀장 권한 아님(기존과 같음) 403', async () => {
    claims = { sub: 'u-part' }
    expect((await requireLead())?.status).toBe(403)
  })
  it('팀원이 계정 이름을 팀장 이름으로 바꿔도 403', async () => {
    claims = { sub: 'u-mem', user_metadata: { name: '가팀장' } }
    expect((await requireLead())?.status).toBe(403)
  })
  it('연결 안 된 계정이 팀장 이름·이메일을 써도 403', async () => {
    claims = { sub: 'u-x', email: 'ji.kim@egnis.kr', user_metadata: { name: '가팀장' } }
    expect((await requireLead())?.status).toBe(403)
  })
  it('DB 적용 전이면 팀장도 403(거부 쪽으로 실패)', async () => {
    dbError = true
    claims = { sub: 'u-lead' }
    expect((await requireLead())?.status).toBe(403)
  })
})
