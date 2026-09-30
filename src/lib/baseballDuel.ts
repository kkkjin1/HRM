// 비거리 야구 1:1 실시간 대결 — 순수 로직(초·말 진행, 연장, 끝내기, 투수 제구).
// 저장은 baseball_duels 1행. halves[h] = h번째 반 이닝의 투구 이벤트(짝수 = 초: 도전자가 던지고 상대가 침,
// 홀수 = 말: 상대가 던지고 도전자가 침). 반 이닝 하나는 솔로 게임과 같은 3타석 규칙(simulateGame)으로 진행한다.

import { PITCH_TYPES, simulateGame, type Pitch, type PitchType, type Slot, type Swing } from '@/lib/baseball'

export const MAX_EXTRA_INNINGS = 3
export const DUEL_INVITE_TTL_MS = 3 * 60 * 1000   // 신청 후 3분 지나면 만료
export const DUEL_STALE_MS = 10 * 60 * 1000       // 10분간 움직임 없는 대결은 목록에서 숨김
export const BATTER_TIMEOUT_MS = 15 * 1000        // 공을 던졌는데 타자 화면이 15초 응답 없으면 투수가 대신 판정

export type DuelStatus = 'invited' | 'playing' | 'done' | 'declined' | 'canceled'

export type Duel = {
  id: string
  tournament_id: string | null
  round: number | null
  match_no: number | null
  challenger_id: string
  opponent_id: string
  status: DuelStatus
  halves: Swing[][]
  pitch: Pitch | null
  challenger_runs: number
  opponent_runs: number
  winner_id: string | null
  created_at: string
  updated_at: string
}

// 투수가 고를 수 있는 구종 (빠지는 볼·사구는 제구 결과로만 나온다)
export const DUEL_PITCHES: PitchType[] = [
  'heater', 'fastball', 'twoseam', 'cutter', 'splitter', 'slider', 'changeup',
  'curve', 'slowcurve', 'eephus', 'knuckle', 'rising', 'sidearm',
]

// 투수가 고르는 도착 높이(존 밖 2단계 포함)와 구속 단계
export type HeightChoice = 'highBall' | 'high' | 'mid' | 'low' | 'lowBall'
export const HEIGHTS: Record<HeightChoice, { label: string; value: number }> = {
  highBall: { label: '높은 볼', value: -1.5 },
  high:     { label: '높게', value: -0.8 },
  mid:      { label: '가운데', value: 0 },
  low:      { label: '낮게', value: 0.8 },
  lowBall:  { label: '낮은 볼', value: 1.5 },
}
export type SpeedChoice = 'slow' | 'normal' | 'fast'
export const SPEEDS: Record<SpeedChoice, { label: string; ratio: number }> = {
  slow:   { label: '느리게', ratio: 0 },
  normal: { label: '보통', ratio: 0.5 },
  fast:   { label: '빠르게', ratio: 1 },
}
export const PERFECT_ERR = 0.25 // 게이지 오차가 이 안이면(가운데 초록 구간) 고른 높이·구속 그대로

export function halfRoles(d: Pick<Duel, 'challenger_id' | 'opponent_id'>, h: number) {
  return h % 2 === 0
    ? { pitcher: d.challenger_id, batter: d.opponent_id }
    : { pitcher: d.opponent_id, batter: d.challenger_id }
}

export function inningLabel(h: number) {
  return `${Math.floor(h / 2) + 1}회${h % 2 === 0 ? '초' : '말'}`
}

// 도전자는 말(홀수 반 이닝)에, 상대는 초(짝수)에 친다
export function duelScore(halves: Swing[][]) {
  let challenger = 0
  let opponent = 0
  halves.forEach((ev, h) => {
    const r = simulateGame(ev).runs
    if (h % 2 === 0) opponent += r
    else challenger += r
  })
  return { challenger, opponent }
}

function sideStats(halves: Swing[][], odd: boolean) {
  let homeruns = 0
  let best = 0
  halves.forEach((ev, h) => {
    if ((h % 2 === 1) !== odd) return
    const st = simulateGame(ev)
    homeruns += st.homeruns
    best = Math.max(best, st.best)
  })
  return { homeruns, best }
}

