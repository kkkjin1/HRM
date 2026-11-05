import { NextResponse } from 'next/server'

// 서버 시각(ms) — 운동장 레이스·대결처럼 여러 PC가 같은 순간에 움직여야 할 때 시계 맞추기용(lib/serverClock.ts).
// HTTP Date 헤더는 초 단위라 PC마다 최대 1초씩 어긋나서 레이스 출발이 제각각이었다(2026-11-05).
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
