'use client'

// 서버 기준 "오늘"(today_date() RPC, Asia/Seoul)을 화면 전체가 같이 쓴다.
// 홈 박스마다 각자 RPC를 불러 홈 한 번 열 때 13번씩 나가던 것을, 30초 안에는 같은 요청 하나로 묶는다(2026-11-23).
// 반환 모양은 supabase.rpc 결과처럼 { data }라 기존 코드의 `const { data } = await ...`를 그대로 쓸 수 있다.
// 30초 캐시라 자정 직후 최대 30초 늦게 바뀔 수 있다 — 날짜 바뀜 감시(1분 주기)보다 짧다.

import { createClient } from '@/lib/supabase/client'

const TTL_MS = 30_000
let cached: { at: number; p: Promise<{ data: string | null }> } | null = null

export function rpcTodayDate(): Promise<{ data: string | null }> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.p
  const p = Promise.resolve(createClient().rpc('today_date')).then(
    ({ data }) => ({ data: (data as string | null) ?? null }),
    () => ({ data: null }),
  )
  const entry = { at: now, p }
  cached = entry
  // 실패(빈 값)는 캐시하지 않는다 — 다음 호출이 바로 다시 묻게
  void p.then(r => { if (!r.data && cached === entry) cached = null })
  return p
}
