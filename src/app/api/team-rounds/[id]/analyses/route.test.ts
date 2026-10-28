import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 외부 분석 API 권한·공개 범위 — 팀장만 쓰기, 팀원은 확정된 적 있는 버전만, 마감 전 회차엔 반영 불가.

type Row = { id: string; round_id: string; version: number; status: string; published_at: string | null; published_by?: string | null; withdrawn_by?: string | null; content: string; source?: string }
let session: { claims: Record<string, unknown>; member: { id: string; role: string } | null } | null
let rows: Row[]
let closed = true
const calls: string[] = []

vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const f: ((r: Row) => boolean)[] = []
      const q = {
        select: () => q,
        eq: (c: keyof Row, v: unknown) => { f.push(r => r[c] === v); return q },
        order: () => q,
        maybeSingle: async () => ({ data: rows.find(r => f.every(fn => fn(r))) ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows.filter(r => f.every(fn => fn(r))), error: null }).then(res),
      }
      return q
    },
    rpc: async (fn: string, a: Record<string, unknown>) => {
      calls.push(fn)
      if (fn === 'team_analysis_add') {
        if (!closed) return { data: null, error: { message: 'round_not_closed' } }
        const id = `x${rows.length + 1}`
        rows.push({ id, round_id: a.p_round as string, version: rows.length + 1, status: 'draft', published_at: null, content: a.p_content as string, source: a.p_source as string })
        return { data: id, error: null }
      }
      if (fn === 'team_analysis_publish') {
        const r = rows.find(x => x.id === a.p_id)!
        if (r.status !== 'draft') return { data: 'not_draft', error: null }
        rows.forEach(x => { if (x.status === 'published') x.status = 'superseded' })
        Object.assign(r, { status: 'published', published_at: 'now', published_by: a.p_actor })
        return { data: 'published', error: null }
      }
      if (fn === 'team_analysis_withdraw') {
        const r = rows.find(x => x.id === a.p_id)!
        Object.assign(r, { status: 'withdrawn', withdrawn_by: a.p_actor })
        return { data: 'withdrawn', error: null }
      }
      return { data: null, error: { message: 'unknown' } }
    },
  }),
}))

const { GET, POST, PATCH } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'r1' }) }
const req = (method: string, body?: unknown) => new NextRequest('http://x', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const as = (role: 'lead' | 'member' | null) => { session = role ? { claims: {}, member: { id: role, role } } : { claims: {}, member: null } }
const json = async (p: Promise<Response>) => { const r = await p; return { status: r.status, body: await r.json() } }

beforeEach(() => { session = null; rows = []; closed = true; calls.length = 0 })

describe('외부 분석 API', () => {
  it('미로그인 401 · 연결 안 된 계정 403', async () => {
    expect((await json(GET(req('GET'), ctx))).status).toBe(401)
    as(null); expect((await json(GET(req('GET'), ctx))).status).toBe(403)
  })
  it('팀원은 반영(쓰기)·확정·취소 403', async () => {
    as('member')
    expect((await json(POST(req('POST', { source: 'x', content: 'y' }), ctx))).status).toBe(403)
    expect((await json(PATCH(req('PATCH', { id: 'x1', action: 'publish' }), ctx))).status).toBe(403)
    expect(calls).toEqual([])
  })
  it('출처·내용이 없으면 400', async () => {
    as('lead')
    expect((await json(POST(req('POST', { source: '', content: 'y' }), ctx))).status).toBe(400)
    expect((await json(POST(req('POST', { source: 'x', content: '  ' }), ctx))).status).toBe(400)
  })
  it('마감 전 회차에는 반영 불가 409', async () => {
    as('lead'); closed = false
    expect((await json(POST(req('POST', { source: 'ChatGPT', content: '분석' }), ctx))).status).toBe(409)
  })
  it('초안은 팀장만 보이고, 확정한 버전부터 팀원에게 보인다(이전 확정본도 기록으로)', async () => {
    as('lead')
    await json(POST(req('POST', { source: 'ChatGPT', content: 'v1' }), ctx))
    as('member'); expect((await json(GET(req('GET'), ctx))).body.analyses).toHaveLength(0)
    as('lead'); expect((await json(GET(req('GET'), ctx))).body.analyses).toHaveLength(1)
    await json(PATCH(req('PATCH', { id: 'x1', action: 'publish' }), ctx))
    await json(POST(req('POST', { source: 'Claude', content: 'v2', publish: true }), ctx))
    as('member')
    const seen = (await json(GET(req('GET'), ctx))).body.analyses as Row[]
    expect(seen.map(r => `${r.id}:${r.status}`).sort()).toEqual(['x1:superseded', 'x2:published'])
  })
  it('게시 승인·취소한 사람을 함께 넘겨 기록한다', async () => {
    as('lead')
    await json(POST(req('POST', { source: 'ChatGPT', content: 'v1', publish: true }), ctx))
    expect(rows[0].published_by).toBe('lead')
    await json(PATCH(req('PATCH', { id: 'x1', action: 'withdraw' }), ctx))
    expect(rows[0].withdrawn_by).toBe('lead')
  })
  it('본문의 보이지 않는 제어·방향 문자는 걷어 내고, HTML은 글자 그대로 저장한다', async () => {
    as('lead')
    await json(POST(req('POST', { source: 'Chat\u202EGPT\n', content: '<b>x</b>\u0000 [P1.change]' }), ctx))
    expect(rows[0].content).toBe('<b>x</b> [P1.change]')
    expect(rows[0].source).toBe('ChatGPT')
  })
  it('다른 회차의 분석 id로는 확정·취소 불가 404', async () => {
    rows.push({ id: 'other', round_id: 'r9', version: 1, status: 'draft', published_at: null, content: 'z' })
    as('lead'); expect((await json(PATCH(req('PATCH', { id: 'other', action: 'withdraw' }), ctx))).status).toBe(404)
  })
})
