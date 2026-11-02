import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'
import { RR_ATTACHMENT_BUCKET, canPinRr } from '@/lib/rrMemo'

const STATUSES = ['active', 'hold', 'done'] as const

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const groupId = typeof body?.group_id === 'string' ? body.group_id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!groupId || !title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('team_log_items')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
  const { data, error } = await supabase
    .from('team_log_items')
    .insert({ group_id: groupId, title, sort_order: count ?? 0 })
    .select('id, group_id, title, status, sort_order, pinned')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: { ...data, subtasks: [] } })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const update: Record<string, string | boolean> = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 })
    update.status = body.status
  }
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
    if (!title) return NextResponse.json({ ok: false, error: 'invalid title' }, { status: 400 })
    update.title = title
  }
  const supabase = createServiceClient()
  // 프로젝트 고정은 그 R&R 담당자(그룹 이름 = 팀원 이름)와 팀장만
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') return NextResponse.json({ ok: false, error: 'invalid pinned' }, { status: 400 })
    const session = await getCurrentMember()
    if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
    const { data: owner } = await supabase.from('team_log_items').select('team_log_groups(name)').eq('id', id).maybeSingle()
    const groupName = (owner as { team_log_groups: { name: string } | null } | null)?.team_log_groups?.name ?? ''
    if (!canPinRr(session.member, groupName)) return NextResponse.json({ ok: false, error: '담당자와 팀장만 고정할 수 있습니다.' }, { status: 403 })
    update.pinned = body.pinned
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: 'no fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('team_log_items')
    .update(update)
    .eq('id', id)
    .select('id, group_id, title, status, sort_order, pinned')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_items').delete().eq('id', id)
  // 회차 카드는 대상(target_id)에 FK가 없어 같이 지운다(2027 업무 지도 대비로 대상을 묶어 두지 않음). 첨부 파일도 버킷에서 지운다.
  if (!error) {
    const { data: entries } = await supabase.from('rr_entries').select('id').eq('target_type', 'rr_item').eq('target_id', id)
    const entryIds = (entries ?? []).map(e => e.id)
    if (entryIds.length) {
      const { data: atts } = await supabase.from('rr_attachments').select('path').in('entry_id', entryIds)
      const paths = (atts ?? []).flatMap(a => (a.path ? [a.path] : [])) // 링크 첨부는 버킷 파일이 없다
      if (paths.length) await supabase.storage.from(RR_ATTACHMENT_BUCKET).remove(paths)
    }
    await supabase.from('rr_entries').delete().eq('target_type', 'rr_item').eq('target_id', id)
  }

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
