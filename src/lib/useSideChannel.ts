'use client'

// 운동장 레이스·대결 전용 실시간 채널 — 참가자끼리만 주고받는다(2026-11-05).
// 예전엔 위치 같은 잦은 메시지를 운동장 전체 채널(playground-날짜)로 보내서, 구경하는 사람까지 다 받았다.
// Supabase 무료 플랜 한도(초당 100, 보낸 1 + 받은 사람 수만큼 셈)를 4명만 돼도 넘었다.
// name이 null이면(혼자·CPU 대결 등) 채널을 열지 않는다. 구독 전·끊긴 동안 보낸 건 fallback(운동장 채널)으로 보낸다 —
//   전용 채널이 안 붙은 사람의 위치가 아예 안 가면 다른 화면에서 "나간 사람"으로 보여 레이스가 혼자 끝났다(2026-11-05).

import { useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Channel = ReturnType<ReturnType<typeof createClient>['channel']>

export function useSideChannel<T extends object>(name: string | null, event: string, onMsg: (msg: T) => void, fallback?: (msg: T) => void) {
  const chRef = useRef<Channel | null>(null)
  const ready = useRef(false)
  const cb = useRef(onMsg)
  const fb = useRef(fallback)
  useEffect(() => { cb.current = onMsg; fb.current = fallback })
  useEffect(() => {
    if (!name) return
    const supabase = createClient()
    const ch = supabase.channel(name, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event }, ({ payload }) => cb.current(payload as T))
      .subscribe(status => { ready.current = status === 'SUBSCRIBED' })
    chRef.current = ch
    return () => { ready.current = false; chRef.current = null; void supabase.removeChannel(ch) }
  }, [name, event])
  return useCallback((payload: T) => {
    if (ready.current && chRef.current) void chRef.current.send({ type: 'broadcast', event, payload: payload as Record<string, unknown> })
    else fb.current?.(payload)
  }, [event])
}