// 이벤트 하나를 현재 반 이닝에 붙이고 다음 상태(반 이닝 교대·연장·종료·승자)를 계산한다.
// mustWin: 토너먼트처럼 무승부가 없어야 하면 true (연장 후에도 같으면 홈런 → 최장 비거리 → 동전 던지기)
export function applyDuelEvent(
  d: Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'>,
  ev: Swing,
  opts: { mustWin?: boolean; rand?: () => number } = {},
): Pick<Duel, 'halves' | 'pitch' | 'challenger_runs' | 'opponent_runs' | 'status' | 'winner_id'> {
  const halves = d.halves.length ? d.halves.map(x => [...x]) : [[]]
  const h = halves.length - 1
  halves[h].push(ev)
  let status: DuelStatus = 'playing'
  let winner: string | null = null
  const score = () => duelScore(halves)

  const finishWith = (w: string | null) => { status = 'done'; winner = w }
  const byScore = () => {
    const s = score()
    return s.challenger > s.opponent ? d.challenger_id : s.opponent > s.challenger ? d.opponent_id : null
  }

  const st = simulateGame(halves[h])
  const inning = Math.floor(h / 2) + 1
  const s = score()
  // 끝내기: 말 공격 중 도전자가 앞서면 (정규 이닝 마지막 말 또는 연장 말) 즉시 종료
  if (h % 2 === 1 && s.challenger > s.opponent) {
    finishWith(d.challenger_id)
  } else if (st.finished) {
    if (h % 2 === 0) {
      halves.push([]) // 말 공격으로
    } else {
      const w = byScore()
      if (w) finishWith(w)
      else if (inning < 1 + MAX_EXTRA_INNINGS) halves.push([]) // 연장
      else {
        const c = sideStats(halves, true)
        const o = sideStats(halves, false)
        let tb: string | null =
          c.homeruns !== o.homeruns ? (c.homeruns > o.homeruns ? d.challenger_id : d.opponent_id)
            : c.best !== o.best ? (c.best > o.best ? d.challenger_id : d.opponent_id)
              : null
        if (!tb && opts.mustWin) tb = (opts.rand ?? Math.random)() < 0.5 ? d.challenger_id : d.opponent_id
        finishWith(tb)
      }
    }
  }
  const fin = score()
  return { halves, pitch: null, challenger_runs: fin.challenger, opponent_runs: fin.opponent, status, winner_id: winner }
}

// 투수의 선택(구종·높이·구속) + 제구 게이지 오차(err: 0 = 정중앙, 1 = 끝) → 실제로 날아가는 공.
// 가운데 초록 구간이면 고른 대로, 벗어나면 높이·구속이 랜덤(존 밖으로 빠지거나 한가운데 실투가 될 수 있음), 심하면 사구.
export function makeDuelPitch(type: PitchType, height: HeightChoice, speed: SpeedChoice, err: number, rand: () => number = Math.random): Pitch {
  const e = Math.max(0, Math.min(1, err))
  const def = PITCH_TYPES[type]
  const slot: Slot = def.slot
  const windup = Math.round(600 + rand() * 900)
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`
  let h: number
  let v: number
  if (e <= PERFECT_ERR) {
    h = HEIGHTS[height].value + (rand() - 0.5) * 0.1
    v = def.min + (def.max - def.min) * SPEEDS[speed].ratio
  } else {
    h = (rand() * 2 - 1) * 1.7
    v = def.min + rand() * (def.max - def.min)
  }
  const actual: PitchType = e > 0.9 && rand() < 0.4 ? 'hbp' : type
  return { id, type: actual, speed: Math.round(v), alt: h < 0 ? -1 : 1, slot, windup, height: Math.round(h * 100) / 100 }
}

// 제구 게이지: 0.7초 주기로 0→1→0 왕복하는 막대. 멈춘 위치의 정중앙(0.5) 대비 오차를 0~1로.
export const GAUGE_PERIOD_MS = 700
export function gaugePos(elapsed: number) {
  const ph = (elapsed % GAUGE_PERIOD_MS) / GAUGE_PERIOD_MS
  return ph < 0.5 ? ph * 2 : 2 - ph * 2
}
export function gaugeError(pos: number) {
  return Math.min(1, Math.abs(pos - 0.5) * 2)
}

export function isFreshDuel(d: Pick<Duel, 'status' | 'created_at' | 'updated_at'>, nowMs: number) {
  if (d.status === 'invited') return nowMs - new Date(d.created_at).getTime() < DUEL_INVITE_TTL_MS
  if (d.status === 'playing') return nowMs - new Date(d.updated_at).getTime() < DUEL_STALE_MS
  return false
}
