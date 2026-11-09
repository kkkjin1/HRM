import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { memoImagePath } from '@/lib/memoImage'

// 2026-11-10 보안 수정 3건: 근태 캡처 서명 주소 · 아바타 본인 고정 · 업무보고 피드백 팀장 전용

type Row = Record<string, unknown>
let session: { claims: Record<string, unknown>; member: { id: string; name: string; role: string; canManageMembers: boolean } | null } | null
let calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[]
let rpcCalls: { fn: string; args: Row }[]
let uploads: string[]
let signedFor: string[][]

const BASE = 'https://proj.supabase.co/storage/v1/object'
const FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.png'

function table(name: string) {
  const c: { table: string; op: string; payload?: unknown; filters: [string, unknown][] } = { table: name, op: 'select', filters: [] }
  calls.push(c)
  const row = { id: 'it1', meeting_id: 'mt1', kind: 'memo', image_url: `${BASE}/public/meeting-memo-images/${FILE}` }
  const q = {
    select: () => q, order: () => q,
    eq: (k: string, v: unknown) => { c.filters.push([k, v]); return q },
    insert: (p: unknown) => { c.op = 'insert'; c.payload = p; return q },
    update: (p: unknown) => { c.op = 'update'; c.payload = p; return q },
    single: async () => ({ data: c.op === 'update' && name === 'members' ? { id: 'x', avatar_url: 'u' } : { ...row, ...(c.payload as Row) }, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [row], count: 0, error: null }).then(res),
  }
  return q
}
const storage = {
  from: (bucket: string) => ({
    upload: async (path: string) => { uploads.push(`${bucket}/${path}`); return { error: null } },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}/public/${bucket}/${path}` } }),
    createSignedUrls: async (paths: string[]) => {
      signedFor.push(paths)
      return { data: paths.map(p => ({ path: p, signedUrl: `${BASE}/sign/${bucket}/${p}?token=t`, error: null })), error: null }
    },
  }),
}

vi.mock('@/lib/currentMember', () => ({
  getCurrentMember: async () => session,
  sessionName: (s: { member: { name: string } | null }) => s.member?.name ?? '',
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: table, storage,
    rpc: async (fn: string, args: Row) => { rpcCalls.push({ fn, args }); return { data: { status: 'ok', row: { id: 'r' } }, error: null } },
  }),
}))

const items = await import('./meeting-items/route')
const avatar = await import('./avatar/route')
const report = await import('./report-updates/route')

const as = (id: string | null, role = 'member') => {
  session = id ? { claims: {}, member: { id, name: id, role, canManageMembers: false } } : { claims: {}, member: null }
}

beforeEach(() => { session = null; calls = []; rpcCalls = []; uploads = []; signedFor = [] })

describe('memoImagePath', () => {
  it('공개·서명 형식 주소와 파일명에서 경로를 뽑는다', () => {
    expect(memoImagePath(`${BASE}/public/meeting-memo-images/${FILE}`)).toBe(FILE)
    expect(memoImagePath(`${BASE}/sign/meeting-memo-images/${FILE}?token=abc`)).toBe(FILE)
    expect(memoImagePath(FILE)).toBe(FILE)
  })
  it('다른 버킷·외부 주소·경로 조작은 거부', () => {
    expect(memoImagePath(`${BASE}/public/avatars/${FILE}`)).toBeNull()
    expect(memoImagePath('https://evil.example/x.png')).toBeNull()
    expect(memoImagePath(`${BASE}/public/meeting-memo-images/../avatars/${FILE}`)).toBeNull()
    expect(memoImagePath(null)).toBeNull()
  })
})

describe('meeting-items: 근태 캡처는 서명 주소로', () => {
  it('GET은 공개 주소 대신 서명 주소를 내려준다', async () => {
    const res = await items.GET(new NextRequest('http://x/api/meeting-items?meeting_id=mt1'))
    const body = await res.json()
    expect(body.items[0].image_url).toBe(`${BASE}/sign/meeting-memo-images/${FILE}?token=t`)
    expect(signedFor).toEqual([[FILE]])
  })
  it('POST는 고정 위치 주소로 저장하고 서명 주소로 응답한다', async () => {
    const res = await items.POST(new NextRequest('http://x/api/meeting-items', { method: 'POST', body: JSON.stringify({ meeting_id: 'mt1', kind: 'memo', content: '', image_url: `${BASE}/public/meeting-memo-images/${FILE}` }) }))
    const body = await res.json()
    const ins = calls.find(c => c.op === 'insert')!
    expect((ins.payload as Row).image_url).toBe(`${BASE}/public/meeting-memo-images/${FILE}`)
    expect(body.item.image_url).toContain('/sign/meeting-memo-images/')
  })
  it('POST에 외부 이미지 주소는 거부', async () => {
    const res = await items.POST(new NextRequest('http://x/api/meeting-items', { method: 'POST', body: JSON.stringify({ meeting_id: 'mt1', kind: 'memo', content: '', image_url: 'https://evil.example/a.png' }) }))
    expect(res.status).toBe(400)
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })
})

describe('avatar: 폼의 member_id 무시, 로그인 본인만', () => {
  const post = (memberId: string) => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    form.append('member_id', memberId)
    return avatar.POST(new NextRequest('http://x/api/avatar', { method: 'POST', body: form }))
  }
  it('로그인 안 했으면 401, 팀원 연결 없으면 403', async () => {
    expect((await post('kim')).status).toBe(401)
    as(null)
    expect((await post('kim')).status).toBe(403)
    expect(uploads).toEqual([])
  })
  it('남의 member_id를 보내도 본인 사진만 바뀐다', async () => {
    as('lee')
    expect((await post('kim')).status).toBe(200)
    expect(uploads).toEqual(['avatars/lee.png'])
    const upd = calls.find(c => c.table === 'members' && c.op === 'update')!
    expect(upd.filters).toEqual([['id', 'lee']])
  })
})

describe('report-updates: 피드백은 팀장만', () => {
  const post = (field: string) => report.POST(new NextRequest('http://x/api/report-updates', {
    method: 'POST', body: JSON.stringify({ item_id: 'i', meeting_id: 'm', field, content: 'x', expected_version: 0 }),
  }))
  it('팀원·미연결 계정의 피드백 저장은 403', async () => {
    as('lee')
    expect((await post('feedback')).status).toBe(403)
    as(null)
    expect((await post('feedback')).status).toBe(403)
    expect(rpcCalls).toEqual([])
  })
  it('팀장은 피드백 저장 가능, 팀원은 업데이트 저장 가능', async () => {
    as('boss', 'lead')
    expect((await post('feedback')).status).toBe(200)
    as('lee')
    expect((await post('update')).status).toBe(200)
    expect(rpcCalls.map(c => c.args.p_field)).toEqual(['feedback', 'update'])
  })
})
