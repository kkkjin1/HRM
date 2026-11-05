// 🏎 레이스 위치 소식 — 보내는 간격과 받는 쪽 예측(RaceArena가 씀, 테스트 가능하게 분리). 2026-11-05 통신량 줄이기.
import { KART_HY, ROAD_BOT, ROAD_TOP, STEER, type Item } from '@/lib/race'

export type Fx = '' | 'spin' | 'stun' | 'slip' | 'boost' | 'shield'
// s = 조향(-1·0·1, 사람), tl = 목표 차선 y(CPU). cx·cy = 새 소식 받을 때 예측과 어긋난 만큼(점점 0으로)
export type Remote = { x: number; y: number; v: number; fx: Fx; fin: number | null; item: Item | null; s?: -1 | 0 | 1; tl?: number; at: number; cx: number; cy: number }
export type StItem = { id: string } & Omit<Remote, 'at' | 'cx' | 'cy'>
export const ST_MIN_MS = 120 // 바뀌었을 때도 이보다 자주는 안 보냄
export const ST_BEAT_MS = 500 // 안 바뀌어도 이만큼마다
const PREDICT_MAX_S = 0.8 // 소식이 끊겨도 이만큼까지만 앞으로 예측
const BLEND_MS = 150
// 다른 사람 차 위치 예측(wall = Date.now())
export function predict(r: Remote, wall: number): { x: number; y: number } {
  const lag = Math.max(0, Math.min(PREDICT_MAX_S * 1000, wall - r.at)) / 1000
  const stopped = r.fx === 'spin' || r.fx === 'stun' || r.fin !== null
  const x = r.x + (stopped ? 0 : r.v * lag)
  let y = r.y
  if (!stopped && r.tl !== undefined) y = r.y + Math.sign(r.tl - r.y) * Math.min(Math.abs(r.tl - r.y), STEER * lag)
  else if (!stopped && r.s) y = r.y + r.s * STEER * lag
  y = Math.max(ROAD_TOP + KART_HY + 4, Math.min(ROAD_BOT - KART_HY - 4, y))
  const k = Math.max(0, 1 - (wall - r.at) / BLEND_MS)
  return { x: x + r.cx * k, y: y + r.cy * k }
}
