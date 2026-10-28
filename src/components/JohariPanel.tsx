'use client'

// 조하리 창 약식 — 2026-08~10에 "익명"으로 안내하고 모은 응답의 집계만 보여 준다(읽기 전용).
// U2부터 새 조하리 선택은 실명 팀 진단(R0·정기 진단)에서만 받는다. 이 익명 자료는 덮어쓰거나 실명 결과와 섞지 않고,
// 작성자 없이 DB 집계(johari_summary)로만 읽는다. 원본 쓰기는 DB에서 닫혀 있다(add_team_rounds.sql).

import { useEffect, useState } from 'react'
import { useAllMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import { computeJohariFromCounts, traitLabel, type JohariSummary } from '@/lib/johari'
import { fetchJohariSummaries } from '@/lib/teamSummaries'

export default function JohariPanel() {
  const { members, loaded: membersLoaded } = useAllMembers()
  const { me } = useCurrentMember()
  const [summaries, setSummaries] = useState<JohariSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchJohariSummaries().then(rows => {
      if (!active) return
      setSummaries(rows ?? [])
      setLoadFailed(rows === null)
      setLoaded(true)
    })
    return () => { active = false }
  }, [])

  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  const viewMemberId = viewId ?? me?.id ?? members[0]?.id ?? null
  const viewMember = members.find(m => m.id === viewMemberId) ?? null
  const viewSummary = viewMemberId ? summaries.find(s => s.about_id === viewMemberId) : undefined
  const selfAnswered = !!viewSummary?.self_traits
  const peerCount = viewSummary?.peer_n ?? 0
  const result = computeJohariFromCounts(viewSummary?.self_traits ?? [], viewSummary?.peer_counts ?? {})

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">조하리 창 <span className="text-[11px] font-medium text-[#7A8491] bg-[#F0F2F5] rounded-full px-2 py-0.5 ml-1 align-middle">이전 익명 응답 · 집계만</span></p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">2026-08~10 익명으로 모은 선택입니다. 누가 골랐는지는 표시하지 않으며, 새 선택은 팀 진단에서 실명으로 받습니다.</p>
        </div>
      </div>

      {loadFailed && <p className="text-[12px] text-red-500 mb-3">조하리 결과를 불러오지 못했습니다. 새로고침해 주세요.</p>}

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4 mt-3">
        여기서만 얻을 수 있는 건 <b>맹점</b>입니다 — 나는 인식하지 못하는데 동료들은 이미 보고 있는 강점.
      </p>

      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {members.map(m => {
          const active = viewMemberId === m.id
          return (
            <button key={m.id} onClick={() => setViewId(m.id)}
              className={`text-[12.5px] px-3 py-1.5 rounded-md transition-colors ${active ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}>
              {displayNameFull(m)}{me?.id === m.id ? ' (나)' : ''}
            </button>
          )
        })}
      </div>

      {viewMember && (
        <>
          <p className="text-[12px] text-[#7A8491] mb-3">본인 응답 {selfAnswered ? '완료' : '미응답'} · 동료 응답 {peerCount}명</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">열린 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">나도 알고 동료도 안다 — 팀의 공유된 인식</p>
              {result.open.length === 0 ? <p className="text-[12px] text-[#C4CBD2]">아직 없습니다.</p> : (
                <div className="flex flex-wrap gap-1">
                  {result.open.map(t => (
                    <span key={t.key} className="text-[11.5px] bg-[#EEF1FE] text-[#3A5BC7] rounded-full px-2 py-0.5">{traitLabel(t.key)} <span className="text-[10px] opacity-70">{t.peerCount}</span></span>
                  ))}
                </div>
              )}
            </div>
            <div className="border-2 border-[#4C7FE0]/30 bg-[#4C7FE0]/[0.03] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#3A5BC7]">맹점 ★</p>
              <p className="text-[10.5px] text-[#7A8491] mb-2">동료는 보는데 나는 못 본 나 — 여기가 핵심</p>
              {result.blind.length === 0 ? (
                <p className="text-[12px] text-[#C4CBD2]">{peerCount === 0 ? '동료 응답이 없습니다.' : '없습니다. 자기인식과 타인인식이 일치합니다.'}</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {result.blind.map(t => (
                    <span key={t.key} className="text-[11.5px] bg-[#4C7FE0] text-white rounded-full px-2 py-0.5">{traitLabel(t.key)} <span className="text-[10px] opacity-80">{t.peerCount}명</span></span>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">숨겨진 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">나는 아는데 동료는 아직 못 봤다 — 기회가 안 갔을 수 있다</p>
              {result.hidden.length === 0 ? <p className="text-[12px] text-[#C4CBD2]">없습니다.</p> : (
                <div className="flex flex-wrap gap-1">
                  {result.hidden.map(k => <span key={k} className="text-[11.5px] bg-[#F0F2F5] text-[#7A8491] rounded-full px-2 py-0.5">{traitLabel(k)}</span>)}
                </div>
              )}
            </div>
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">미지의 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">아직 아무도 고르지 않은 영역 — 새 역할에서 드러날 수 있다</p>
              <p className="text-[13px] text-[#7A8491]">{result.unknownCount}개</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
