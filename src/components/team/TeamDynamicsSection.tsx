'use client'

// 팀 탭 "우리 팀 이해"의 데이터 담당 — 진단 회차는 /api/team-rounds로만 읽고 쓴다(브라우저는 회차 테이블을 직접 못 읽는다).
// R0가 끝났으면 R0 응답 시점의 "나와 일하는 법"으로, 아직이면 현재 프로필로 팀을 분석한다(화면에 출처를 표시).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAllMembers, useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import { analyzeTeam, type Profile } from '@/lib/team/composition'
import type { R0Answers } from '@/lib/team/r0'
import type { RoundDetail, RoundView } from '@/lib/team/rounds'
import type { WorkStyle } from '@/lib/workStyle'
import TeamUnderstanding from '@/components/team/TeamUnderstanding'
import RoundSurvey, { emptyAnswers } from '@/components/team/RoundSurvey'
import RoundResponses from '@/components/team/RoundResponses'

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; error?: string } & Partial<T>> {
  const res = await fetch(url, init ? { ...init, headers: { 'Content-Type': 'application/json' } } : undefined)
  return res.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다' }))
}

export default function TeamDynamicsSection() {
  const { members: active, loaded: activeLoaded } = useMembers()
  const { members: all } = useAllMembers()
  const { me } = useCurrentMember()
  const [workStyles, setWorkStyles] = useState<WorkStyle[]>([])
  const [rounds, setRounds] = useState<RoundView[] | null>(null)
  const [detail, setDetail] = useState<RoundDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listFailed, setListFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [responsesOpen, setResponsesOpen] = useState(false)
  const [surveyError, setSurveyError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  // 지금 보여 줄 회차: 진행 중인 진단이 있으면 그것, 없으면 가장 최근에 마감된 진단(R0 이후엔 정기 진단).
  const current = useMemo(() => {
    if (!rounds?.length) return null
    return rounds.find(r => r.status === 'open') ?? [...rounds].reverse().find(r => r.status === 'closed') ?? null
  }, [rounds])
  const latestClosed = useMemo(() => (rounds ? [...rounds].reverse().find(r => r.status === 'closed') ?? null : null), [rounds])

  useEffect(() => {
    let alive = true
    Promise.all([
      createClient().from('work_styles').select('*'),
      api<{ rounds: RoundView[] }>('/api/team-rounds'),
    ]).then(([ws, list]) => {
      if (!alive) return
      setWorkStyles((ws.data ?? []) as WorkStyle[])
      // 목록을 못 받으면 상태를 모르는 것이라 "시작" 버튼을 숨기고 안내만 한다(DB 원문 오류는 보여 주지 않는다).
      if (list.ok && list.rounds) { setRounds(list.rounds); setError(null); setListFailed(false) }
      else { setRounds([]); setListFailed(true); setError('진단 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.') }
    })
    return () => { alive = false }
  }, [reloadKey])

  // 마감된 회차의 개인별 응답(분석·개인별 보기용) 또는 진행 중 회차의 내 응답(수정용)
  const detailId = latestClosed?.id ?? current?.id ?? null
  useEffect(() => {
    if (!detailId) return
    let alive = true
    api<{ round: RoundDetail }>(`/api/team-rounds/${detailId}`).then(d => { if (alive && d.ok && d.round) setDetail(d.round) })
    return () => { alive = false }
  }, [detailId, reloadKey])
  const [openDetail, setOpenDetail] = useState<RoundDetail | null>(null)
  useEffect(() => {
    if (current?.status !== 'open' || current.id === detailId) return
    let alive = true
    api<{ round: RoundDetail }>(`/api/team-rounds/${current.id}`).then(d => { if (alive && d.ok && d.round) setOpenDetail(d.round) })
    return () => { alive = false }
  }, [current, detailId, reloadKey])

  const nameOf = useCallback((id: string) => displayNameFull(all.find(m => m.id === id)) || '알 수 없음', [all])
  const closedDetail = detail?.status === 'closed' ? detail : null
  const people = useMemo(() => {
    const ids = closedDetail ? closedDetail.roster : active.map(m => m.id)
    return ids.map(id => ({ id, name: nameOf(id) }))
  }, [closedDetail, active, nameOf])
  const profiles = useMemo(() => {
    const out: Record<string, Profile | undefined> = {}
    if (closedDetail?.responses) for (const r of closedDetail.responses) out[r.member_id] = r.answers.ws
    else for (const w of workStyles) out[w.member_id] = w
    return out
  }, [closedDetail, workStyles])
  const analysis = useMemo(() => analyzeTeam({ people, profiles, result: closedDetail?.result ?? null }), [people, profiles, closedDetail])

  const myOpenRound = current?.status === 'open' ? (current.id === detail?.id ? detail : openDetail) : null

  async function start() {
    setBusy(true)
    const r = await api('/api/team-rounds', { method: 'POST', body: JSON.stringify({ kind: rounds?.some(x => x.kind === 'baseline') ? 'periodic' : 'baseline' }) })
    setBusy(false)
    if (!r.ok) setError(r.error ?? '진단을 시작하지 못했습니다')
    reload()
  }
  async function submit(answers: R0Answers) {
    if (!current) return
    setBusy(true)
    setSurveyError(null)
    const r = await api<{ closed: boolean }>(`/api/team-rounds/${current.id}`, { method: 'PUT', body: JSON.stringify({ answers }) })
    setBusy(false)
    if (!r.ok) { setSurveyError(r.error ?? '저장하지 못했습니다'); return }
    setSurveyOpen(false)
    reload()
  }
  async function close() {
    const msg = current?.kind === 'baseline'
      ? '마감할까요? 참여자 전원의 응답으로 결과가 고정되고 모두에게 공개됩니다. 마감 후에는 응답을 고칠 수 없습니다.'
      : `지금 마감할까요? 제출한 ${current?.submitted_n ?? 0}명 기준으로 결과가 고정되고 모두에게 공개됩니다. 마감 후에는 응답을 고칠 수 없습니다.`
    if (!current || !window.confirm(msg)) return
    setBusy(true)
    const r = await api(`/api/team-rounds/${current.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'close' }) })
    setBusy(false)
    if (!r.ok) setError(r.error ?? '마감하지 못했습니다')
    reload()
  }

  if (rounds === null || !activeLoaded) return <p className="text-[13px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>

  const myProfile = workStyles.find(w => w.member_id === me?.id)
  const initial = myOpenRound?.my_response?.answers ?? emptyAnswers(myProfile)

  return (
    <>
      <TeamUnderstanding
        people={people} analysis={analysis} profiles={profiles} round={current}
        isLead={me?.role === 'lead'} busy={busy} error={error} unavailable={listFailed}
        onStart={start} onRespond={() => { setSurveyError(null); setSurveyOpen(true) }} onClose={close}
        onShowResponses={() => setResponsesOpen(true)}
      />
      {surveyOpen && current && me && myOpenRound && (
        <RoundSurvey
          title={current.title} meId={me.id}
          peers={current.roster.filter(id => id !== me.id).map(id => ({ id, name: nameOf(id) }))}
          initial={initial} alreadySubmitted={current.my_submitted} busy={busy} serverError={surveyError}
          onSubmit={submit} onCancel={() => setSurveyOpen(false)}
        />
      )}
      {responsesOpen && closedDetail?.responses && (
        <RoundResponses title={closedDetail.title} responses={closedDetail.responses} nameOf={nameOf} onClose={() => setResponsesOpen(false)} />
      )}
    </>
  )
}
