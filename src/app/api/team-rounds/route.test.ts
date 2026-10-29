import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sampleAnswers } from '@/lib/team/testFixtures'
import { sampleAnswersV3 } from '@/lib/team/fixturesV3'

// 팀 진단 API — 5명 R0 전체 흐름과 열람 규칙(마감 전 비공개·마감 후 공개), 작성자 위조 차단을 핸들러 단위로 확인한다.
// DB는 메모리 가짜(테이블 + team_round_* 함수의 규칙만 흉내). 실제 SQL 규칙은 PGlite 시험(test_u2)에서 따로 검증.

type Member = { id: string; name: string; role: string; hired_at: string | null; left_at: string | null; auth_user_id: string | null }
type Round = Record<string, unknown> & { id: string; roster: string[]; closed_at: string | null; items_version: string; kind: string }
let session: { claims: Record<string, unknown>; member: { id: string; name: string; role: string; canManageMembers: boolean } | null } | null
let db: { members: Member[]; team_rounds: Round[]; team_responses: Record<string, unknown>[] }
let clock = 0
const ts = () => new Date(Date.UTC(2026, 10, 1, 0, 0, clock++)).toISOString()

function table(name: keyof typeof db) {
  const filters: ((r: Record<string, unknown>) => boolean)[] = []
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
    in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
    order: () => q,
    rows: () => (db[name] as Record<string, unknown>[]).filter(r => filters.every(f => f(r))),
    maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: q.rows(), error: null }).then(res),
  }
  return q
}
const rpc = async (fn: string, a: Record<string, unknown>) => {
  if (fn === 'team_round_open') {
    if (db.team_rounds.some(r => r.kind === 'baseline' && a.p_kind === 'baseline')) return { data: null, error: { code: '23505', message: 'dup' } }
    const id = `r${db.team_rounds.length + 1}`
    db.team_rounds.push({ id, kind: a.p_kind as string, title: a.p_title, items: a.p_items, items_version: a.p_items_version as string, roster: a.p_roster as string[], opened_at: ts(), closes_at: null, closed_at: null, close_reason: null, result: null })
    return { data: id, error: null }
  }
  if (fn === 'team_round_submit') {
    const r = db.team_rounds.find(x => x.id === a.p_round)!
    if (r.closed_at) return { data: null, error: { message: 'round_closed' } }
    const ex = db.team_responses.find(x => x.round_id === a.p_round && x.member_id === a.p_member)
    if (ex) Object.assign(ex, { answers: a.p_answers, updated_at: ts() })
    else db.team_responses.push({ round_id: a.p_round, member_id: a.p_member, items_version: a.p_items_version, answers: a.p_answers, submitted_at: ts(), updated_at: null })
    return { data: { submitted_n: db.team_responses.filter(x => x.round_id === a.p_round).length, roster_n: r.roster.length, first: !ex }, error: null }
  }
  if (fn === 'team_round_close') {
    const r = db.team_rounds.find(x => x.id === a.p_round)!
    if (r.closed_at) return { data: 'already_closed', error: null }
    const n = db.team_responses.filter(x => x.round_id === a.p_round).length
    if (r.kind === 'baseline' && n < r.roster.length) return { data: 'not_all_submitted', error: null }
    Object.assign(r, { closed_at: ts(), close_reason: a.p_reason, result: a.p_result })
    return { data: 'closed', error: null }
  }
  return { data: null, error: { message: 'unknown' } }
}
vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: keyof typeof db) => table(t), rpc }) }))

