'use client'

// 조하리 창 약식 — 화면의 무게중심을 '맹점'에 둔다.
// 자기소개(내가 아는 나)는 이미 다른 섹션에 있고, 여기서만 얻을 수 있는 건
// "동료는 보는데 나는 모르는 나"이기 때문이다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import {
  JOHARI_TRAITS, JOHARI_GROUPS, JOHARI_MIN, JOHARI_MAX,
  computeJohari, traitLabel,
} from '@/lib/johari'

type Pick = { about_id: string; author_id: string; traits: string[]; updated_at: string }

export default function JohariPanel() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [picks, setPicks] = useState<Pick[]>([])
  const [loaded, setLoaded] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('johari_picks').select('*')
      if (!active) return
      if (data) setPicks(data as Pick[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  const viewMemberId = viewId ?? me?.id ?? members[0]?.id ?? null
  const viewMember = members.find(m => m.id === viewMemberId) ?? null

  const selfPick = viewMemberId ? picks.find(p => p.about_id === viewMemberId && p.author_id === viewMemberId) : undefined
  const peerPicks = viewMemberId ? picks.filter(p => p.about_id === viewMemberId && p.author_id !== viewMemberId) : []
  const result = computeJohari(selfPick?.traits ?? [], peerPicks.map(p => p.traits))

  function myPickFor(aboutId: string) {
    return me ? picks.find(p => p.about_id === aboutId && p.author_id === me.id) : undefined
  }

  function openEditor(aboutId: string) {
    setDraft(myPickFor(aboutId)?.traits ?? [])
    setEditTarget(aboutId)
  }

  function toggleTrait(key: string) {
    setDraft(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= JOHARI_MAX) return prev
      return [...prev, key]
    })
  }

  async function savePicks() {
    if (!me || !editTarget || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('johari_picks')
      .upsert({ about_id: editTarget, author_id: me.id, traits: draft, updated_at: new Date().toISOString() })
      .select().single()
    if (data) {
      const row = data as Pick
      setPicks(prev => [
        ...prev.filter(p => !(p.about_id === row.about_id && p.author_id === row.author_id)),
        row,
      ])
    }
    setEditTarget(null)
    setBusy(false)
  }

  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  const pendingTargets = me ? members.filter(m => !myPickFor(m.id)) : []
  const editTargetMember = members.find(m => m.id === editTarget) ?? null
  const editingSelf = !!me && editTarget === me.id

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">조하리 창</p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">
            자기인식과 타인인식의 간극 · 나와 동료를 각각 {JOHARI_MIN}~{JOHARI_MAX}개씩 골라주세요
          </p>
        </div>
      </div>

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4">
        여기서만 얻을 수 있는 건 <b>맹점</b>입니다 — 나는 인식하지 못하는데 동료들은 이미 보고 있는 강점.
        내가 아는 나는 이미 위 카드에 적혀 있으니까요.
      </p>

      {/* 내가 아직 안 고른 대상 */}
      {me && pendingTargets.length > 0 && (
        <div className="bg-[#FAFBFB] rounded-lg px-4 py-3 mb-4">
          <p className="text-[11.5px] font-semibold text-[#1F2933] mb-2">아직 고르지 않았습니다</p>
          <div className="flex flex-wrap gap-1.5">
            {pendingTargets.map(m => (
              <button
                key={m.id}
                onClick={() => openEditor(m.id)}
                className="text-[12px] font-medium text-[#4C7FE0] bg-white border border-[#C7D6F5] hover:bg-[#EEF1FE] rounded-full px-3 py-1.5"
              >
                {m.id === me.id ? '나에 대해 고르기' : `${m.name} 고르기`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 대상 선택 탭 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {members.map(m => {
          const active = viewMemberId === m.id
          return (
            <button
              key={m.id}
              onClick={() => setViewId(m.id)}
              className={`text-[12.5px] px-3 py-1.5 rounded-md transition-colors ${active ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
            >
              {m.name}{me?.id === m.id ? ' (나)' : ''}
            </button>
          )
        })}
      </div>

      {!viewMember ? null : (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[12px] text-[#7A8491]">
              본인 응답 {selfPick ? '완료' : '미응답'} · 동료 응답 {peerPicks.length}명
            </p>
            {me && (
              <button
                onClick={() => openEditor(viewMember.id)}
                className="text-[12px] text-[#4C7FE0] hover:underline"
              >
                {myPickFor(viewMember.id) ? '내 선택 수정' : (me.id === viewMember.id ? '나에 대해 고르기' : `${viewMember.name} 고르기`)}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 열린 창 */}
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">열린 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">나도 알고 동료도 안다 — 팀의 공유된 인식</p>
              {result.open.length === 0 ? (
                <p className="text-[12px] text-[#C4CBD2]">아직 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {result.open.map(t => (
                    <span key={t.key} className="text-[11.5px] bg-[#EEF1FE] text-[#3A5BC7] rounded-full px-2 py-0.5">
                      {traitLabel(t.key)} <span className="text-[10px] opacity-70">{t.peerCount}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 맹점 — 강조 */}
            <div className="border-2 border-[#4C7FE0]/30 bg-[#4C7FE0]/[0.03] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#3A5BC7]">맹점 ★</p>
              <p className="text-[10.5px] text-[#7A8491] mb-2">동료는 보는데 나는 못 본 나 — 여기가 핵심</p>
              {result.blind.length === 0 ? (
                <p className="text-[12px] text-[#C4CBD2]">
                  {peerPicks.length === 0 ? '동료 응답을 기다리는 중입니다.' : '없습니다. 자기인식과 타인인식이 일치합니다.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {result.blind.map(t => (
                    <span key={t.key} className="text-[11.5px] bg-[#4C7FE0] text-white rounded-full px-2 py-0.5">
                      {traitLabel(t.key)} <span className="text-[10px] opacity-80">{t.peerCount}명</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 숨겨진 창 */}
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">숨겨진 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">나는 아는데 동료는 아직 못 봤다 — 기회가 안 갔을 수 있다</p>
              {result.hidden.length === 0 ? (
                <p className="text-[12px] text-[#C4CBD2]">없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {result.hidden.map(k => (
                    <span key={k} className="text-[11.5px] bg-[#F0F2F5] text-[#7A8491] rounded-full px-2 py-0.5">{traitLabel(k)}</span>
                  ))}
                </div>
              )}
            </div>

            {/* 미지의 창 */}
            <div className="border border-[#EEF0F2] rounded-lg p-3.5">
              <p className="text-[12px] font-semibold text-[#1F2933]">미지의 창</p>
              <p className="text-[10.5px] text-[#B0B8C1] mb-2">아직 아무도 고르지 않은 영역 — 새 역할에서 드러날 수 있다</p>
              <p className="text-[13px] text-[#7A8491]">{result.unknownCount}개</p>
            </div>
          </div>

          {/* 해석 */}
          {(selfPick || peerPicks.length > 0) && (
            <div className="bg-[#FAFBFB] rounded-lg px-4 py-3 mt-3">
              <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">읽는 법</p>
              <ul className="space-y-1 text-[12.5px] text-[#3A4249] leading-relaxed">
                {result.blind.length > 0 && (
                  <li>
                    • 맹점에 <b>{result.blind.slice(0, 3).map(t => traitLabel(t.key)).join(', ')}</b>가 있습니다.
                    본인은 안 꼽았지만 동료가 꼽았다는 건, 이미 그렇게 <b>기대받고 있다</b>는 뜻입니다.
                  </li>
                )}
                {result.hidden.length > 0 && (
                  <li>
                    • 숨겨진 창의 <b>{result.hidden.slice(0, 3).map(traitLabel).join(', ')}</b>는 본인만 인식하고 있습니다.
                    역량이 없어서가 아니라 <b>드러날 기회가 안 갔을</b> 가능성이 큽니다 — 업무 배분에서 볼 지점입니다.
                  </li>
                )}
                {result.open.length >= 3 && (
                  <li>• 열린 창이 넓습니다. 이 사람에 대해서는 팀의 인식이 이미 정렬되어 있습니다.</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 선택 모달 */}
      {editTarget && editTargetMember && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center px-4" onClick={() => setEditTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[680px] max-h-[85vh] flex flex-col">
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2]">
              <p className="text-[15px] font-semibold text-[#1F2933]">
                {editingSelf ? '나를 가장 잘 나타내는 말' : `${editTargetMember.name}님을 가장 잘 나타내는 말`}
              </p>
              <p className="text-[12px] text-[#7A8491] mt-0.5">
                {JOHARI_MIN}~{JOHARI_MAX}개를 골라주세요 · 현재 {draft.length}개
                {!editingSelf && ' · 본인에게는 보이지만 누가 골랐는지는 표시되지 않습니다'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {JOHARI_GROUPS.map(group => (
                <div key={group}>
                  <p className="text-[11.5px] font-semibold text-[#7A8491] mb-1.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {JOHARI_TRAITS.filter(t => t.group === group).map(t => {
                      const active = draft.includes(t.key)
                      const full = draft.length >= JOHARI_MAX && !active
                      return (
                        <button
                          key={t.key}
                          onClick={() => toggleTrait(t.key)}
                          disabled={full}
                          className={`text-[12.5px] rounded-full px-3 py-1.5 border transition-colors ${
                            active
                              ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]'
                              : full
                                ? 'border-[#EEF0F2] text-[#D3D8DD] cursor-not-allowed'
                                : 'border-[#E5E8EB] text-[#3A4249] hover:bg-[#F7F8F8]'
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-shrink-0 px-5 py-4 border-t border-[#EEF0F2] flex items-center gap-2">
              <button
                onClick={savePicks}
                disabled={busy || draft.length < JOHARI_MIN}
                className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-4 py-2"
              >
                저장
              </button>
              <button onClick={() => setEditTarget(null)} className="text-[13px] font-medium text-[#7A8491] px-4 py-2">취소</button>
              {draft.length < JOHARI_MIN && (
                <span className="text-[11.5px] text-[#B0B8C1]">최소 {JOHARI_MIN}개를 골라주세요.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
