'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getServerOffset } from '@/lib/serverClock'
import { resolveHolders, type LockMeta } from '@/lib/fieldLockRules'

// 회의록 칸 단위 편집 잠금(안건, 팀원별 진행사항). 충돌을 "고르게" 하지 않고 아예 동시에 못 쓰게 막는다.
//
// - 칸을 클릭(포커스)하면 Supabase Realtime Presence로 "내가 이 칸을 쓰는 중"을 알린다(track). 다른 사람 화면에선
//   그 칸이 읽기 전용이 되고, 쓰는 사람이 치는 글이 실시간으로 보인다(broadcast 'preview' — 읽기 전용 칸에만 보여줌).
// - 잠금은 저장이 끝난 뒤에 푼다(release는 호출부가 저장 완료 후 부른다). 다른 사람은 해제를 보는 순간
//   서버에서 최신값을 다시 읽고(onReleased), 그게 끝날 때까지 "불러오는 중"으로 잠가 둔다 → 풀린 시점엔 항상 최신값.
//   칸을 옮겨 다니면 앞 칸 저장이 끝나기 전에 다음 칸을 잡으므로, 한 세션이 여러 칸을 동시에 잡을 수 있다.
// - 창을 닫거나 접속이 끊기면 Presence가 그 사람을 자동으로 뺀다(추측성 타이머로 풀지 않음).
// - 30초 동안 입력이 없으면 onIdle로 알려 호출부가 칸을 벗어나게(저장 → 해제) 한다.
// - 둘이 거의 동시에 잡으면 먼저 잡은 쪽(since가 이른 쪽, 같으면 세션 id 순)이 이긴다. 진 쪽은 onLost로 알린다.

export type FieldLock =
  | { kind: 'other'; name: string }
  | { kind: 'syncing' }

// 남이 치는 글(미리보기)은 state가 아니라 칸별 구독으로 읽는다(subscribePreview/getPreview) — state로 두면 미리보기가
// 올 때마다(0.15초 간격, 쓰는 사람 수만큼) 보고 있는 모든 사람의 page 전체가 다시 그려져, 회의 중 내 입력이 버벅였다.
export type PreviewSource = {
  subscribePreview: (field: string, listener: () => void) => () => void
  getPreview: (field: string) => string | undefined
}

type Options = {
  // 다른 사람이 쓰던 칸이 풀렸을 때 — 서버 최신값을 다시 읽는다. 끝나면 syncing이 풀린다.
  onReleased: (field: string) => Promise<unknown> | void
  // 내가 잡으려던 칸을 다른 사람이 먼저 잡았을 때 — 내 미저장 입력을 버려야 한다.
  onLost: (field: string, holderName: string) => void
  // 내가 잡은 칸에서 30초 동안 입력이 없을 때 — 호출부가 포커스를 빼서 저장·해제한다.
  onIdle: (field: string) => void
}

export const LOCK_IDLE_MS = 30_000
const PREVIEW_THROTTLE_MS = 150
const SYNC_FALLBACK_MS = 4000

