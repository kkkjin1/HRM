'use client'

// Belbin 팀 역할 약식 진단 — 결과 화면의 무게중심을 개인 라벨이 아니라
// "팀 전체에서 어떤 역할이 두텁고 어디가 비었는가"에 둔다 (Belbin의 원래 취지).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayName, displayNameFull } from '@/lib/members'
import { DOODLE_PALETTE } from '@/lib/data'
import {
  BELBIN_ROLES, BELBIN_SCALE, BELBIN_CATEGORY_LABEL, BELBIN_CATEGORY_DESC,
  topRoles, teamCoverage, categoryBalance,
  type BelbinScores, type BelbinRoleKey,
} from '@/lib/belbin'

type ResponseRow = { member_id: string; scores: BelbinScores; updated_at: string }

const LEVEL_STYLE = {
  strong: { bar: 'bg-[#4C7FE0]', chip: 'bg-[#EEF1FE] text-[#3A5BC7]', label: '두터움' },
  ok: { bar: 'bg-[#9DB2E8]', chip: 'bg-[#F0F2F5] text-[#7A8491]', label: '보통' },
  gap: { bar: 'bg-[#E5E8EB]', chip: 'bg-[#FBEAF0] text-[#4B1528]', label: '공백' },
} as const

export default function BelbinPanel() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [rows, setRows] = useState<ResponseRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [draft, setDraft] = useState<BelbinScores>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('belbin_responses').select('*')
      if (!active) return
      if (data) setRows(data as ResponseRow[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  const myRow = me ? rows.find(r => r.member_id === me.id) ?? null : null
  const answered = rows.filter(r => members.some(m => m.id === r.member_id))
  const coverage = teamCoverage(answered.map(r => ({ memberId: r.member_id, scores: r.scores })))
  const balance = categoryBalance(coverage)

  function nameOf(id: string) {
    return displayNameFull(members.find(m => m.id === id)) || '알 수 없음'
  }
  function openSurvey() {
    setDraft(myRow?.scores ?? {})
    setSurveyOpen(true)
  }

  async function saveSurvey() {
    if (!me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('belbin_responses')
      .upsert({ member_id: me.id, scores: draft, updated_at: new Date().toISOString() })
      .select().single()
    if (data) {
      const row = data as ResponseRow
      setRows(prev => [...prev.filter(r => r.member_id !== row.member_id), row])
    }
    setSurveyOpen(false)
    setBusy(false)
  }

  const allAnswered = BELBIN_ROLES.every(r => (draft[r.key] ?? 0) > 0)

  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">팀 역할 균형</p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">
            Belbin 팀 역할 약식 자기인식 진단 · {answered.length}/{members.length}명 응답
          </p>
        </div>
        {me && (
          <button
            onClick={openSurvey}
            className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
          >
            {myRow ? '다시 진단' : '진단하기 (9문항)'}
          </button>
        )}
      </div>

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4">
        모두가 모든 역할을 잘할 필요는 없습니다. 팀 안에 그 역할이 <b>있기만 하면</b> 됩니다.
        그래서 아래 판정은 평균이 아니라 <b>그 역할에서 가장 강한 한 명</b>을 기준으로 합니다.
      </p>

      {answered.length === 0 ? (
        <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center bg-[#FAFBFB] rounded-lg">
          아직 응답이 없습니다. 먼저 진단해보세요.
        </p>
      ) : (
        <>
          {/* 카테고리 밸런스 */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {balance.map(b => (
              <div key={b.category} className="bg-[#FAFBFB] rounded-lg px-3 py-2.5">
                <p className="text-[12px] font-semibold text-[#1F2933]">{BELBIN_CATEGORY_LABEL[b.category]}</p>
                <p className="text-[10.5px] text-[#B0B8C1] mb-1.5 leading-tight">{BELBIN_CATEGORY_DESC[b.category]}</p>
                <div className="h-1.5 bg-[#E5E8EB] rounded-full overflow-hidden">
                  <div className="h-full bg-[#4C7FE0] rounded-full" style={{ width: `${(b.score / 5) * 100}%` }} />
                </div>
                <p className="text-[10.5px] text-[#7A8491] mt-1">
                  {b.gaps.length === 0 ? '공백 없음' : `공백: ${b.gaps.map(g => g.name).join(', ')}`}
                </p>
              </div>
            ))}
          </div>

          {/* 역할별 커버리지 */}
          <div className="space-y-1.5 mb-4">
            {coverage.map(c => {
              const style = LEVEL_STYLE[c.level]
              return (
                <div key={c.role.key} className="flex items-center gap-2.5">
                  <span className="text-[12.5px] text-[#3A4249] w-[72px] flex-shrink-0">{c.role.name}</span>
                  <div className="flex-1 h-2 bg-[#F0F2F5] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${(c.best / 5) * 100}%`, transition: 'width .35s' }} />
                  </div>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full flex-shrink-0 w-[46px] text-center ${style.chip}`}>{style.label}</span>
                  <span className="text-[11px] text-[#7A8491] w-[92px] flex-shrink-0 truncate">
                    {c.level === 'gap' ? '—' : c.bestMemberIds.map(nameOf).join(', ')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 해석 */}
          <div className="bg-[#FAFBFB] rounded-lg px-4 py-3 mb-4">
            <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">이 조합이 말해주는 것</p>
            <ul className="space-y-1 text-[12.5px] text-[#3A4249] leading-relaxed">
              <li>
                • 가장 두터운 역할은{' '}
                <b>{[...coverage].sort((a, b) => b.best - a.best).slice(0, 2).map(c => c.role.name).join(', ')}</b>
                {' '}입니다. 이 팀이 자연스럽게 잘 굴러가는 지점입니다.
              </li>
              {coverage.some(c => c.level === 'gap') ? (
                <li>
                  • 반대로 <b>{coverage.filter(c => c.level === 'gap').map(c => c.role.name).join(', ')}</b>는 아무도 강하게 잡고 있지 않습니다.
                  이건 개인의 부족이 아니라 <b>팀 구성의 빈칸</b>이라, 채용·역할 재배치·의도적 분담으로 메꿔야 합니다.
                </li>
              ) : (
                <li>• 9개 역할 모두 최소 한 명 이상이 받치고 있습니다. 역할 공백은 없습니다.</li>
              )}
              {coverage.filter(c => c.level !== 'gap' && c.bestMemberIds.length === 1).length > 0 && (
                <li>
                  • 한 사람에게만 걸린 역할이 있습니다 —{' '}
                  {coverage.filter(c => c.level !== 'gap' && c.bestMemberIds.length === 1).slice(0, 3)
                    .map(c => `${c.role.name}(${nameOf(c.bestMemberIds[0])})`).join(', ')}.
                  그 사람이 빠지면 바로 티가 나는 지점입니다.
                </li>
              )}
            </ul>
          </div>

          {/* 개인별 상위 역할 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {members.map(m => {
              const row = rows.find(r => r.member_id === m.id)
              const palette = DOODLE_PALETTE[m.color_key % 8]
              const tops = row ? topRoles(row.scores, 3) : []
              return (
                <div key={m.id} className="border border-[#EEF0F2] rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold flex-shrink-0"
                      style={{ background: palette.bg, color: palette.fg }}
                    >
                      {displayName(m).slice(-2, -1) || displayName(m).slice(0, 1)}
                    </span>
                    <span className="text-[12.5px] font-medium text-[#1F2933]">{displayNameFull(m)}</span>
                  </div>
                  {tops.length === 0 ? (
                    <p className="text-[11.5px] text-[#C4CBD2]">미응답</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {tops.map((r, i) => (
                          <span
                            key={r.key}
                            className={`text-[11px] rounded-full px-2 py-0.5 ${i === 0 ? 'bg-[#EEF1FE] text-[#3A5BC7] font-medium' : 'bg-[#F0F2F5] text-[#7A8491]'}`}
                          >
                            {r.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-[#7A8491] leading-relaxed">{tops[0].contribution}</p>
                      <p className="text-[10.5px] text-[#B0B8C1] leading-relaxed mt-0.5">
                        감수할 점 · {tops[0].allowableWeakness}
                      </p>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* 진단 모달 */}
      {surveyOpen && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center px-4" onClick={() => setSurveyOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[640px] max-h-[85vh] flex flex-col">
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">팀 역할 진단</p>
              <p className="text-[12px] text-[#7A8491] mt-0.5">각 문장이 평소의 나와 얼마나 가까운지 골라주세요. 정답은 없습니다.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {BELBIN_ROLES.map((r, i) => (
                <div key={r.key}>
                  <p className="text-[13.5px] text-[#1F2933] mb-2 leading-relaxed">
                    <span className="text-[#B0B8C1] mr-1.5">{i + 1}.</span>{r.statement}
                  </p>
                  <div className="flex gap-1.5">
                    {BELBIN_SCALE.map(s => {
                      const active = draft[r.key] === s.value
                      return (
                        <button
                          key={s.value}
                          onClick={() => setDraft(prev => ({ ...prev, [r.key as BelbinRoleKey]: s.value }))}
                          className={`flex-1 text-[11.5px] rounded-md py-1.5 border transition-colors ${
                            active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'border-[#E5E8EB] text-[#7A8491] hover:bg-[#F7F8F8]'
                          }`}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
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
              {!allAnswered && <span className="text-[11.5px] text-[#B0B8C1]">9문항을 모두 응답해주세요.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