const list = await import('./route')
const one = await import('./[id]/route')
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: string, body?: unknown) => new NextRequest('http://x/api/team-rounds', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const ids = ['lead', 'part', 'm3', 'm4', 'm5']
const as = (id: string | null) => {
  session = id === null ? { claims: {}, member: null } : { claims: {}, member: { id, name: id, role: id === 'lead' ? 'lead' : id === 'part' ? 'part_lead' : 'member', canManageMembers: id === 'lead' || id === 'part' } }
}
const json = async (p: Promise<Response>) => { const r = await p; return { status: r.status, body: await r.json() } }

beforeEach(() => {
  clock = 0
  db = {
    members: ids.map(id => ({ id, name: id, role: 'member', hired_at: '2025-01-01', left_at: null, auth_user_id: 'u-' + id })),
    team_rounds: [], team_responses: [],
  }
  session = null
})

describe('회차 열기', () => {
  it('미로그인 401 · 연결 안 된 계정 403', async () => {
    expect((await json(list.GET())).status).toBe(401)
    as(null)
    expect((await json(list.GET())).status).toBe(403)
  })
  it('팀장만 열 수 있다(파트장·팀원 403)', async () => {
    as('part'); expect((await json(list.POST(req('POST', { kind: 'baseline' })))).status).toBe(403)
    as('m3'); expect((await json(list.POST(req('POST', { kind: 'baseline' })))).status).toBe(403)
    as('lead'); expect((await json(list.POST(req('POST', { kind: 'baseline' })))).status).toBe(200)
  })
  it('명단 = 재직·입사한 팀원(퇴사자·입사 예정자 제외), 계정 미연결이 있으면 거부', async () => {
    db.members.push({ id: 'gone', name: 'gone', role: 'member', hired_at: null, left_at: '2026-01-01', auth_user_id: 'u-g' })
    db.members.push({ id: 'future', name: 'f', role: 'member', hired_at: '2099-01-01', left_at: null, auth_user_id: null })
    as('lead'); await json(list.POST(req('POST', { kind: 'baseline' })))
    expect(db.team_rounds[0].roster).toEqual(ids)
    db.members.push({ id: 'nolink', name: 'n', role: 'member', hired_at: null, left_at: null, auth_user_id: null })
    expect((await json(list.POST(req('POST', { kind: 'periodic' })))).status).toBe(409)
  })
  it('R0 두 번째는 409', async () => {
    as('lead'); await json(list.POST(req('POST', { kind: 'baseline' })))
    expect((await json(list.POST(req('POST', { kind: 'baseline' })))).status).toBe(409)
  })
})

describe('5명 R0 — 마감 전 비공개 · 전원 제출 자동 마감 · 마감 후 공개', () => {
  beforeEach(async () => { as('lead'); await json(list.POST(req('POST', { kind: 'baseline' }))) })

  it('작성자는 로그인 본인 — 요청에 다른 member_id를 넣어도 무시', async () => {
    as('m3')
    const r = await json(one.PUT(req('PUT', { member_id: 'lead', answers: sampleAnswersV3() }), ctx('r1')))
    expect(r.status).toBe(200)
    expect(db.team_responses.map(x => x.member_id)).toEqual(['m3'])
  })
  it('잘못된 응답은 400(저장 안 됨)', async () => {
    as('m3')
    expect((await json(one.PUT(req('PUT', { answers: {} }), ctx('r1')))).status).toBe(400)
    expect(db.team_responses).toHaveLength(0)
  })
  it('마감 전: 내 응답 + 제출 인원만. 팀장도 남의 응답·집계·제출자 명단을 못 본다', async () => {
    as('m3'); await json(one.PUT(req('PUT', { answers: sampleAnswersV3({ keep_note: 'm3의 비밀' }) }), ctx('r1')))
    as('m4'); await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1')))
    as('lead')
    const d = (await json(one.GET(req('GET'), ctx('r1')))).body.round
    expect([d.status, d.submitted_n, d.roster_n, d.my_submitted]).toEqual(['open', 2, 5, false])
    expect(d.responses).toBeNull()
    expect(d.result).toBeNull()
    expect(d.my_response).toBeNull()
    expect(JSON.stringify(d)).not.toContain('m3의 비밀')
    const l = (await json(list.GET())).body.rounds[0]
    expect(JSON.stringify(l)).not.toMatch(/m3의 비밀|"m4"\s*:/)
    as('m3')
    const mine = (await json(one.GET(req('GET'), ctx('r1')))).body.round
    expect(mine.my_response.answers.keep_note).toBe('m3의 비밀')
    expect(mine.responses).toBeNull()
  })
  it('마감 전 본인 수정 가능', async () => {
    as('m3')
    await json(one.PUT(req('PUT', { answers: sampleAnswersV3({ keep_note: '처음' }) }), ctx('r1')))
    const r = await json(one.PUT(req('PUT', { answers: sampleAnswersV3({ keep_note: '수정' }) }), ctx('r1')))
    expect([r.body.first, r.body.submitted_n]).toEqual([false, 1])
    expect((db.team_responses[0].answers as { keep_note: string }).keep_note).toBe('수정')
  })
  it('다섯 번째 제출에서 자동 마감 → 집계 고정, 이후 전원에게 개인별 응답 공개, 수정 불가', async () => {
    for (const id of ids.slice(0, 4)) { as(id); await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1'))) }
    as('m5')
    const last = await json(one.PUT(req('PUT', { answers: sampleAnswersV3({ keep: ['K05'] }) }), ctx('r1')))
    expect(last.body.closed).toBe(true)
    const r = db.team_rounds[0]
    expect([r.close_reason, (r.result as { n: number }).n]).toEqual(['all_submitted', 5])
    as('m3')
    const d = (await json(one.GET(req('GET'), ctx('r1')))).body.round
    expect(d.status).toBe('closed')
    expect(d.responses.map((x: { member_id: string }) => x.member_id).sort()).toEqual([...ids].sort())
    expect(d.result.keep.K05).toBe(1)
    expect(d.result.version).toBe('r0-v3')
    expect((await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1')))).status).toBe(409)
  })
  it('명단 밖 사람은 제출 403', async () => {
    db.members.push({ id: 'late', name: 'late', role: 'member', hired_at: null, left_at: null, auth_user_id: 'u-late' })
    as('late')
    expect((await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1')))).status).toBe(403)
  })
  it('마감은 팀장만, 응답 0건이면 거부', async () => {
    as('part'); expect((await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))).status).toBe(403)
    as('lead'); expect((await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))).status).toBe(409)
  })
  it('R0는 일부만 제출한 상태에서 팀장도 마감할 수 없다(4/5)', async () => {
    for (const id of ids.slice(0, 4)) { as(id); await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1'))) }
    as('lead')
    const r = await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))
    expect(r.status).toBe(409)
    expect(db.team_rounds[0].closed_at).toBeNull()
    expect((await json(one.GET(req('GET'), ctx('r1')))).body.round.responses).toBeNull()
  })
  it('예외 절차로 명단이 줄어 남은 전원이 냈으면 팀장이 마감할 수 있다(사유: 전원 제출)', async () => {
    for (const id of ids.slice(0, 4)) { as(id); await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1'))) }
    db.team_rounds[0].roster = ids.slice(0, 4) // team_round_exclude_member()가 한 일
    as('lead')
    expect((await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))).body.status).toBe('closed')
    expect(db.team_rounds[0].close_reason).toBe('all_submitted')
  })
})