export function useFieldLocks(meetingId: string | null, myName: string, options: Options) {
  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })
  const [session] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Math.random().toString(36).slice(2)}`))

  const [holders, setHolders] = useState<Record<string, { session: string; name: string }>>({})
  const previewsRef = useRef<Record<string, string>>({})
  const previewListenersRef = useRef<Map<string, Set<() => void>>>(new Map())
  const [syncing, setSyncing] = useState<Record<string, true>>({})
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  // 내가 잡은 칸 → 잡은 시각(서버 시계 기준). 비교 규칙은 lib/fieldLockRules.
  const mineRef = useRef<Record<string, number>>({})
  const holdersRef = useRef<Record<string, { session: string; name: string }>>({})
  const offsetRef = useRef(0)
  const idleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const previewTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const previewLastRef = useRef<Record<string, number>>({})
  const myNameRef = useRef(myName)
  useEffect(() => { myNameRef.current = myName })

  useEffect(() => { void getServerOffset().then(o => { offsetRef.current = o }) }, [])

  const setPreview = (field: string, text: string | null) => {
    const cur = previewsRef.current
    if (text === null ? !(field in cur) : cur[field] === text) return
    const next = { ...cur }
    if (text === null) delete next[field]
    else next[field] = text
    previewsRef.current = next
    previewListenersRef.current.get(field)?.forEach(l => l())
  }
  const subscribePreview = useCallback((field: string, listener: () => void) => {
    const map = previewListenersRef.current
    if (!map.has(field)) map.set(field, new Set())
    map.get(field)!.add(listener)
    return () => {
      const set = map.get(field)
      set?.delete(listener)
      if (set && set.size === 0) map.delete(field)
    }
  }, [])
  const getPreview = useCallback((field: string) => previewsRef.current[field], [])

  const trackMine = () => {
    const meta: LockMeta = { name: myNameRef.current, fields: mineRef.current }
    void channelRef.current?.track(meta)
  }

  const clearIdle = (field: string) => {
    const t = idleTimersRef.current[field]
    if (t) { clearTimeout(t); delete idleTimersRef.current[field] }
  }

  const armIdle = (field: string) => {
    clearIdle(field)
    idleTimersRef.current[field] = setTimeout(() => {
      delete idleTimersRef.current[field]
      if (field in mineRef.current) optionsRef.current.onIdle(field)
    }, LOCK_IDLE_MS)
  }

  useEffect(() => {
    if (!meetingId) return
    const supabase = createClient()
    const channel = supabase.channel(`meeting-locks-${meetingId}`, { config: { presence: { key: session }, broadcast: { self: false } } })
    channelRef.current = channel

    const finishSync = (field: string) => setSyncing(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const next = resolveHolders(channel.presenceState<LockMeta>())
        const prev = holdersRef.current
        holdersRef.current = next
        if (JSON.stringify(prev) !== JSON.stringify(next)) setHolders(next)

        // 다른 사람이 쓰던 칸이 풀림 → 최신값 다시 읽기(끝날 때까지 syncing으로 계속 읽기 전용).
        for (const [field, h] of Object.entries(prev)) {
          if (h.session === session) continue
          const now = next[field]
          if (now && now.session !== session) continue
          setPreview(field, null)
          setSyncing(s => ({ ...s, [field]: true }))
          const timer = setTimeout(() => finishSync(field), SYNC_FALLBACK_MS) // 재조회가 멈춰도 영원히 잠기지 않게
          Promise.resolve(optionsRef.current.onReleased(field)).catch(() => {}).finally(() => { clearTimeout(timer); finishSync(field) })
        }

        // 내가 잡으려던 칸을 남이 먼저 잡았으면 진 것 — 내 쪽 잠금을 거두고 알린다.
        const lost = Object.keys(mineRef.current).filter(f => next[f] && next[f].session !== session)
        if (lost.length) {
          for (const f of lost) { delete mineRef.current[f]; clearIdle(f) }
          trackMine()
          for (const f of lost) optionsRef.current.onLost(f, next[f].name)
        }
      })
      .on('broadcast', { event: 'preview' }, ({ payload }) => {
        const p = payload as { field?: string; text?: string }
        if (!p.field || typeof p.text !== 'string') return
        setPreview(p.field, p.text)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') trackMine() })

    return () => {
      mineRef.current = {}
      Object.values(idleTimersRef.current).forEach(clearTimeout)
      Object.values(previewTimersRef.current).forEach(clearTimeout)
      idleTimersRef.current = {}
      previewTimersRef.current = {}
      channelRef.current = null
      holdersRef.current = {}
      for (const f of Object.keys(previewsRef.current)) setPreview(f, null)
      setHolders({}); setSyncing({})
      supabase.removeChannel(channel)
    }
  }, [meetingId, session])

  // 다른 사람이 잡고 있거나 방금 풀려 최신값을 읽는 중이면 그 칸은 읽기 전용이다.
  function lockOf(field: string): FieldLock | null {
    const h = holders[field]
    if (h && h.session !== session) return { kind: 'other', name: h.name }
    if (syncing[field]) return { kind: 'syncing' }
    return null
  }

  // 포커스·입력 때 부른다. 잠겨 있으면 false(호출부는 입력을 받지 않는다).
  function acquire(field: string) {
    if (!meetingId) return true
    if (lockOf(field)) return false
    armIdle(field)
    if (field in mineRef.current) return true
    mineRef.current = { ...mineRef.current, [field]: Date.now() + offsetRef.current }
    trackMine()
    return true
  }

  // 저장이 끝난 뒤 부른다 — 다른 사람은 이 신호를 보고 최신값을 다시 읽는다.
  function release(field: string) {
    if (!(field in mineRef.current)) return
    const next = { ...mineRef.current }
    delete next[field]
    mineRef.current = next
    clearIdle(field)
    const pt = previewTimersRef.current[field]
    if (pt) { clearTimeout(pt); delete previewTimersRef.current[field] }
    trackMine()
  }

  // 내가 쓰는 글을 다른 사람의 읽기 전용 칸에 실시간으로 보여준다(마지막 글자까지 가도록 trailing 전송).
  function sendPreview(field: string, text: string) {
    if (!(field in mineRef.current) || !channelRef.current) return
    armIdle(field)
    const send = () => {
      previewLastRef.current[field] = Date.now()
      void channelRef.current?.send({ type: 'broadcast', event: 'preview', payload: { field, text } })
    }
    const pt = previewTimersRef.current[field]
    if (pt) clearTimeout(pt)
    delete previewTimersRef.current[field]
    if (Date.now() - (previewLastRef.current[field] ?? 0) >= PREVIEW_THROTTLE_MS) send()
    else previewTimersRef.current[field] = setTimeout(() => { delete previewTimersRef.current[field]; send() }, PREVIEW_THROTTLE_MS)
  }

  return { lockOf, acquire, release, sendPreview, subscribePreview, getPreview }
}

export type FieldLocks = ReturnType<typeof useFieldLocks>
