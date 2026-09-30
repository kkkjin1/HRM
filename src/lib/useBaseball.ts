'use client'

// 비거리 야구 데이터 훅 — 오늘 라운드(baseball_plays, play_date=오늘) 실시간 구독, 누적 기록, 칭찬 수.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Play } from '@/lib/baseball'
import type { Duel } from '@/lib/baseballDuel'
import { currentMatch, nextStep, type Tournament } from '@/lib/baseballTournament'

export function upsertPlay(list: Play[], p: Play) {
  return list.some(x => x.id === p.id) ? list.map(x => (x.id === p.id ? p : x)) : [...list, p]
}

export function useTodayPlays(today: string) {
  const [plays, setPlays] = useState<Play[]>([])
  const [loaded, setLoaded] = useState(false)
  const instanceId = useId()

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.from('baseball_plays').select('*').eq('play_date', today).order('created_at')
      if (!active) return
      if (data) setPlays(data as Play[])
      setLoaded(true)
    })()

    const channel = supabase
      .channel(`baseball-plays-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_plays', filter: `play_date=eq.${today}` }, payload => {
        if (!active) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          setPlays(prev => prev.filter(p => p.id !== id))
        } else {
          setPlays(prev => upsertPlay(prev, payload.new as Play))
        }
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [today, instanceId])

  // 내 PC에서 방금 저장한 결과를 Realtime 왕복 전에 바로 반영
  const applyLocal = useCallback((p: Play) => setPlays(prev => upsertPlay(prev, p)), [])

  return { plays, loaded, applyLocal }
}

// 누적 탭을 열 때만 전체 기록을 불러온다.
export function useCareerPlays(enabled: boolean) {
  const [plays, setPlays] = useState<Play[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    createClient()
      .from('baseball_plays')
      .select('*')
      .eq('finished', true)
      .then(({ data }) => { if (active && data) setPlays(data as Play[]) })
    return () => { active = false }
  }, [enabled])

  return plays
}

// 팀원별 누적 칭찬 수 (peer_notes kind='praise'의 about_id)
export function usePraiseCounts() {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    createClient()
      .from('peer_notes')
      .select('about_id')
      .eq('kind', 'praise')
      .then(({ data }) => {
        if (!active) return
        const m = new Map<string, number>()
        for (const r of (data ?? []) as { about_id: string }[]) m.set(r.about_id, (m.get(r.about_id) ?? 0) + 1)
        setCounts(m)
        setLoaded(true)
      })
    return () => { active = false }
  }, [])

  return { counts, loaded }
}

// 관리자(김진일)가 준 팀원별 오늘 추가 게임 수 (baseball_bonus). 쓰기는 DB 정책으로 관리자 계정만 허용된다.
export function useBonus(today: string) {
  const [bonus, setBonusMap] = useState<Map<string, number>>(new Map())
  const instanceId = useId()

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.from('baseball_bonus').select('member_id, extra').eq('play_date', today).then(({ data }) => {
      if (!active) return
      setBonusMap(new Map(((data ?? []) as { member_id: string; extra: number }[]).map(r => [r.member_id, r.extra])))
    })
    const channel = supabase
      .channel(`baseball-bonus-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_bonus', filter: `play_date=eq.${today}` }, payload => {
        if (!active) return
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { member_id?: string; extra?: number }
        if (!row.member_id) return
        setBonusMap(prev => new Map(prev).set(row.member_id!, payload.eventType === 'DELETE' ? 0 : row.extra ?? 0))
      })
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [today, instanceId])

  const setBonus = useCallback(async (memberId: string, extra: number, by: string) => {
    const value = Math.max(0, Math.min(20, extra))
    let prevValue = 0
    setBonusMap(prev => { prevValue = prev.get(memberId) ?? 0; return new Map(prev).set(memberId, value) })
    const { error } = await createClient()
      .from('baseball_bonus')
      .upsert({ member_id: memberId, play_date: today, extra: value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'member_id,play_date' })
    // 저장 실패(권한 없음·테이블 없음 등)면 화면에 먼저 반영한 값을 되돌린다 — 성공한 것처럼 보이지 않게
    if (error) setBonusMap(prev => new Map(prev).set(memberId, prevValue))
    return error?.message ?? null
  }, [today])

  return { bonus, setBonus }
}

// 로그인 계정 이메일 (관리자 판별용) — getSession은 저장소만 읽어 네트워크 요청이 없다.
export function useAuthEmail() {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    createClient().auth.getSession().then(({ data }) => { if (active) setEmail(data.session?.user.email ?? null) })
    return () => { active = false }
  }, [])
  return email
}

