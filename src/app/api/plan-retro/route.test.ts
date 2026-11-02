import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 팀빌딩 회고 질문 API — 로그인 팀원만, 그달 질문·답변 조회, 본인 답만 저장, 없는 질문 거부

type Row = Record<string, unknown>
let session: { claims: Record<string, unknown>; member: { id: string; role: string } | null } | null
let db: Record<string, Row[]>

function table(name: string) {
  const f: ((r: Row) => boolean)[] = []
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { f.push(r => r[c] === v); return q },
    in: (c: string, v: unknown[]) => { f.push(r => v.includes(r[c])); return q },
    order: () => q,
    maybeSingle: async () => ({ data: (db[name] ?? []).filter(r => f.every(fn => fn(r)))[0] ?? null, error: null }),
    upsert: async (p: Row) => {
      const rows = db[name] ??= []
      const hit = rows.find(r => r.action_id === p.action_id && r.member_id === p.member_id && r.question_key === p.question_key)
      if (hit) Object.assign(hit, p); else rows.push({ ...p })
      return { error: null }
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: (db[name] ?? []).filter(r => f.every(fn => fn(r))), error: null }).then(res),
  }
  return q
}

vi.mock('@/lib/currentMember', () => ({ getCurrentMember: async () => session }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: table }) }))

const { GET, PUT } = await import('./route')
const get = (month: string) => GET(new NextRequest(`http://x/api/plan-retro?month=${month}`))
const put = (body: unknown) => PUT(new NextRequest('http://x/api/plan-retro', { method: 'PUT', body: JSON.stringify(body) }))
const as = (id: string | null) => { session = id ? { claims: {}, member: { id, role: 'member' } } : { claims: {}, member: null } }
const json = async (p: Promise<Response>) => { const r = await p; return { status: r.status, body: await r.json() } }

beforeEach(() => {
  session = null
  db = {
    team_plan_months: [{ id: 'm11', month: '2026-11-01' }],
    team_plan_actions: [
      { id: 'a', month_id: 'm11', category: 'strengthen', focus: '접점', retro_questions: [] },
      { id: 'c', month_id: 'm11', category: 'explore', focus: '체감', retro_questions: [{ key: 'q1', text: '도움', required: true }, { key: 'q2', text: '비용', required: false }] },
    ],
    team_plan_retro_answers: [{ action_id: 'c', member_id: 'kim', question_key: 'q1', answer: '김 답' }],
  }
})

describe('GET', () => {
  it('로그인 안 했거나 팀원 연결이 없으면 거부', async () => {
    expect((await get('2026-11')).status).toBe(401)
    as(null)
    expect((await get('2026-11')).status).toBe(403)
  })
  it('그달 질문과 팀 전체 답변을 준다(질문 없는 액션은 빠짐)', async () => {
    as('lee')
    const { status, body } = await json(get('2026-11'))
    expect(status).toBe(200)
    expect(body.questions.map((q: Row) => `${q.action_id}:${q.key}:${q.required}`)).toEqual(['c:q1:true', 'c:q2:false'])
    expect(body.answers).toEqual([{ action_id: 'c', member_id: 'kim', question_key: 'q1', answer: '김 답' }])
  })
  it('계획 없는 달은 빈 목록', async () => {
    as('lee')
    expect((await json(get('2026-10'))).body).toEqual({ ok: true, questions: [], answers: [] })
  })
})

describe('PUT', () => {
  it('본인 이름으로만 저장한다(본문의 member_id는 무시)', async () => {
    as('lee')
    expect((await json(put({ action_id: 'c', question_key: 'q1', answer: ' 이 답 ', member_id: 'kim' }))).status).toBe(200)
    const rows = db.team_plan_retro_answers
    expect(rows.find(r => r.member_id === 'kim')!.answer).toBe('김 답')
    expect(rows.find(r => r.member_id === 'lee')!.answer).toBe('이 답')
  })
  it('없는 질문·액션은 404, 잘못된 본문은 400', async () => {
    as('lee')
    expect((await put({ action_id: 'c', question_key: 'q9', answer: 'x' })).status).toBe(404)
    expect((await put({ action_id: 'a', question_key: 'q1', answer: 'x' })).status).toBe(404)
    expect((await put({ action_id: 'c', question_key: 'q1', answer: 3 })).status).toBe(400)
  })
})
