import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const SELECT_COLS = 'id, year, month, title, sort_order, category_id, created_at'

export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .select(SELECT_COLS)
    .eq('year', year)
    .order('month')
    .order('sort_order')
    .order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tasks: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const b = body as Record<string, unknown> | null
  const year = typeof b?.year === 'number' ? b.year : NaN
  const month = typeof b?.month === 'number' ? b.month : NaN
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  const categoryId = typeof b?.category_id === 'string' ? b.category_id : null  // 범주표 빈칸에서 추가하면 그 범주
  // month 0 = 📌 연간(월 미정) 보관함
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 12 || !title) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // 새 항목은 그 달 맨 아래로
  const { data: last } = await supabase.from('team_log_yearly_tasks').select('sort_order')
    .eq('year', year).eq('month', month).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sortOrder = ((last as { sort_order: number | null } | null)?.sort_order ?? -1) + 1
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .insert({ year, month, title, sort_order: sortOrder, category_id: categoryId })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const b = body as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  if (!id || !title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .update({ title })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof (body as Record<string, unknown> | null)?.id === 'string' ? (body as Record<string, string>).id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_yearly_tasks').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ⠿ 끌어서 옮기기 — 옮긴 뒤 그 달(옮겨 간 달)의 전체 순서(id 배열)를 받아 month 와 sort_order 를 0,1,2…로 다시 매긴다.
// 다른 달에서 옮겨 온 항목도 이 배열에 들어 있으므로 month 가 함께 바뀐다. 떠나 온 달은 순서에 빈 번호가 생겨도 정렬엔 문제없다.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const b = body as Record<string, unknown> | null
  const year = typeof b?.year === 'number' ? b.year : NaN
  const month = typeof b?.month === 'number' ? b.month : NaN
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
  // 범주표에서 옮기면 옮긴 항목(moveId)의 범주도 함께 바꾼다(categoryId: null = 미분류). 카드 화면 이동은 범주를 건드리지 않는다.
  const moveId = typeof b?.moveId === 'string' ? b.moveId : null
  const setCategory = !!b && 'categoryId' in b
  const categoryId = typeof b?.categoryId === 'string' ? b.categoryId : null
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 12 || !ids.length || ids.length > 200) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const results = await Promise.all(
    ids.map((id, index) => supabase.from('team_log_yearly_tasks').update({ month, sort_order: index }).eq('id', id).eq('year', year)),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
  if (moveId && setCategory && ids.includes(moveId)) {
    const { error } = await supabase.from('team_log_yearly_tasks').update({ category_id: categoryId }).eq('id', moveId).eq('year', year)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
