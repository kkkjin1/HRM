'use client'

// ⚽ 미니 축구 실시간 채널 (구조 설명은 soccerNet.ts 머리말, 폭탄 놀이터 useBombNet과 같은 방식)
// - soccer-{방id}    : 방장 → 모두. 판 전체(event 'w').
// - soccer-{방id}-in : 참가자 → 방장(event 'g'). 방장만 구독, 참가자는 httpSend로 보낸다(참가자끼리는 안 받음 → 무료 한도 안).
// 구독 전·실패 시엔 fallback(운동장 채널 중계)으로 보낸다.

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SoccerWire } from './soccerNet'

export interface SoccerNetCtl {
  role: 'host' | 'guest'
  send: (m: SoccerWire) => void
  listen: (fn: ((m: SoccerWire) => void) | null) => void
}

export function useSoccerNet(bid: string | null, role: 'host' | 'guest' | null, fallback?: (m: SoccerWire) => void): { net: SoccerNetCtl | undefined; deliver: (m: SoccerWire) => void } {
  const listener = useRef<((m: SoccerWire) => void) | null>(null)
  const sendRef = useRef<(m: SoccerWire) => void>(() => {})
  const fb = useRef(fallback)
  useEffect(() => { fb.current = fallback })

  useEffect(() => {
    if (!bid || !role) return
    const supabase = createClient()
    const world = supabase.channel(`soccer-${bid}`, { config: { broadcast: { self: false } } })
    const inbox = supabase.channel(`soccer-${bid}-in`, { config: { broadcast: { self: false } } })
    let worldReady = false
    if (role === 'host') {
      inbox.on('broadcast', { event: 'g' }, ({ payload }) => listener.current?.(payload as SoccerWire)).subscribe()
      world.subscribe(st => { worldReady = st === 'SUBSCRIBED' })
      sendRef.current = m => {
        if (worldReady) void world.send({ type: 'broadcast', event: 'w', payload: m as unknown as Record<string, unknown> })
        else fb.current?.(m)
      }
    } else {
      world.on('broadcast', { event: 'w' }, ({ payload }) => listener.current?.(payload as SoccerWire)).subscribe(st => { worldReady = st === 'SUBSCRIBED' })
      sendRef.current = m => {
        inbox.httpSend('g', m as unknown as Record<string, unknown>).catch(() => fb.current?.(m))
      }
    }
    return () => {
      sendRef.current = () => {}
      void supabase.removeChannel(world)
      void supabase.removeChannel(inbox)
    }
  }, [bid, role])

  const net = useMemo<SoccerNetCtl | undefined>(() => {
    if (!bid || !role) return undefined
    return { role, send: m => sendRef.current(m), listen: fn => { listener.current = fn } }
  }, [bid, role])
  const deliver = useMemo(() => (m: SoccerWire) => listener.current?.(m), [])
  return { net, deliver }
}
