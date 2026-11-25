'use client'

// 🥊 격투기 실시간 채널 (구조 설명은 brawlNet.ts 머리말, 축구 useSoccerNet과 같은 방식)
// - brawl-{방id}    : 방장 → 모두. 판 전체(event 'w').
// - brawl-{방id}-in-{자리} : 참가자 → 방장(event 'g'). 자리마다 따로 — 방장과 그 자리 참가자만 구독(참가자끼리는 안 받음 → 무료 한도 안).
//   2026-11-25 렉 수정: 예전엔 참가자 키를 httpSend(키 하나마다 인터넷 요청 한 건)로 보내 늦고, 요청끼리 순서가 뒤바뀌면
//   키가 눌린 채로 남을 수 있었다 → 이미 열린 실시간 연결(웹소켓)로 순서대로 보낸다. 구독 전에만 httpSend.
// 구독 전·실패 시엔 fallback(운동장 채널 중계)으로 보낸다.

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BrawlWire } from './brawlNet'

export interface BrawlNetCtl {
  role: 'host' | 'guest'
  send: (m: BrawlWire) => void
  listen: (fn: ((m: BrawlWire) => void) | null) => void
}

export const BRAWL_SEATS = 5
export function useBrawlNet(bid: string | null, role: 'host' | 'guest' | null, fallback?: (m: BrawlWire) => void, seat = -1): { net: BrawlNetCtl | undefined; deliver: (m: BrawlWire) => void } {
  const listener = useRef<((m: BrawlWire) => void) | null>(null)
  const sendRef = useRef<(m: BrawlWire) => void>(() => {})
  const fb = useRef(fallback)
  useEffect(() => { fb.current = fallback })

  useEffect(() => {
    if (!bid || !role) return
    const supabase = createClient()
    const world = supabase.channel(`brawl-${bid}`, { config: { broadcast: { self: false } } })
    const inboxes = role === 'host'
      ? Array.from({ length: BRAWL_SEATS }, (_, i) => supabase.channel(`brawl-${bid}-in-${i}`, { config: { broadcast: { self: false } } }))
      : [supabase.channel(`brawl-${bid}-in-${Math.max(0, seat)}`, { config: { broadcast: { self: false } } })]
    let worldReady = false
    if (role === 'host') {
      for (const inbox of inboxes) inbox.on('broadcast', { event: 'g' }, ({ payload }) => listener.current?.(payload as BrawlWire)).subscribe()
      world.subscribe(st => { worldReady = st === 'SUBSCRIBED' })
      sendRef.current = m => {
        if (worldReady) void world.send({ type: 'broadcast', event: 'w', payload: m as unknown as Record<string, unknown> })
        else fb.current?.(m)
      }
    } else {
      world.on('broadcast', { event: 'w' }, ({ payload }) => listener.current?.(payload as BrawlWire)).subscribe(st => { worldReady = st === 'SUBSCRIBED' })
      const inbox = inboxes[0]
      let inReady = false
      inbox.subscribe(st => { inReady = st === 'SUBSCRIBED' })
      sendRef.current = m => {
        if (inReady) void inbox.send({ type: 'broadcast', event: 'g', payload: m as unknown as Record<string, unknown> })
        else inbox.httpSend('g', m as unknown as Record<string, unknown>).catch(() => fb.current?.(m))
      }
    }
    return () => {
      sendRef.current = () => {}
      void supabase.removeChannel(world)
      for (const inbox of inboxes) void supabase.removeChannel(inbox)
    }
  }, [bid, role, seat])

  const net = useMemo<BrawlNetCtl | undefined>(() => {
    if (!bid || !role) return undefined
    return { role, send: m => sendRef.current(m), listen: fn => { listener.current = fn } }
  }, [bid, role])
  const deliver = useMemo(() => (m: BrawlWire) => listener.current?.(m), [])
  return { net, deliver }
}
