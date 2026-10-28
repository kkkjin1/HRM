import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import { ANALYSIS_CONTENT_MAX as CONTENT_MAX, sanitizeAnalysisText } from '@/lib/team/analyses'

// 외부 LLM 심층 분석 — 회차별 버전 기록. 원본 응답·회차 집계는 건드리지 않는다(별도 테이블 team_round_analyses).
//   GET   팀원: 한 번이라도 확정된 버전(현재 확정본 + 이전 확정본·취소된 확정본)만 / 팀장: 초안 포함 전체
//   POST  팀장: 새 버전(초안) 추가, publish: true면 바로 확정 — 마감된 회차에만
//   PATCH 팀장: { id, action: 'publish' | 'withdraw' } — publish = 게시 승인(팀원 공개), 팀 공식 합의가 아니다
// 게시본도 "외부 AI 해석·팀 검토 전 가설"이다. 팀 합의·검증된 결과로 다루지 않는다(화면 표시 규칙).
// 누가 쓰고(created_by) 게시·취소했는지(published_by·withdrawn_by)는 DB 함수가 기록한다. 본문은 일반 텍스트로만 저장·표시한다.

type Ctx = { params: Promise<{ id: string }> }
const COLS = 'id, round_id, version, source, content, status, based_on, created_by, created_at, published_at, published_by, withdrawn_at, withdrawn_by'

async function session() {
  const s = await getCurrentMember()
  if (!s) return { ok: false as const, res: NextResponse.json({ ok: false }, { status: 401 }) }
  if (!s.member) return { ok: false as const, res: NextResponse.json({ ok: false, error: '로그인 계정이 팀원과 연결되어 있지 않습니다' }, { status: 403 }) }
  return { ok: true as const, member: s.member }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await session()
  if (!s.ok) return s.res
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_round_analyses').select(COLS).eq('round_id', id).order('version', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const rows = s.member.role === 'lead' ? data : data.filter(a => a.published_at)
  return NextResponse.json({ ok: true, analyses: rows })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await session()
  if (!s.ok) return s.res
  if (s.member.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 분석을 반영할 수 있습니다' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const source = typeof body?.source === 'string' ? sanitizeAnalysisText(body.source).replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  const content = typeof body?.content === 'string' ? sanitizeAnalysisText(body.content).trim() : ''
  const basedOn = typeof body?.based_on === 'string' ? body.based_on : null
  if (!source) return NextResponse.json({ ok: false, error: '분석 출처(예: ChatGPT, Claude, 직접 작성)를 적어 주세요' }, { status: 400 })
  if (!content) return NextResponse.json({ ok: false, error: '분석 내용을 붙여 넣어 주세요' }, { status: 400 })
  if (content.length > CONTENT_MAX) return NextResponse.json({ ok: false, error: `분석 내용은 ${CONTENT_MAX.toLocaleString()}자까지 저장할 수 있습니다` }, { status: 400 })

  const supabase = createServiceClient()
  const { data: aid, error } = await supabase.rpc('team_analysis_add', { p_round: id, p_source: source, p_content: content, p_based_on: basedOn, p_actor: s.member.id })
  if (error) {
    const notClosed = /round_not_closed/.test(error.message)
    return NextResponse.json({ ok: false, error: notClosed ? '마감된 진단에만 분석을 반영할 수 있습니다' : error.message }, { status: notClosed ? 409 : 500 })
  }
  if (body?.publish === true) {
    const { error: pubError } = await supabase.rpc('team_analysis_publish', { p_id: aid, p_actor: s.member.id })
    if (pubError) return NextResponse.json({ ok: false, error: pubError.message, id: aid }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: aid })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await session()
  if (!s.ok) return s.res
  if (s.member.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 게시 승인·취소할 수 있습니다' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const aid = typeof body?.id === 'string' ? body.id : ''
  const action = body?.action === 'publish' || body?.action === 'withdraw' ? body.action : null
  if (!aid || !action) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: row } = await supabase.from('team_round_analyses').select('round_id').eq('id', aid).maybeSingle()
  if (!row || row.round_id !== id) return NextResponse.json({ ok: false, error: '분석을 찾을 수 없습니다' }, { status: 404 })
  const { data: status, error } = await supabase.rpc(action === 'publish' ? 'team_analysis_publish' : 'team_analysis_withdraw', { p_id: aid, p_actor: s.member.id })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (status !== 'published' && status !== 'withdrawn') return NextResponse.json({ ok: false, error: status === 'not_draft' ? '초안만 게시 승인할 수 있습니다' : '이미 게시·취소된 버전입니다' }, { status: 409 })
  return NextResponse.json({ ok: true, status })
}
