import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'

// 아카이빙 "미리보기 가림" 사례 목록 — 민감한 사례는 카드에서 상황/결론을 흐리게 가린다.
// 팀 공용(team_log_settings의 archive_hidden_ids, 사례 id 배열)이라 누가 가리든 모든 팀원 화면에 같이 가려진다.
const KEY = 'archive_hidden_ids'

async function readIds(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase.from('team_log_settings').select('value').eq('key', KEY).maybeSingle()
  if (error) throw error
  return Array.isArray(data?.value) ? (data.value as unknown[]).filter((id): id is string => typeof id === 'string') : []
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ids: await readIds(createServiceClient()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

// 한 사례 가리기/풀기 — 서버에서 최신 목록을 읽어 그 id만 넣거나 빼고 저장한다(다른 사람이 바꾼 것을 덮어쓰지 않게).
export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id || typeof body?.hidden !== 'boolean') return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  try {
    const current = await readIds(supabase)
    const next = body.hidden ? Array.from(new Set([...current, id])) : current.filter(x => x !== id)
    const { error } = await supabase
      .from('team_log_settings')
      .upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
    return NextResponse.json({ ok: true, ids: next })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
