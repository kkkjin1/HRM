'use client'

// 비거리 야구 데이터 훅 — 오늘 라운드(baseball_plays, play_date=오늘) 실시간 구독, 누적 기록, 칭찬 수.

import { useCallback, useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Play } from '@/lib/baseball'

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