// 1:1 대결 — 최근 30분 안에 만들어졌거나 움직인 대결(신청·진행·방금 끝난 것)을 실시간으로 유지한다.
// 인원이 5명 안팎이라 전부 받아도 가볍다. 목록(신청/관전)과 대결 화면이 같은 맵을 본다.
export function useDuels() {
  const [duels, setDuels] = useState<Map<string, Duel>>(new Map())
  const instanceId = useId()

  useEffect(() => {
    let active = true
    const supabase = createClient()
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    supabase.from('baseball_duels').select('*').gte('updated_at', since).then(({ data }) => {
      if (!active || !data) return
      setDuels(prev => {
        const next = new Map(prev)
        for (const d of data as Duel[]) next.set(d.id, d)
        return next
      })
    })
    const channel = supabase
      .channel(`baseball-duels-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_duels' }, payload => {
        if (!active) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) setDuels(prev => { const next = new Map(prev); next.delete(id); return next })
          return
        }
        const d = payload.new as Duel
        setDuels(prev => new Map(prev).set(d.id, d))
      })
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [instanceId])

  // 내 PC에서 방금 쓴 값을 Realtime 왕복 전에 반영
  const applyDuel = useCallback((d: Duel) => setDuels(prev => new Map(prev).set(d.id, d)), [])
  return { duels, applyDuel }
}

// 토너먼트 — 최근 12시간 안에 움직인 토너먼트(모집·진행·방금 끝난 것)를 실시간으로 유지한다.
export function useTournaments() {
  const [tournaments, setTournaments] = useState<Map<string, Tournament>>(new Map())
  const instanceId = useId()

  useEffect(() => {
    let active = true
    const supabase = createClient()
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    supabase.from('baseball_tournaments').select('*').gte('updated_at', since).then(({ data }) => {
      if (!active || !data) return
      setTournaments(prev => {
        const next = new Map(prev)
        for (const t of data as Tournament[]) next.set(t.id, t)
        return next
      })
    })
    const channel = supabase
      .channel(`baseball-tournaments-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_tournaments' }, payload => {
        if (!active || payload.eventType === 'DELETE') return
        const t = payload.new as Tournament
        setTournaments(prev => new Map(prev).set(t.id, t))
      })
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [instanceId])

  const applyTournament = useCallback((t: Tournament) => setTournaments(prev => new Map(prev).set(t.id, t)), [])
  return { tournaments, applyTournament }
}

// 토너먼트 진행 담당 — 위젯을 연 PC 누구나 돌리고, updated_at 낙관적 잠금으로 한 명만 반영된다.
// 경기가 끝나면 승자 기록 → 다음 경기 배정(duel_id를 먼저 bracket에 적고 그 id로 경기 행 생성) → 결승 끝나면 우승.
export function useTournamentDirector(
  t: Tournament | null,
  duels: Map<string, Duel>,
  applyTournament: (t: Tournament) => void,
  applyDuel: (d: Duel) => void,
) {
  const busyRef = useRef(false)

  useEffect(() => {
    if (!t || t.status !== 'running' || busyRef.current) return
    const supabase = createClient()
    const duelRow = (c: { id: string; round: number; match_no: number; a: string; b: string }) => ({
      id: c.id, tournament_id: t.id, round: c.round, match_no: c.match_no,
      challenger_id: c.a, opponent_id: c.b, status: 'playing', halves: [[]],
    })
    const step = nextStep(t, duels, () => crypto.randomUUID())
    if (step) {
      busyRef.current = true
      ;(async () => {
        try {
          const { data } = await supabase.from('baseball_tournaments')
            .update({ bracket: step.bracket, status: step.status, champion_id: step.champion_id, updated_at: new Date().toISOString() })
            .eq('id', t.id).eq('updated_at', t.updated_at)
            .select()
          if (!data?.length) return // 다른 PC가 먼저 진행함 — Realtime으로 최신 값이 곧 온다
          applyTournament(data[0] as Tournament)
          if (step.createDuel) {
            const { data: dd } = await supabase.from('baseball_duels')
              .upsert(duelRow(step.createDuel), { onConflict: 'id', ignoreDuplicates: true })
              .select()
            if (dd?.length) applyDuel(dd[0] as Duel)
          }
        } finally {
          busyRef.current = false
        }
      })()
      return
    }
    // 안전장치: 경기 배정은 됐는데 경기 행이 없으면(배정한 PC가 중간에 꺼짐) 8초 뒤 아무나 대신 만든다
    const cm = currentMatch(t)
    const pendingId = cm?.match.duel_id
    if (!cm || !pendingId || !cm.match.b || duels.has(pendingId)) return
    const timer = setTimeout(async () => {
      const { data: exists } = await supabase.from('baseball_duels').select('*').eq('id', pendingId).maybeSingle()
      if (exists) { applyDuel(exists as Duel); return }
      const { data: dd } = await supabase.from('baseball_duels')
        .upsert(duelRow({ id: pendingId, round: cm.round, match_no: cm.match_no, a: cm.match.a, b: cm.match.b! }), { onConflict: 'id', ignoreDuplicates: true })
        .select()
      if (dd?.length) applyDuel(dd[0] as Duel)
    }, 8000)
    return () => clearTimeout(timer)
  }, [t, duels, applyTournament, applyDuel])
}