describe('정기 진단 — R0와 다른 마감 규칙', () => {
  it('정기 진단은 팀장이 제출한 사람 기준으로 마감할 수 있다', async () => {
    as('lead'); await json(list.POST(req('POST', { kind: 'periodic' })))
    as('m3'); await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('r1')))
    as('m3'); expect((await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))).status).toBe(403)
    as('lead')
    const r = await json(one.PATCH(req('PATCH', { action: 'close' }), ctx('r1')))
    expect(r.body.status).toBe('closed')
    expect(db.team_rounds[0].close_reason).toBe('manual')
  })
})

describe('문항 버전 — 새 회차는 r0-v3, 이미 열린 구버전 회차는 그 버전으로', () => {
  it('새로 연 회차는 r0-v3 문항 스냅샷을 고정한다', async () => {
    as('lead'); await json(list.POST(req('POST', { kind: 'baseline' })))
    const r = db.team_rounds[0]
    expect(r.items_version).toBe('r0-v3')
    expect((r.items as { version: string; behavior: { items: unknown[] } }).behavior.items).toHaveLength(12)
  })
  it('r0-v3 회차에 구버전 응답을 보내면 400(저장 안 됨)', async () => {
    as('lead'); await json(list.POST(req('POST', { kind: 'baseline' })))
    as('m3')
    expect((await json(one.PUT(req('PUT', { answers: sampleAnswers() }), ctx('r1')))).status).toBe(400)
    expect(db.team_responses).toHaveLength(0)
  })
  it('운영에 r0-v2로 열려 있던 회차는 v2 응답을 받고 v2 집계로 마감된다', async () => {
    db.team_rounds.push({ id: 'old', kind: 'baseline', title: 'R0', items: {}, items_version: 'r0-v2', roster: ids, opened_at: ts(), closes_at: null, closed_at: null, close_reason: null, result: null })
    as('m3')
    expect((await json(one.PUT(req('PUT', { answers: sampleAnswersV3() }), ctx('old')))).status).toBe(400)
    for (const id of ids) { as(id); expect((await json(one.PUT(req('PUT', { answers: sampleAnswers() }), ctx('old')))).status).toBe(200) }
    const r = db.team_rounds[0]
    expect((r.result as { version: string; strengths: Record<string, number> }).version).toBe('r0-v2')
    expect((r.result as { strengths: Record<string, number> }).strengths.commit).toBe(5)
  })
  it('관찰 기회 없음(na)은 3점으로 바뀌지 않고 그대로 저장·집계된다', async () => {
    as('lead'); await json(list.POST(req('POST', { kind: 'baseline' })))
    for (const id of ids) {
      as(id)
      const a = sampleAnswersV3()
      await json(one.PUT(req('PUT', { answers: { ...a, behavior: { ...a.behavior, B11: id === 'm5' ? 'na' : 3 } } }), ctx('r1')))
    }
    const stored = db.team_responses.find(x => x.member_id === 'm5')!.answers as { behavior: Record<string, unknown> }
    expect(stored.behavior.B11).toBe('na')
    const res = db.team_rounds[0].result as { behavior: Record<string, Record<string, number>> }
    expect(res.behavior.B11).toEqual({ '3': 4, na: 1 })
  })
})
