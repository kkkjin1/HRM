import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  const color = typeof body?.color === 'string' ? body.color : '#4C7FE0'
  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_groups').select('id', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('team_log_groups')
    .insert({ name, color, sort_order: count ?? 0 })
    .select('id, name, color, sort_order')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, group: { ...data, items: [] } })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  if (!id || !name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_groups')
    .update({ name })
    .eq('id', id)
    .select('id, name, color, sort_order')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, group: data })
}

// R&R 팀원(그룹) 카드 순서 바꾸기 — 끌어서 옮긴 뒤 전체 순서(id 배열)를 받아 sort_order를 0,1,2…로 다시 매긴다.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const order = Array.isArray(body?.order) ? body.order.filter((id: unknown): id is string => typeof id === 'string') : []
  if (order.length === 0) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const results = await Promise.all(
    order.map((id: string, index: number) => supabase.from('team_log_groups').update({ sort_order: index }).eq('id', id)),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_groups').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
