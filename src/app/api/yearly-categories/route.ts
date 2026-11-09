import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// 업무 > 루틴 > 연간 "범주표"의 A열 범주(평가보상·페이롤…) — 해마다 같은 목록. 지우면 그 범주 업무는 미분류(DB가 SET NULL).
const SELECT_COLS = 'id, name, sort_order, color'
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 40) : '')
// 범주 색 팔레트(보라 계열 제외) — 화면 YearlyCalendar 의 CATEGORY_COLORS 와 같게
const CATEGORY_COLORS = ['#2563EB', '#4F9A3A', '#C2410C', '#2F9E9A', '#B8860B', '#B91C1C', '#0E7490', '#E8833A', '#64748B', '#8B5E3C']
const cleanColor = (v: unknown) => (typeof v === 'string' && CATEGORY_COLORS.includes(v.toUpperCase()) ? v.toUpperCase() : null)

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_yearly_categories').select(SELECT_COLS).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, categories: data })
}

export async function POST(request: NextRequest) {
  const name = cleanName((await request.json().catch(() => null))?.name)
  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  // 새 범주는 맨 아래로
  const { data: last } = await supabase.from('team_log_yearly_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1
  // 새 범주 색: 아직 안 쓴 팔레트 색 중 첫 번째(다 썼으면 순서대로)
  const { data: used } = await supabase.from('team_log_yearly_categories').select('color')
  const usedSet = new Set(((used ?? []) as { color: string | null }[]).map(u => (u.color ?? '').toUpperCase()))
  const color = CATEGORY_COLORS.find(c => !usedSet.has(c)) ?? CATEGORY_COLORS[sortOrder % CATEGORY_COLORS.length]
  const { data, error } = await supabase.from('team_log_yearly_categories').insert({ name, sort_order: sortOrder, color }).select(SELECT_COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, category: data })
}

export async function PATCH(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  // 이름·색 중 보낸 것만 바꾼다
  const patch: { name?: string; color?: string } = {}
  if (b && 'name' in b) { const name = cleanName(b.name); if (!name) return NextResponse.json({ ok: false, error: 'invalid name' }, { status: 400 }); patch.name = name }
  if (b && 'color' in b) { const color = cleanColor(b.color); if (!color) return NextResponse.json({ ok: false, error: 'invalid color' }, { status: 400 }); patch.color = color }
  if (!id || !Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_yearly_categories').update(patch).eq('id', id).select(SELECT_COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, category: data })
}

// 순서 바꾸기 — 전체 순서(id 배열)를 받아 0,1,2…로 다시 매긴다
export async function PUT(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (!ids.length || ids.length > 100) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const results = await Promise.all(ids.map((id, i) => supabase.from('team_log_yearly_categories').update({ sort_order: i }).eq('id', id)))
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_yearly_categories').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
