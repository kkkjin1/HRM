import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// 아카이빙 "정리 필요" — 회의창에서 결정사항으로 등록했지만 아직 사례로 정리(또는 정리 안 함 처리)하지 않은 것.

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meeting_items')
    .select('id, content, created_at, meeting_id, report_item_id, team_log_meetings(title, meeting_date), team_log_report_items(title)')
    .eq('kind', 'decision')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const items = (data ?? []).map(r => {
    const m = one(r.team_log_meetings as { title: string; meeting_date: string } | { title: string; meeting_date: string }[] | null)
    const ri = one(r.team_log_report_items as { title: string } | { title: string }[] | null)
    return {
      id: r.id as string,
      content: r.content as string,
      created_at: r.created_at as string,
      meeting_id: r.meeting_id as string,
      meeting_title: m?.title ?? '',
      meeting_date: m?.meeting_date ?? '',
      source_title: ri?.title ?? '',
    }
  })
  return NextResponse.json({ ok: true, items })
}

// 정리 처리 — archive_case_id가 있으면 "사례로 정리", null이면 "정리 안 함"(목록에서만 뺀다).
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const caseId = typeof body?.archive_case_id === 'string' && body.archive_case_id ? body.archive_case_id : null
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('team_log_meeting_items')
    .update({ archived_at: new Date().toISOString(), archive_case_id: caseId })
    .eq('id', id)
    .eq('kind', 'decision')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
