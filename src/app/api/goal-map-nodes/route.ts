import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_goal_map_nodes').select('node_key, x, y').eq('year', year)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, positions: data ?? [] })
}

// 노드 하나의 위치를 저장(없으면 생성, 있으면 갱신) — 드래그가 끝날 때마다 호출된다.
export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const year = Number(body?.year)
  const nodeKey = typeof body?.node_key === 'string' ? body.node_key.slice(0, 100) : ''
  const x = Number(body?.x)
  const y = Number(body?.y)
  if (!Number.isInteger(year) || !nodeKey || !Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_goal_map_nodes').upsert({ year, node_key: nodeKey, x, y }, { onConflict: 'year,node_key' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 배치 초기화 — 목표 데이터는 건드리지 않고, 그 연도에 저장된 위치만 전부 지운다.
export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_goal_map_nodes').delete().eq('year', year)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
