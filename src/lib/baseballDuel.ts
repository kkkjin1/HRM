// 비거리 야구 1:1 실시간 대결 — 순수 로직(초·말 진행, 연장, 끝내기, 투수 제구).
// 저장은 baseball_duels 1행. halves[h] = h번째 반 이닝의 투구 이벤트(짝수 = 초: 도전자가 던지고 상대가 침,
// 홀수 = 말: 상대가 던지고 도전자가 침). 반 이닝 하나는 솔로 게임과 같은 3아웃 규칙(simulateGame)으로 진행한다.
// 1회 동점 → 2회 연장 1번 → 그래도 같으면 안타 수 → 그것도 같으면 토너먼트는 가위바위보, 친선전은 무승부.

import { LINEUP, OUTS_PER_INNING, PITCH_TYPES, STRIKES_FOR_OUT, lineupBatter, simulateGame, type LineupBatter, type Pitch, type PitchType, type Slot, type Swing } from '@/lib/baseball'

export const MAX_EXTRA_INNINGS = 1
export const DUEL_INVITE_TTL_MS = 3 * 60 * 1000   // 신청 후 3분 지나면 만료
export const DUEL_STALE_MS = 10 * 60 * 1000       // 10분간 움직임 없는 대결은 목록에서 숨김
export const BATTER_TIMEOUT_MS = 15 * 1000        // 공을 던졌는데 타자 화면이 15초 응답 없으면 투수가 대신 판정

export type DuelStatus = 'invited' | 'playing' | 'rps' | 'done' | 'declined' | 'canceled'

export type RpsChoice = 'rock' | 'paper' | 'scissors'
export const RPS_LABEL: Record<RpsChoice, string> = { rock: '✊ 바위', paper: '✋ 보', scissors: '✌️ 가위' }
// c = 도전자, o = 상대의 이번 판 선택. 비기면 round+1로 다시, last에 직전 판을 남겨 둘 다 보여준다.
export type RpsState = { c: RpsChoice | null; o: RpsChoice | null; round: number; last?: { c: RpsChoice; o: RpsChoice } }

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
  rps?: RpsState | null
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
// 투수가 고르는 좌우 코스 — 키는 투수 시점(화면 왼쪽 → 오른쪽), value는 저장값 Pitch.side(포수 시점 기준이라 부호가 반대)
export type SideChoice = 'farL' | 'left' | 'mid' | 'right' | 'farR'
export const SIDES: Record<SideChoice, { value: number; ball: boolean }> = {
  farL:  { value: 1.5, ball: true },
  left:  { value: 0.75, ball: false },
  mid:   { value: 0, ball: false },
  right: { value: -0.75, ball: false },
  farR:  { value: -1.5, ball: true },
}
// 투수 시점에서 왼쪽 = 1루 쪽. 우타자는 3루 쪽(투수 시점 오른쪽)에 서므로 오른쪽이 몸쪽.
export function sideLabel(k: SideChoice, batsLeft: boolean) {
  if (k === 'mid') return '가운데'
  const towardBatter = (k === 'right' || k === 'farR') !== batsLeft
  return `${towardBatter ? '몸쪽' : '바깥쪽'}${SIDES[k].ball ? ' 볼' : ''}`
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

// 한쪽(도전자 = 홀수 반 이닝)의 안타 수(홈런 포함)
function sideHits(halves: Swing[][], odd: boolean) {
  let hits = 0
  halves.forEach((ev, h) => {
    if ((h % 2 === 1) !== odd) return
    const st = simulateGame(ev)
    hits += st.hits + st.homeruns
  })
  return hits
}

// 이벤트 하나를 현재 반 이닝에 붙이고 다음 상태(반 이닝 교대·연장·종료·승자)를 계산한다.
// mustWin: 토너먼트처럼 무승부가 없어야 하면 true (연장 후에도 같으면 안타 수 → 가위바위보)
// rps는 가위바위보로 넘어갈 때만 결과에 넣는다(평소 이벤트 저장엔 rps 컬럼을 건드리지 않게).
export function applyDuelEvent(
  d: Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'>,
  ev: Swing,
  opts: { mustWin?: boolean } = {},
): Pick<Duel, 'halves' | 'pitch' | 'challenger_runs' | 'opponent_runs' | 'status' | 'winner_id'> & { rps?: RpsState } {
  const halves = d.halves.length ? d.halves.map(x => [...x]) : [[]]
  const h = halves.length - 1
  halves[h].push(ev)
  let status: DuelStatus = 'playing'
  let winner: string | null = null
  let rps: RpsState | undefined
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
        const c = sideHits(halves, true)
        const o = sideHits(halves, false)
        if (c !== o) finishWith(c > o ? d.challenger_id : d.opponent_id)
        else if (opts.mustWin) { status = 'rps'; rps = { c: null, o: null, round: 1 } }
        else finishWith(null)
      }
    }
  }
  const fin = score()
  const out = { halves, pitch: null, challenger_runs: fin.challenger, opponent_runs: fin.opponent, status, winner_id: winner }
  return rps ? { ...out, rps } : out
}

