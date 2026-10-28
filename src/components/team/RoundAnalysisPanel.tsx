'use client'

// 마감된 진단의 외부 LLM 심층 분석 — 팀장: 분석용 데이터 복사(기본 가명) → 외부에서 분석 → 붙여 넣기 → 검토·게시 승인(버전 기록).
// 팀원: 게시된 적 있는 버전만 열람. 어떤 버전이든 "외부 AI 해석·팀 검토 전 가설"로 표시한다(공식 합의·검증 결과 아님).
// 게시 승인 = 팀원 공개 승인(팀 공식 합의 아님). 원본 응답·회차 집계는 바꾸지 않는다(서버는 별도 테이블에 버전으로만 쌓는다).
// 본문은 항상 일반 텍스트로 그린다(HTML·스크립트를 해석하지 않음 — dangerouslySetInnerHTML 금지).

import { useMemo, useState } from 'react'
import { WORK_STYLE_QUESTIONS } from '@/lib/workStyle'
import { HEALTH_ITEMS } from '@/lib/teamHealth'
import { buildAnalysisExport, parseRefs, pseudonymMap } from '@/lib/team/exportData'
import { ANALYSIS_DISCLAIMER, ANALYSIS_FACT_NOTE, ANALYSIS_PUBLISH_NOTE, ANALYSIS_STATUS_LABEL, type AnalysisRow } from '@/lib/team/analyses'
import type { R0Answers, RoundResult } from '@/lib/team/r0'

type Props = {
  isLead: boolean
  round: { id: string; title: string; items_version: string; closed_at: string | null; roster: string[] }
  responses: { member_id: string; answers: R0Answers }[]
  result: RoundResult
  nameOf: (id: string) => string
  analyses: AnalysisRow[]
  busy?: boolean
  error?: string | null
  onSave: (input: { source: string; content: string; publish: boolean; basedOn: string | null }) => Promise<boolean>
  onPublish: (id: string) => void
  onWithdraw: (id: string) => void
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

function pathLabel(path: string) {
  const [head, key] = path.split('.')
  if (head === 'ws') return WORK_STYLE_QUESTIONS.find(q => q.key === key)?.label ?? ({ gives_tags: '보태는 것', needs_tags: '기대하는 것', growth_edge: '잘 못하는 것', team_request: '팀에 부탁' } as Record<string, string>)[key] ?? path
  if (head === 'friction') return `불편 경험 · ${WORK_STYLE_QUESTIONS.find(q => q.key === key)?.label ?? key}`
  if (head === 'health') return HEALTH_ITEMS.find(i => i.id === key) ? `팀 기능 문항 ${key}` : `팀 기능 · ${key}`
  return ({ strengths: '잘하는 것', keep: '꼭 지킬 행동', change: '바꾸고 싶은 것', keep_note: '유지 행동(서술)', change_note: '바꾸고 싶은 것(서술)', friction_note: '불편 경험(서술)', jh_self: '나를 나타내는 말', jh_peers: '동료를 나타내는 말' } as Record<string, string>)[head] ?? path
}

// 본문의 [P3.friction.feedback_pref] 인용을 원래 사람·항목이 보이는 칩으로 바꿔 보여 준다.
function AnalysisBody({ text, resolve }: { text: string; resolve: (who: string) => string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/\[(P\d+|team)\.([a-z_]+(?:\.[A-Za-z0-9_-]+)?)\]/g)) {
    parts.push(text.slice(last, m.index))
    parts.push(
      <span key={m.index} className="inline-block text-[11px] bg-[#EEF1FE] text-[#3A5BC7] rounded px-1 mx-0.5 align-baseline" title={`근거 항목 ${m[0]}`}>
        {m[1] === 'team' ? '팀' : resolve(m[1])} · {pathLabel(m[2])}
      </span>,
    )
    last = (m.index ?? 0) + m[0].length
  }
  parts.push(text.slice(last))
  return <div className="text-[12.5px] text-[#1F2933] leading-relaxed whitespace-pre-wrap break-words">{parts}</div>
}

