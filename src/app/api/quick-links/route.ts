import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const COLS = 'id, title, url, group_name, sort_order, created_at'

// 스킴 없이 붙여넣은 주소(notion.so/...)도 새 탭에서 열리도록 https://를 붙인다.
// javascript: 같은 스킴은 링크로 쓰이면 안 되니 http(s)만 허용한다.
function normalizeUrl(v: unknown) {
  if (typeof v !== 'string') return ''
  const raw = v.trim().slice(0, 2000)
  if (!raw) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

function parsePayload(body: unknown) {
  const b = body as Record<string, unknown> | null
  const url = normalizeUrl(b?.url)
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 100) : ''
  if (!url) return null
  return {
    url,
    title: title || new URL(url).hostname,
    group_name: typeof b?.group_name === 'string' ? b.group_name.trim().slice(0, 40) : '',
  }
}

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_quick_links').select(COLS).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, links: data })
}

export async function POST(request: NextRequest) {
  const payload = parsePayload(await request.json().catch(() => null))
  if (!payload) return NextResponse.json({ ok: false, error: '주소를 확인해주세요.' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: last } = await supabase.from('team_log_quick_links').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase.from('team_log_quick_links').insert({ ...payload, sort_order }).select(COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, link: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const payload = parsePayload(body)
  if (!id || !payload) return NextResponse.json({ ok: false, error: '주소를 확인해주세요.' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_quick_links').update(payload).eq('id', id).select(COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, link: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_quick_links').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
