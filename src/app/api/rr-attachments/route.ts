import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember, sessionName, type CurrentMember } from '@/lib/currentMember'
import { rrGroupNameOf } from '@/lib/rrServer'
import {
  RR_ATTACHMENT_BUCKET, RR_ATTACHMENT_COLS, RR_ATTACHMENT_EXTS, RR_ATTACHMENT_MAX_BYTES, RR_LINK_RE, canWriteRrKind, rrFileExt, type RrEntryKind,
} from '@/lib/rrMemo'

// R&R 메모 회차 카드 첨부파일. 파일은 비공개 버킷에 브라우저가 직접 올린다:
//   1) POST { action: 'sign' }  → 권한·확장자·크기 확인 후 업로드 허가 주소(1회용 토큰) 발급
//   2) 브라우저가 그 주소로 버킷에 올림(Vercel 함수를 거치지 않아 4.5MB 제한 없음)
//   3) POST { action: 'commit' } → 버킷에 실제로 올라간 것을 확인하고 목록에 등록
// 내려받기는 GET ?id= → 로그인 확인 후 짧게 유효한 주소로 넘긴다. 쓰기 권한은 카드와 같다(담당자·팀장).
// 링크 첨부: POST { action: 'link', entry_id, url, label? } — 파일 없이 주소만 남긴다.

type Db = ReturnType<typeof createServiceClient>

async function entryWriteCheck(supabase: Db, entryId: string, member: CurrentMember) {
  const { data: entry } = await supabase.from('rr_entries').select('target_id, kind').eq('id', entryId).maybeSingle()
  if (!entry) return { ok: false as const, status: 404, error: '카드를 찾을 수 없습니다.' }
  const groupName = (await rrGroupNameOf(supabase, entry.target_id)) ?? ''
  if (!canWriteRrKind(member, groupName, entry.kind as RrEntryKind)) return { ok: false as const, status: 403, error: '이 카드에 첨부할 권한이 없습니다.' }
  return { ok: true as const }
}

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/

export async function GET(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: att } = await supabase.from('rr_attachments').select('path, file_name, url').eq('id', id).maybeSingle()
  if (!att) return NextResponse.json({ ok: false, error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  if (att.url) return NextResponse.redirect(att.url, 302)
  if (!att.path) return NextResponse.json({ ok: false, error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  const { data, error } = await supabase.storage.from(RR_ATTACHMENT_BUCKET).createSignedUrl(att.path, 60, { download: att.file_name })
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? '내려받기 주소를 만들지 못했습니다.' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl, 302)
}

export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const entryId = typeof body?.entry_id === 'string' ? body.entry_id : ''

  if (body?.action === 'link') {
    const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 2000) : ''
    if (!entryId || !RR_LINK_RE.test(url)) return NextResponse.json({ ok: false, error: 'http:// 또는 https:// 로 시작하는 주소를 넣어 주세요.' }, { status: 400 })
    const label = (typeof body?.label === 'string' ? body.label.trim().slice(0, 200) : '') || url.replace(/^https?:\/\//i, '').slice(0, 80)
    const supabase = createServiceClient()
    const check = await entryWriteCheck(supabase, entryId, session.member)
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status })
    const { data, error } = await supabase
      .from('rr_attachments')
      .insert({ entry_id: entryId, url, file_name: label, size: 0, uploaded_by: sessionName(session) })
      .select(RR_ATTACHMENT_COLS).single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, attachment: data })
  }

  const fileName = typeof body?.file_name === 'string' ? body.file_name.trim().slice(0, 200) : ''
  const size = typeof body?.size === 'number' && Number.isFinite(body.size) ? body.size : -1
  if (!entryId || !fileName || size < 0) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const ext = rrFileExt(fileName)
  if (!RR_ATTACHMENT_EXTS.includes(ext)) return NextResponse.json({ ok: false, error: `올릴 수 없는 파일 형식입니다(.${ext || '?'}). 문서·엑셀·PPT·PDF·한글·이미지·zip만 됩니다.` }, { status: 400 })
  if (size > RR_ATTACHMENT_MAX_BYTES) return NextResponse.json({ ok: false, error: '파일은 20MB까지 올릴 수 있습니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const check = await entryWriteCheck(supabase, entryId, session.member)
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status })

  if (body.action === 'sign') {
    const path = `${entryId}/${randomUUID()}.${ext}`
    const sign = () => supabase.storage.from(RR_ATTACHMENT_BUCKET).createSignedUploadUrl(path)
    let { data, error } = await sign()
    if (error && /not found|does not exist/i.test(error.message)) {
      // 첫 업로드 — 비공개 버킷을 만든다
      const created = await supabase.storage.createBucket(RR_ATTACHMENT_BUCKET, { public: false, fileSizeLimit: RR_ATTACHMENT_MAX_BYTES })
      if (created.error && !/already exists/i.test(created.error.message)) return NextResponse.json({ ok: false, error: created.error.message }, { status: 500 })
      ;({ data, error } = await sign())
    }
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? '업로드 주소를 만들지 못했습니다.' }, { status: 500 })
    return NextResponse.json({ ok: true, path: data.path, token: data.token })
  }

  if (body.action === 'commit') {
    const path = typeof body?.path === 'string' ? body.path : ''
    if (!PATH_RE.test(path) || !path.startsWith(`${entryId}/`)) return NextResponse.json({ ok: false, error: 'invalid path' }, { status: 400 })
    // 버킷에 실제로 올라갔는지 확인(크기는 버킷 값을 믿는다)
    const [folder, name] = path.split('/')
    const { data: listed } = await supabase.storage.from(RR_ATTACHMENT_BUCKET).list(folder, { search: name, limit: 1 })
    const obj = listed?.find(o => o.name === name)
    if (!obj) return NextResponse.json({ ok: false, error: '파일이 올라가지 않았습니다. 다시 시도해 주세요.' }, { status: 400 })
    const realSize = Number((obj.metadata as { size?: number } | null)?.size ?? size)
    const { data, error } = await supabase
      .from('rr_attachments')
      .insert({ entry_id: entryId, path, file_name: fileName, size: realSize, uploaded_by: sessionName(session) })
      .select(RR_ATTACHMENT_COLS).single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, attachment: data })
  }

  return NextResponse.json({ ok: false, error: 'invalid action' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: att } = await supabase.from('rr_attachments').select('entry_id, path').eq('id', id).maybeSingle()
  if (!att) return NextResponse.json({ ok: true })
  const check = await entryWriteCheck(supabase, att.entry_id, session.member)
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status })
  const { error } = await supabase.from('rr_attachments').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (att.path) await supabase.storage.from(RR_ATTACHMENT_BUCKET).remove([att.path])
  return NextResponse.json({ ok: true })
}
