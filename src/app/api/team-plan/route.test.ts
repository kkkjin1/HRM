import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 팀 발전계획 API — 권한(팀장만 쓰기·팀원 열람), 저장·재조회, 상태 변경, version 충돌, 허용 칸, 새 월 추가.

type Row = Record<string, unknown>
let session: { claims: Record<string, unknown>; member: { id: string; role: string } | null } | null
let db: Record<string, Row[]>
let n = 0

// supabase-js 체인을 흉내 내는 작은 메모리 DB(쓰이는 메서드만)
function table(name: string) {
  const f: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row | Row[] | null = null
  let orderBy: { col: string; asc: boolean } | null = null
  let lim: number | null = null
  const run = () => {
    const rows = db[name] ??= []
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload!]).map(p => ({ id: `id${++n}`, version: 1, status: 'planned', sort_order: 0, ...p }) as Row)
      if (name === 'team_plan_months' && list.some(p => rows.some(r => r.month === p.month))) return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
      rows.push(...list)
      return { data: list, error: null }
    }
    let hit = rows.filter(r => f.every(fn => fn(r)))
    if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: hit, error: null } }
    if (orderBy) { const { col, asc } = orderBy; hit = [...hit].sort((a, b) => (String(a[col]) > String(b[col]) ? 1 : -1) * (asc ? 1 : -1)) }
    if (lim !== null) hit = hit.slice(0, lim)
    return { data: hit, error: null }
  }
  const q = {
    select: () => q,
    insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return q },
    update: (p: Row) => { op = 'update'; payload = p; return q },
    eq: (c: string, v: unknown) => { f.push(r => r[c] === v); return q },
    in: (c: string, v: unknown[]) => { f.push(r => v.includes(r[c])); return q },
    not: (c: string) => { f.push(r => r[c] !== null && r[c] !== undefined); return q },
    order: (col: string, o?: { ascending?: boolean }) => { orderBy ??= { col, asc: o?.ascending !== false }; return q },
    limit: (k: number) => { lim = k; return q },
    single: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
    maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  }
  return q
}

vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: table }) }))

