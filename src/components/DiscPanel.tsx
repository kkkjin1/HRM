'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE } from '@/lib/data'
import {
  DISC_QUESTIONS, DISC_SCALE, DISC_TYPE_INFO, calcDiscScores, primaryType, secondaryType, compatibility,
  type DiscType, type DiscScores,
} from '@/lib/disc'

type ResponseRow = { member_id: string; answers: Record<string, number>; scores: DiscScores; updated_at: string }

const TYPE_ORDER: DiscType[] = ['D', 'I', 'S', 'C']

export type DiscRowMap = Map<string, ResponseRow>

export default function DiscPanel({ onRowsChange }: { onRowsChange?: (map: DiscRowMap) => void }) {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [rows, setRows] = useState<ResponseRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [compatTarget, setCompatTarget] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('disc_responses').select('*')
      if (!active) return
      if (data) setRows(data as ResponseRow[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!onRowsChange) return
    const map: DiscRowMap = new Map(rows.map(r => [r.member_id, r]))
    onRowsChange(map)
  }, [rows, onRowsChange])

  useEffect(() => {
    if (!surveyOpen) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setSurveyOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [surveyOpen])

  const myRow = me ? rows.find(r => r.member_id === me.id) ?? null : null
  const answered = rows.filter(r => members.some(m => m.id === r.member_id))
  const allAnswered = DISC_QUESTIONS.every(q => (draft[q.id] ?? 0) > 0)

  function nameOf(id: string) {
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }

  function openSurvey() {
    setDraft(myRow?.answers ?? {})
    setSurveyOpen(true)
  }

  async function saveSurvey() {
    if (!me || busy) return
    setBusy(true)
    const scores = calcDiscScores(draft)
    const supabase = createClient()
    const { data } = await supabase
      .from('disc_responses')
      .upsert({ member_id: me.id, answers: draft, scores, updated_at: new Date().toISOString() })
      .select().single()
    if (data) {
      const row = data as ResponseRow
      setRows(prev => [...prev.filter(r => r.member_id !== row.member_id), row])
    }
    setSurveyOpen(false)
    setBusy(false)
  }

  // 팀 유형 분포
  const typeCounts: Record<DiscType, number> = { D: 0, I: 0, S: 0, C: 0 }
  for (const r of answered) {
    const t = primaryType(r.scores)
    typeCounts[t]++
  }

  // 궁합 뷰: compatTarget(멤버id)과 나의 유형 비교
  const myType = myRow ? primaryType(myRow.scores) : null
  const compatMember = compatTarget ? members.find(m => m.id === compatTarget) : null
  const compatRow = compatTarget ? answered.find(r => r.member_id === compatTarget) : null
  const compatInfo = myType && compatRow ? compatibility(myType, primaryType(compatRow.scores)) : null

  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">DISC 팀 성향</p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">
            팀빌딩 자기인식 진단 · {answered.length}/{members.length}명 응답
          </p>
        </div>
        {me && (
          <button
            onClick={openSurvey}
            className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
          >
            {myRow ? '다시 진단' : '진단하기 (20문항)'}
          </button>
        )}
      </div>

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4">
        DISC는 개인 성격을 판단하는 도구가 아닙니다. <b>이 팀에서 어떤 에너지가 두텁고, 누구와 어떻게 협력하면 좋은가</b>를 확인하는 대화의 출발점입니다.
      </p>

      {answered.length === 0 ? (
        <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center bg-[#FAFBFB] rounded-lg">
          아직 응답이 없습니다. 먼저 진단해보세요.
        </p>
      ) : (
        <>
          {/* 유형 분포 */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {TYPE_ORDER.map(t => {
              const info = DISC_TYPE_INFO[t]
              const count = typeCounts[t]
              return (
                <div key={t} className="rounded-lg px-3 py-2.5 text-center" style={{ background: info.bg, border: `1px solid ${info.border}` }}>
                  <p className="text-[18px] font-bold mb-0.5" style={{ color: info.color }}>{t}</p>
                  <p className="text-[11px] font-medium text-[#3A4249]">{info.name}</p>
                  <p className="text-[20px] font-bold mt-1" style={{ color: info.color }}>{count}</p>
                  <p className="text-[10.5px] text-[#7A8491]">명</p>
                </div>
              )
            })}
          </div>

          {/* 개인별 결과 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {members.map(m => {
              const row = answered.find(r => r.member_id === m.id)
              const palette = DOODLE_PALETTE[m.color_key % 8]
              const pType = row ? primaryType(row.scores) : null
              const sType = row ? secondaryType(row.scores) : null
              const info = pType ? DISC_TYPE_INFO[pType] : null
              const isCompatTarget = compatTarget === m.id
              const canShowCompat = myRow && me && m.id !== me.id && row

              return (
                <div
                  key={m.id}
                  className={`border rounded-lg px-3 py-2.5 transition-colors ${isCompatTarget ? 'border-[#4C7FE0] bg-[#EEF1FE]' : 'border-[#EEF0F2]'}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold flex-shrink-0"
                      style={{ background: palette.bg, color: palette.fg }}
                    >
                      {m.name.slice(-2, -1) || m.name.slice(0, 1)}
                    </span>
                    <span className="text-[12.5px] font-medium text-[#1F2933] flex-1">{m.name}</span>
                    {pType && info && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: info.color, background: info.bg }}>
                        {pType}형{sType ? `/${sType}` : ''}
                      </span>
                    )}
                  </div>

                  {!row ? (
                    <p className="text-[11.5px] text-[#C4CBD2]">미응답</p>
                  ) : info ? (
                    <>
                      <p className="text-[11.5px] font-medium mb-0.5" style={{ color: info.color }}>{info.name}</p>
                      <p className="text-[11px] text-[#7A8491] leading-relaxed mb-1.5">{info.description}</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {info.strengths.map(s => (
                          <span key={s} className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F0F2F5] text-[#3A4249]">{s}</span>
                        ))}
                      </div>
                      {canShowCompat && (
                        <button
                          onClick={() => setCompatTarget(isCompatTarget ? null : m.id)}
                          className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${isCompatTarget ? 'bg-[#4C7FE0] text-white' : 'bg-[#F0F2F5] text-[#4C7FE0] hover:bg-[#EEF1FE]'}`}
                        >
                          {isCompatTarget ? '궁합 닫기' : '나와 궁합 보기'}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* 궁합 뷰 */}
          {compatTarget && compatInfo && compatMember && myType && compatRow && (
            <div className="rounded-xl border border-[#4C7FE0]/30 bg-[#F5F7FF] px-4 py-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[22px]">{compatInfo.emoji}</span>
                <div>
                  <p className="text-[13px] font-semibold text-[#1F2933]">
                    {DISC_TYPE_INFO[myType].name}({myType}) × {DISC_TYPE_INFO[primaryType(compatRow.scores)].name}({primaryType(compatRow.scores)}) — {compatInfo.label}
                  </p>
                  <p className="text-[11px] text-[#7A8491]">나 × {compatMember.name}</p>
                </div>
              </div>
              <p className="text-[12.5px] text-[#3A4249] leading-relaxed">{compatInfo.description}</p>
            </div>
          )}

          {/* 팀 해석 */}
          <div className="bg-[#FAFBFB] rounded-lg px-4 py-3">
            <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">이 조합이 말해주는 것</p>
            <ul className="space-y-1 text-[12.5px] text-[#3A4249] leading-relaxed">
              <li>
                • 가장 두터운 에너지는{' '}
                <b>{TYPE_ORDER.filter(t => typeCounts[t] === Math.max(...TYPE_ORDER.map(x => typeCounts[x]))).map(t => `${DISC_TYPE_INFO[t].name}(${t})`).join(', ')}</b>
                입니다.
              </li>
              {TYPE_ORDER.filter(t => typeCounts[t] === 0).length > 0 && (
                <li>
                  • <b>{TYPE_ORDER.filter(t => typeCounts[t] === 0).map(t => `${DISC_TYPE_INFO[t].name}(${t})`).join(', ')}</b> 에너지가 아직 없습니다 — 의식적으로 그 역할을 담당할 사람을 정해두면 팀이 더 탄탄해집니다.
                </li>
              )}
              {answered.length < members.length && (
                <li className="text-[#B0B8C1]">• {members.length - answered.length}명이 아직 응답하지 않았습니다. 전체 참여 후 결과가 더 의미 있어집니다.</li>
              )}
            </ul>
          </div>
        </>
      )}

      {/* 진단 모달 */}
      {surveyOpen && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center px-4" onClick={() => setSurveyOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[680px] max-h-[85vh] flex flex-col">
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">DISC 성향 진단</p>
              <p className="text-[12px] text-[#7A8491] mt-0.5">각 문장이 평소의 나와 얼마나 가까운지 골라주세요. 정답은 없습니다.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {(['D', 'I', 'S', 'C'] as DiscType[]).map(type => {
                const info = DISC_TYPE_INFO[type]
                const questions = DISC_QUESTIONS.filter(q => q.type === type)
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: info.color }}>{type}</span>
                      <span className="text-[12px] font-semibold" style={{ color: info.color }}>{info.name}</span>
                    </div>
                    <div className="space-y-3">
                      {questions.map((q, i) => (
                        <div key={q.id}>
                          <p className="text-[13px] text-[#1F2933] mb-1.5 leading-relaxed">
                            <span className="text-[#B0B8C1] mr-1.5">{i + 1}.</span>{q.statement}
                          </p>
                          <div className="flex gap-1.5">
                            {DISC_SCALE.map(s => {
                              const active = draft[q.id] === s.value
                              return (
                                <button
                                  key={s.value}
                                  onClick={() => setDraft(prev => ({ ...prev, [q.id]: s.value }))}
                                  className={`flex-1 text-[11px] rounded-md py-1.5 border transition-colors ${
                                    active ? 'text-white border-transparent' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
                                  }`}
                                  style={active ? { background: info.color, borderColor: info.color } : undefined}
                                >
                                  {s.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex-shrink-0 px-5 py-4 border-t border-[#EEF0F2] flex items-center gap-2">
              <button
                onClick={saveSurvey}
                disabled={busy || !allAnswered}
                className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-4 py-2"
              >
                저장
              </button>
              <button onClick={() => setSurveyOpen(false)} className="text-[13px] font-medium text-[#7A8491] px-4 py-2">취소</button>
              {!allAnswered && (
                <span className="text-[11.5px] text-[#B0B8C1]">
                  {DISC_QUESTIONS.length - Object.keys(draft).filter(k => draft[k] > 0).length}문항 남음
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