export default function RoundAnalysisPanel({ isLead, round, responses, result, nameOf, analyses, busy, error, onSave, onPublish, onWithdraw }: Props) {
  const [withNames, setWithNames] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [content, setContent] = useState('')
  const [basedOn, setBasedOn] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const pmap = useMemo(() => pseudonymMap(round.id, round.roster), [round.id, round.roster])
  const resolve = (p: string) => {
    const id = Object.keys(pmap).find(k => pmap[k] === p)
    return id ? `${p}(${nameOf(id)})` : `${p}(알 수 없음)`
  }
  const current = analyses.find(a => a.status === 'published') ?? null
  const shown = (openId ? analyses.find(a => a.id === openId) : null) ?? current
  const refs = useMemo(() => parseRefs(content), [content])
  const unknownRefs = refs.filter(r => r.who !== 'team' && !Object.values(pmap).includes(r.who))

  async function copy() {
    const { text } = buildAnalysisExport({ round, responses, result, nameOf, pseudonymize: !withNames })
    try { await navigator.clipboard.writeText(text); setCopied(`${text.length.toLocaleString()}자 복사됨${withNames ? ' (실명 포함)' : ' (가명)'}`) }
    catch { setCopied('복사하지 못했습니다. 브라우저 권한을 확인해 주세요.') }
  }
  async function save(publish: boolean) {
    if (await onSave({ source, content, publish, basedOn })) { setContent(''); setBasedOn(null); setSource('') }
  }

  return (
    <section className="bg-white rounded-2xl border border-[#EEF0F2] p-5">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <p className="text-[15px] font-semibold text-[#1F2933]">심층 분석 (외부 AI)</p>
        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-[#FFF7ED] text-[#B45309]">팀 검토 전 가설</span>
      </div>
      <p className="text-[12px] text-[#7A8491] mb-1">{ANALYSIS_DISCLAIMER} 원본 응답과 위 분석·집계는 바뀌지 않습니다.</p>
      <p className="text-[12px] text-[#7A8491] mb-4">{ANALYSIS_PUBLISH_NOTE}</p>

      {shown ? (
        <div className="rounded-xl border border-[#E6EAF2] bg-[#FAFBFC] px-4 py-3 mb-4">
          <p className="text-[11.5px] text-[#7A8491] mb-2">
            v{shown.version} · {ANALYSIS_STATUS_LABEL[shown.status]} · 출처 {shown.source} · 작성 {nameOf(shown.created_by)} {fmt(shown.created_at)}
            {shown.published_at ? ` · 게시 승인 ${shown.published_by ? nameOf(shown.published_by) : ''} ${fmt(shown.published_at)}` : ''}
            {shown.withdrawn_at ? ` · 취소 ${shown.withdrawn_by ? nameOf(shown.withdrawn_by) : ''} ${fmt(shown.withdrawn_at)}` : ''}
          </p>
          <p className="text-[11px] text-[#B45309] mb-2">외부 AI 해석 · {ANALYSIS_FACT_NOTE}</p>
          <AnalysisBody text={shown.content} resolve={resolve} />
        </div>
      ) : (
        <p className="text-[12.5px] text-[#B0B8C1] bg-[#FAFBFC] rounded-lg px-4 py-3 mb-4">{isLead ? '아직 게시한 분석이 없습니다.' : '팀장이 게시한 심층 분석이 아직 없습니다.'}</p>
      )}

      {analyses.length > 1 || (analyses.length === 1 && analyses[0].id !== current?.id) ? (
        <details className="mb-4">
          <summary className="text-[12px] text-[#4C7FE0] cursor-pointer">버전 기록 {analyses.length}개</summary>
          <ul className="mt-2 space-y-1">
            {analyses.map(a => (
              <li key={a.id} className="flex items-center gap-2 flex-wrap text-[12px] text-[#3A4249]">
                <button onClick={() => setOpenId(a.id)} className={`underline-offset-2 hover:underline ${shown?.id === a.id ? 'font-semibold' : ''}`}>v{a.version}</button>
                <span className="text-[#7A8491]">{ANALYSIS_STATUS_LABEL[a.status]} · {a.source} · {fmt(a.created_at)}</span>
                {isLead && a.status === 'draft' && <button disabled={busy} onClick={() => onPublish(a.id)} className="text-[11.5px] text-[#047857]">게시 승인</button>}
                {isLead && (a.status === 'draft' || a.status === 'published') && <button disabled={busy} onClick={() => onWithdraw(a.id)} className="text-[11.5px] text-[#B42318]">{a.status === 'published' ? '게시 취소' : '초안 취소'}</button>}
                {isLead && <button onClick={() => { setContent(a.content); setSource(a.source); setBasedOn(a.id) }} className="text-[11.5px] text-[#4C7FE0]">이 버전으로 고쳐 쓰기</button>}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {isLead && (
        <div className="border-t border-[#EEF0F2] pt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[12.5px] font-semibold text-[#1F2933] mb-1">1. 분석용 데이터 복사</p>
            <p className="text-[11.5px] text-[#B45309] bg-[#FFF7ED] rounded-lg px-3 py-2 mb-2 leading-relaxed">
              이 회차의 <b>실명 응답 내용</b>이 외부 AI 서비스로 전송될 수 있습니다. 기본은 가명(P1~P{round.roster.length})이고 자유서술 속 팀원 이름도 가명으로 바꾸지만,{' '}
              <b>별명·직책·특정 사건 같은 묘사로 개인을 알아볼 수 있는 내용은 남을 수 있습니다.</b> 붙여 넣기 전에 복사한 내용을 직접 확인해 주세요.
              이전에 익명으로 모은 조하리·건강도 응답은 포함하지 않습니다.
            </p>
            <label className="flex items-center gap-1.5 text-[12px] text-[#3A4249] mb-2">
              <input type="checkbox" checked={withNames} onChange={e => setWithNames(e.target.checked)} /> 실명 함께 넣기(기본: 가명)
            </label>
            <button onClick={copy} className="text-[12.5px] font-medium text-white bg-[#1F2933] rounded-lg px-3.5 py-2">분석용 데이터 복사</button>
            {copied && <p className="text-[11.5px] text-[#7A8491] mt-1.5">{copied}</p>}
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#1F2933] mb-1">2. 분석 결과 붙여 넣기 {basedOn && <span className="font-normal text-[#7A8491]">· 기존 버전을 고쳐 새 버전으로</span>}</p>
            <input value={source} onChange={e => setSource(e.target.value)} maxLength={60} placeholder="분석 출처 (예: ChatGPT, Claude, 직접 작성)"
              className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 mb-2 focus:outline-none focus:border-[#4C7FE0]" />
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="외부에서 받은 분석을 붙여 넣고 검토·편집하세요. 근거는 [P3.friction.feedback_pref]처럼 인용하면 원본 항목으로 연결됩니다."
              className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0]" />
            <p className="text-[11px] text-[#7A8491] mt-1">
              근거 인용 {refs.length}개{unknownRefs.length ? ` · 이 회차에 없는 응답자 ${[...new Set(unknownRefs.map(r => r.who))].join(', ')}` : ''}
            </p>
            {content.trim() && (
              <details className="mt-1"><summary className="text-[11.5px] text-[#4C7FE0] cursor-pointer">미리보기</summary>
                <div className="mt-2 rounded-lg bg-[#FAFBFC] px-3 py-2"><AnalysisBody text={content} resolve={resolve} /></div>
              </details>
            )}
            {error && <p className="text-[11.5px] text-red-500 mt-1">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button disabled={busy || !content.trim() || !source.trim()} onClick={() => save(false)} className="text-[12.5px] font-medium text-[#3A5BC7] border border-[#C7D6F5] rounded-lg px-3 py-2 disabled:opacity-40">초안 저장</button>
              <button disabled={busy || !content.trim() || !source.trim()} onClick={() => save(true)} title={ANALYSIS_PUBLISH_NOTE} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] rounded-lg px-3 py-2 disabled:opacity-40">검토 후 게시 승인</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