const { GET, POST, PATCH } = await import('./route')
const req = (method: string, body?: unknown) => new NextRequest('http://x/api/team-plan', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const as = (role: 'lead' | 'part_lead' | 'member' | null) => { session = role ? { claims: {}, member: { id: role, role } } : { claims: {}, member: null } }
const json = async (p: Promise<Response>) => { const r = await p; return { status: r.status, body: await r.json() } }

beforeEach(() => {
  session = null
  n = 0
  db = {
    team_rounds: [{ id: 'r0', kind: 'baseline', title: 'R0 최초 팀 진단', items_version: 'r0-v3', closed_at: '2026-10-30T02:26:32Z', roster: ['a', 'b', 'c', 'd', 'e'] }],
    team_responses: ['a', 'b', 'c', 'd', 'e'].map(m => ({ round_id: 'r0', member_id: m, answers: { secret: '원문' } })),
    team_plan_months: [{ id: 'm11', month: '2026-11-01', theme: '성과와 업무의 출발점', core_question: 'Q', next_question: '', learned_new: '', changed_view: '', still_unknown: '', baseline_round_id: 'r0', version: 1, updated_at: null }],
    team_plan_actions: ['strengthen', 'complement', 'explore'].map((c, i) => ({ id: `a${i}`, month_id: 'm11', category: c, focus: 'f', purpose: '', action_plan: '', evidence: '', status: 'planned', result: '', learned: '', follow_up: '', sort_order: 0, version: 1, updated_at: null })),
  }
})

describe('팀 발전계획 API', () => {
  it('미로그인 401 · 연결 안 된 계정 403', async () => {
    expect((await json(GET())).status).toBe(401)
    as(null)
    expect((await json(GET())).status).toBe(403)
  })

  it('팀원도 열람 가능, 편집 권한 false, 기준 회차는 집계만(응답 원문 없음)', async () => {
    as('member')
    const r = await json(GET())
    expect(r.status).toBe(200)
    expect(r.body.can_edit).toBe(false)
    expect(r.body.months).toHaveLength(1)
    expect(r.body.months[0].actions).toHaveLength(3)
    expect(r.body.baselines).toEqual([{ id: 'r0', title: 'R0 최초 팀 진단', items_version: 'r0-v3', closed_at: '2026-10-30T02:26:32Z', roster_n: 5, submitted_n: 5 }])
    expect(JSON.stringify(r.body)).not.toContain('원문')
  })

  it('팀원·파트장은 수정·추가 403(DB 변화 없음)', async () => {
    for (const role of ['member', 'part_lead'] as const) {
      as(role)
      expect((await json(PATCH(req('PATCH', { target: 'action', id: 'a0', version: 1, fields: { status: 'done' } })))).status).toBe(403)
      expect((await json(POST(req('POST', { op: 'add_month', month: '2027-02' })))).status).toBe(403)
    }
    expect(db.team_plan_actions[0].status).toBe('planned')
    expect(db.team_plan_months).toHaveLength(1)
  })

  it('팀장: 상태·실행 기록 저장 → version 증가, 재조회에 반영', async () => {
    as('lead')
    const r = await json(PATCH(req('PATCH', { target: 'action', id: 'a0', version: 1, fields: { status: 'in_progress', result: ' 역할 조정 1회 ', id: 'hack', month_id: 'x' } })))
    expect(r.status).toBe(200)
    expect(r.body.action).toMatchObject({ status: 'in_progress', result: '역할 조정 1회', version: 2, updated_by: 'lead', month_id: 'm11' })
    const g = await json(GET())
    expect(g.body.months[0].actions.find((a: Row) => a.id === 'a0')).toMatchObject({ status: 'in_progress', result: '역할 조정 1회', version: 2 })
  })

  it('옛 version으로 저장하면 409(먼저 저장된 내용 유지)', async () => {
    as('lead')
    await json(PATCH(req('PATCH', { target: 'month', id: 'm11', version: 1, fields: { learned_new: '첫 저장' } })))
    const r = await json(PATCH(req('PATCH', { target: 'month', id: 'm11', version: 1, fields: { learned_new: '덮어쓰기' } })))
    expect(r.status).toBe(409)
    expect(r.body.conflict).toBe(true)
    expect(db.team_plan_months[0].learned_new).toBe('첫 저장')
  })

  it('잘못된 상태·빈 변경·없는 항목', async () => {
    as('lead')
    expect((await json(PATCH(req('PATCH', { target: 'action', id: 'a0', version: 1, fields: { status: 'win' } })))).status).toBe(400)
    expect((await json(PATCH(req('PATCH', { target: 'action', id: 'a0', version: 1, fields: { nope: 1 } })))).status).toBe(400)
    expect((await json(PATCH(req('PATCH', { target: 'action', id: 'zz', version: 1, fields: { result: 'x' } })))).status).toBe(404)
  })

  it('새 월 추가: 영역별 빈 액션 3개 + 기준 회차 이어받기, 같은 월은 409', async () => {
    as('lead')
    const r = await json(POST(req('POST', { op: 'add_month', month: '2027-02' })))
    expect(r.status).toBe(200)
    expect(r.body.month).toMatchObject({ month: '2027-02-01', baseline_round_id: 'r0' })
    expect(r.body.month.actions.map((a: Row) => a.category)).toEqual(['strengthen', 'complement', 'explore'])
    expect((await json(POST(req('POST', { op: 'add_month', month: '2027-02' })))).status).toBe(409)
    expect((await json(POST(req('POST', { op: 'add_month', month: '2027-13' })))).status).toBe(400)
    const g = await json(GET())
    expect(g.body.months.map((m: Row) => m.month)).toEqual(['2026-11-01', '2027-02-01'])
  })

  it('액션 추가: 같은 영역 뒤에 붙음, 없는 월 404', async () => {
    as('lead')
    const r = await json(POST(req('POST', { op: 'add_action', month_id: 'm11', category: 'explore' })))
    expect(r.status).toBe(200)
    expect(r.body.action).toMatchObject({ month_id: 'm11', category: 'explore', sort_order: 1 })
    expect((await json(POST(req('POST', { op: 'add_action', month_id: 'nope', category: 'explore' })))).status).toBe(404)
    expect((await json(POST(req('POST', { op: 'add_action', month_id: 'm11', category: 'x' })))).status).toBe(400)
  })
})
