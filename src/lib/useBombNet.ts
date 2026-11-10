'use client'

// 💣 폭탄 놀이터 실시간 채널 (구조 설명은 bombNet.ts 머리말)
// - bomb-{방id}    : 방장 → 모두. 판 전체 소식(event 'w'). 참가자만 구독(방장은 보내기 위해 구독).
// - bomb-{방id}-in : 참가자 → 방장. 위치·폭탄·피격(event 'g'). 방장만 구독하고, 참가자는 구독 없이 httpSend로 보낸다
//                    (참가자끼리 서로의 위치를 받지 않게 → Supabase 무료 한도 초당 100건 안에서 4명까지).
// 구독 전·실패 시엔 fallback(운동장 채널 중계)으로 보낸다.

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BombNetCtl } from '@/components/playground/bomb/BombArena'
import type { BombWire } from './bombNet'

export function useBombNet(bid: string | null, role: 'host' | 'guest' | null, fallback?: (m: BombWire) => void): { net: BombNetCtl | undefined; deliver: (m: BombWire) => void } {
  const listener = useRef<((m: BombWire) => void) | null>(null)
  const sendRef = useRef<(m: BombWire) => void>(() => {})
  const fb = useRef(fallback)
  useEffect(() => { fb.current = fallback })

  useEffect(() => {
    if (!bid || !role) return
    const supabase = createClient()
    const world = supabase.channel(`bomb-${bid}`, { config: { broadcast: { self: false } } })
    const inbox = supabase.channel(`bomb-${bid}-in`, { config: { broadcast: { self: false } } })
    let worldReady = false
    if (role === 'host') {
      inbox.on('broadcast', { event: 'g' }, ({ payload }) => listener.current?.(payload as BombWire)).subscribe()
      world.subscribe(st => { worldReady = st === 'SUBSCRIBED' })
      sendRef.current = m => {
        if (worldReady) void world.send({ type: 'broadcast', event: 'w', payload: m as unknown as Record<string, unknown> })
        else fb.current?.(m)
      }
    } else {
      world.on('broadcast', { event: 'w' }, ({ payload }) => listener.current?.(payload as BombWire)).subscribe(st => { worldReady = st === 'SUBSCRIBED' })
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

  const net = useMemo<BombNetCtl | undefined>(() => {
    if (!bid || !role) return undefined
    return {
      role,
      send: m => sendRef.current(m),
      listen: fn => { listener.current = fn },
    }
  }, [bid, role])
  // 운동장 채널로 중계받은 경기 메시지를 경기 화면에 넘긴다 (전용 채널이 아직 안 붙은 사람이 보낸 것)
  const deliver = useMemo(() => (m: BombWire) => listener.current?.(m), [])
  return { net, deliver }
}
