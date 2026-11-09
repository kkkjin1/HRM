import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// 업무 > 연간계획 > 연간 업무: 연간 전체(half 0, 연도 바 아래)·상반기(half 1)·하반기(half 2) 제목 아래 자유 메모. 연도마다 세 칸, 팀 공용.

export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_yearly_notes').select('half, body, updated_at').eq('year', year)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notes: data })
}

export async function PUT(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const year = typeof b?.year === 'number' ? b.year : NaN
  // 0 = 연간 전체, 1 = 상반기, 2 = 하반기
  const half = b?.half === 0 || b?.half === 1 || b?.half === 2 ? b.half : -1
  const body = typeof b?.body === 'string' ? b.body.slice(0, 5000) : null
  if (!Number.isInteger(year) || half < 0 || body === null) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_yearly_notes')
    .upsert({ year, half, body, updated_at: new Date().toISOString() }, { onConflict: 'year,half' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