// 투수의 선택(구종·높이·구속) + 제구 게이지 오차(err: 0 = 정중앙, 1 = 끝) → 실제로 날아가는 공.
// 가운데 초록 구간이면 고른 대로, 벗어나면 높이·구속이 랜덤(존 밖으로 빠지거나 한가운데 실투가 될 수 있음), 심하면 사구.
export function makeDuelPitch(type: PitchType, height: HeightChoice, speed: SpeedChoice, err: number, rand: () => number = Math.random, side: SideChoice = 'mid'): Pitch {
  const e = Math.max(0, Math.min(1, err))
  const def = PITCH_TYPES[type]
  const slot: Slot = def.slot
  const windup = Math.round(600 + rand() * 900)
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`
  let h: number
  let v: number
  let sd: number
  if (e <= PERFECT_ERR) {
    h = HEIGHTS[height].value + (rand() - 0.5) * 0.1
    v = def.min + (def.max - def.min) * SPEEDS[speed].ratio
    sd = SIDES[side].value + (rand() - 0.5) * 0.1
  } else {
    h = (rand() * 2 - 1) * 1.7
    v = def.min + rand() * (def.max - def.min)
    sd = (rand() * 2 - 1) * 1.7
  }
  const actual: PitchType = e > 0.9 && rand() < 0.4 ? 'hbp' : type
  return { id, type: actual, speed: Math.round(v), alt: h < 0 ? -1 : 1, slot, windup, height: Math.round(h * 100) / 100, side: Math.round(sd * 100) / 100 }
}

// 제구 게이지: 0→1→0 왕복하는 막대. 멈춘 위치의 정중앙(0.5) 대비 오차를 0~1로.
// 왕복 주기는 고른 구속에 따라 — 빠른 공일수록 막대도 빨라서 제구가 어렵다.
export const GAUGE_PERIOD_MS = 700
export const GAUGE_PERIODS: Record<SpeedChoice, number> = { slow: 1100, normal: GAUGE_PERIOD_MS, fast: 450 }
export function gaugePos(elapsed: number, period: number = GAUGE_PERIOD_MS) {
  const ph = (elapsed % period) / period
  return ph < 0.5 ? ph * 2 : 2 - ph * 2
}
export function gaugeError(pos: number) {
  return Math.min(1, Math.abs(pos - 0.5) * 2)
}

// 막대 멈춘 결과 표시(완벽!/좋음/빗나감) — 실제 효과는 PERFECT_ERR 안(고른 대로)/밖(랜덤) 두 가지뿐이고,
// '완벽'은 좋음 구간 한가운데를 맞힌 손맛 표시용이다(효과는 좋음과 같음). 필살마구 초정밀 구간은 이 아래에 한 단계 더 둘 자리.
export const GAUGE_PERFECT_SHOW_ERR = 0.08
export type GaugeGrade = 'PERFECT' | 'GOOD' | 'MISS'
export function gaugeGrade(err: number): GaugeGrade {
  return err <= GAUGE_PERFECT_SHOW_ERR ? 'PERFECT' : err <= PERFECT_ERR ? 'GOOD' : 'MISS'
}

const BEATS: Record<RpsChoice, RpsChoice> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }

// 가위바위보 한쪽 선택 반영 → 둘 다 냈으면 판정(비기면 다시)
export function playRps(
  d: Pick<Duel, 'challenger_id' | 'opponent_id'> & { rps?: RpsState | null },
  side: 'c' | 'o',
  choice: RpsChoice,
): { rps: RpsState; status: DuelStatus; winner_id: string | null } {
  const cur: RpsState = d.rps ?? { c: null, o: null, round: 1 }
  const next: RpsState = { ...cur, [side]: choice }
  if (!next.c || !next.o) return { rps: next, status: 'rps', winner_id: null }
  if (next.c === next.o) return { rps: { c: null, o: null, round: cur.round + 1, last: { c: next.c, o: next.o } }, status: 'rps', winner_id: null }
  const w = BEATS[next.c] === next.o ? d.challenger_id : d.opponent_id
  return { rps: { ...next, last: { c: next.c, o: next.o } }, status: 'done', winner_id: w }
}

export function isFreshDuel(d: Pick<Duel, 'status' | 'created_at' | 'updated_at'>, nowMs: number) {
  if (d.status === 'invited') return nowMs - new Date(d.created_at).getTime() < DUEL_INVITE_TTL_MS
  if (d.status === 'playing' || d.status === 'rps') return nowMs - new Date(d.updated_at).getTime() < DUEL_STALE_MS
  return false
}

// ── 타순 3명 — 정의는 baseball.ts(개인전·대결 공용). 예전 이름 유지 ──
export const DUEL_LINEUP = LINEUP
export type DuelBatter = LineupBatter
export const duelBatterAt = lineupBatter

// ── 상황 연출 (표시 전용, 결과에 영향 없음) — 실제 대결 규칙(simulateGame·applyDuelEvent)으로만 판단한다 ──
export type DuelMoment = 'LAST_OUT' | 'WALKOFF_CHANCE' | 'FIRST_HIT' | 'FIRST_RUN' | 'TIE' | 'LEAD_CHANGE'
export const MOMENT_LABEL: Record<DuelMoment, string> = {
  LAST_OUT: 'LAST OUT', WALKOFF_CHANCE: '끝내기 찬스', FIRST_HIT: '첫 안타!', FIRST_RUN: '첫 득점!', TIE: '동점!', LEAD_CHANGE: '역전!',
}

function gameHits(halves: Swing[][]) {
  return halves.reduce((n, ev) => { const st = simulateGame(ev); return n + st.hits + st.homeruns }, 0)
}

// 이벤트 하나 전후(halves)로 생긴 순간 — 결과가 공개될 때 보여준다. 우선순위: 역전 > 동점 > 첫 득점 > 첫 안타
export function duelEventMoment(before: Swing[][], after: Swing[][]): DuelMoment | null {
  const sb = duelScore(before)
  const sa = duelScore(after)
  const lead = (s: { challenger: number; opponent: number }) => Math.sign(s.challenger - s.opponent)
  if (sa.challenger + sa.opponent > sb.challenger + sb.opponent) {
    if (lead(sb) !== 0 && lead(sa) === -lead(sb)) return 'LEAD_CHANGE'
    if (lead(sb) !== 0 && lead(sa) === 0) return 'TIE'
    if (sb.challenger + sb.opponent === 0) return 'FIRST_RUN'
  }
  if (gameHits(before) === 0 && gameHits(after) > 0) return 'FIRST_HIT'
  return null
}

// 판정용 가상 이벤트 — 규칙 함수에 넣어 "이 다음에 무슨 일이 생기면 경기가 끝나는지"만 본다(저장하지 않음)
const PROBE_LOOKING: Swing = { type: 'fastball', speed: 140, outcome: 'looking', distance: 0, offset: null }
const PROBE_HOMER: Swing = { type: 'fastball', speed: 140, outcome: 'perfect', distance: 130, offset: 0 }

// 다음 타석 시작 시점의 상황 — 끝내기 찬스(말 공격, 홈런 한 방이면 바로 승리) > LAST OUT(아웃 하나면 경기 끝)
export function duelSituation(d: Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'>, opts: { mustWin?: boolean } = {}): DuelMoment | null {
  const halves = d.halves.length ? d.halves : [[]]
  const base = { ...d, halves }
  if ((halves.length - 1) % 2 === 1) {
    const r = applyDuelEvent(base, PROBE_HOMER, opts)
    if (r.status === 'done' && r.winner_id === d.challenger_id) return 'WALKOFF_CHANCE'
  }
  const st = simulateGame(halves[halves.length - 1])
  if (st.finished || st.outs !== OUTS_PER_INNING - 1) return null
  let cur = base
  for (let i = st.strikes; i < STRIKES_FOR_OUT; i++) {
    const r = applyDuelEvent(cur, PROBE_LOOKING, opts)
    if (r.status !== 'playing') return 'LAST_OUT'
    if (r.halves.length !== cur.halves.length) return null // 공수 교대·연장으로 이어짐
    cur = { ...cur, halves: r.halves }
  }
  return null
}
