// 운동장 ⚔ 1:1 대결 — 순수 로직(🏸 배드민턴). 🤺 펜싱은 2026-11-18 사용자 결정으로 삭제.
// 대결은 신청한 쪽(host) PC가 시뮬레이션하고, 상대(guest)는 입력만 보내고 host가 보내 주는 상태를 그린다.
// CPU 상대는 host PC 안에서 cpuInput()이 입력을 만든다. 화면은 components/playground/DuelArena.tsx.

export type DuelGame = 'badminton'
export type DSide = 'L' | 'R'
export type DuelInput = { dir: -1 | 0 | 1; act: boolean } // act = 이번 프레임에 Space를 새로 눌렀는지(찌르기·휘두르기)

export const isDuelGame = (g: unknown): g is DuelGame => g === 'badminton'

export const DUEL_GAMES: Record<DuelGame, { name: string; emoji: string; win: number; help: string }> = {
  badminton: { name: '배드민턴', emoji: '🏸', win: 7, help: 'Space 받아치기(높을 때 치면 스매시) · 상대쪽+Space 드롭(네트 앞) · 뒤쪽+Space 클리어(멀리) · 받아칠 때마다 기 +1, 5칸 차면 상대쪽+Space = ⚡번개 스매시 · 7점 먼저' },
}

export const COURT_L = 200
export const COURT_R = 880
export const NET_X = 540

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
const other = (s: DSide): DSide => (s === 'L' ? 'R' : 'L')
const facingOf = (s: DSide) => (s === 'L' ? 1 : -1)

export const POINT_PAUSE_MS = 1300

// ── 🏸 배드민턴 ─────────────────────────────────────────────────
// 셔틀콕: 포물선(중력 SH_G). 내 쪽으로 오는 셔틀콕이 라켓 범위(가로 HIT_X, 높이 HIT_LOW~HIT_HIGH)에 있을 때
// Space를 누르면(SWING_MS 동안 유효) 상대 코트 아무 데로 넘긴다. 높을 때(SMASH_H 이상) 치면 빠르고 낮은 스매시.
// 셔틀콕이 바닥에 닿으면 떨어진 코트 쪽 실점, 코트 밖이면 마지막에 친 쪽 실점, 네트에 걸리면 친 쪽 실점.
export const B_SPEED = 220
export const SH_G = 520
export const NET_H = 58
export const HIT_X = 40
export const HIT_LOW = 8
export const HIT_HIGH = 110
export const SMASH_H = 80
export const SWING_MS = 200
export const SWING_COOLDOWN = 420
export const SERVE_AUTO_MS = 2500
export const METER_MAX = 5 // 기가 이만큼 차면 필살구
export const SPECIAL_T = 0.42 // ⚡ 번개 스매시 비행 시간(초)
export const SPECIAL_HIT_X = 22 // 번개 스매시는 받을 수 있는 범위가 좁다
export const SPECIAL_HIT_HIGH = 70

export type Shuttle = { x: number; h: number; vx: number; vh: number; special?: boolean }
export type Player = { x: number; swing: number } // swing = 휘두른 뒤 경과 ms(-1 = 안 휘두름)
export type BadmintonState = {
  game: 'badminton'; t: number; L: Player; R: Player; sh: Shuttle; score: { L: number; R: number }; meter: { L: number; R: number }
  server: DSide; serving: number; lastHit: DSide | null; pause: number; last: string | null; winner: DSide | null; seed: number
}
const HOME = { L: 340, R: 740 }

function rnd(s: BadmintonState) {
  s.seed = (s.seed * 1103515245 + 12345) % 2147483648
  return s.seed / 2147483648
}
function serveSpot(s: BadmintonState): Shuttle {
  const p = s[s.server]
  return { x: p.x + facingOf(s.server) * 12, h: 62, vx: 0, vh: 0, special: false }
}
export function newBadminton(seed = 7): BadmintonState {
  const s: BadmintonState = {
    game: 'badminton', t: 0, L: { x: HOME.L, swing: -1 }, R: { x: HOME.R, swing: -1 }, sh: { x: 0, h: 0, vx: 0, vh: 0 },
    score: { L: 0, R: 0 }, meter: { L: 0, R: 0 }, server: 'L', serving: 0, lastHit: null, pause: 0, last: null, winner: null, seed,
  }
  s.sh = serveSpot(s)
  return s
}

// 셔틀콕을 side 쪽에서 상대 코트 tx로 보내는 속도 — 비행 시간 T, 네트를 못 넘으면 더 높게
function launch(sh: Shuttle, tx: number, T: number): Shuttle {
  let vx = (tx - sh.x) / T
  let vh = (0 - sh.h + 0.5 * SH_G * T * T) / T
  for (let i = 0; i < 20; i++) {
    const tn = (NET_X - sh.x) / vx
    const hn = sh.h + vh * tn - 0.5 * SH_G * tn * tn
    if (tn <= 0 || hn > NET_H + 8) break
    T *= 1.12
    vx = (tx - sh.x) / T
    vh = (0 - sh.h + 0.5 * SH_G * T * T) / T
  }
  return { ...sh, vx, vh, special: false }
}

// dir = 칠 때 누르고 있던 방향(상대 쪽 / 뒤쪽 / 없음) → 샷 종류
function hitBy(s: BadmintonState, side: DSide, smash: boolean, dir: -1 | 0 | 1 = 0) {
  const opp = other(side)
  const toward = dir === facingOf(side), away = dir === -facingOf(side)
  const near = (lo: number, hi: number) => (opp === 'L' ? NET_X - hi + rnd(s) * (hi - lo) : NET_X + lo + rnd(s) * (hi - lo)) // 네트에서 lo~hi 떨어진 곳
  if (s.meter[side] >= METER_MAX && toward) {
    // ⚡ 번개 스매시: 아주 빠르고 낮게, 상대 코트 깊숙이
    s.sh = { ...launch(s.sh, near(200, 300), SPECIAL_T), special: true }
    s.meter[side] = 0
    s.lastHit = side
    s.last = `${side}:special`
    return
  }
  if (smash) s.sh = launch(s.sh, near(60, 300), 0.75)
  else if (toward) s.sh = launch(s.sh, near(36, 90), 0.85) // 드롭: 네트 바로 앞
  else if (away) s.sh = launch(s.sh, near(240, 320), 1.5) // 클리어: 높고 멀리
  else s.sh = launch(s.sh, near(40, 300), 1.05 + rnd(s) * 0.35)
  s.meter[side] = Math.min(METER_MAX, s.meter[side] + 1)
  s.lastHit = side
  s.last = smash ? `${side}:smash` : null
}

function point(s: BadmintonState, w: DSide, why: string) {
  s.score[w]++
  s.last = `${w}:${why}`
  s.pause = POINT_PAUSE_MS
  s.server = w
  if (s.score[w] >= DUEL_GAMES.badminton.win) s.winner = w
}

export function badmintonStep(s0: BadmintonState, inp: { L: DuelInput; R: DuelInput }, dtMs: number): BadmintonState {
  if (s0.winner) return s0
  const s: BadmintonState = { ...s0, t: s0.t + dtMs, L: { ...s0.L }, R: { ...s0.R }, sh: { ...s0.sh }, score: { ...s0.score }, meter: { ...s0.meter } }
  const dt = dtMs / 1000
  if (s.pause > 0) {
    s.pause -= dtMs
    if (s.pause <= 0) { s.L = { x: HOME.L, swing: -1 }; s.R = { x: HOME.R, swing: -1 }; s.serving = 0; s.lastHit = null; s.sh = serveSpot(s) }
    return s
  }
  for (const side of ['L', 'R'] as DSide[]) {
    const p = s[side], i = inp[side]
    if (p.swing >= 0) { p.swing += dtMs; if (p.swing >= SWING_COOLDOWN) p.swing = -1 }
    if (i.act && p.swing < 0) p.swing = 0
    p.x += i.dir * B_SPEED * dt
    p.x = side === 'L' ? clamp(p.x, COURT_L, NET_X - 16) : clamp(p.x, NET_X + 16, COURT_R)
  }
  // 서브 대기: 서버 손 위에 붙어 있다가 Space(또는 시간 초과)로 서브
  if (s.lastHit === null) {
    s.sh = serveSpot(s)
    s.serving += dtMs
    const sv = s[s.server]
    if ((sv.swing >= 0 && sv.swing <= SWING_MS) || s.serving >= SERVE_AUTO_MS) hitBy(s, s.server, false, inp[s.server].dir)
    return s
  }
  // 비행
  s.sh.x += s.sh.vx * dt
  s.sh.vh -= SH_G * dt
  s.sh.h += s.sh.vh * dt
  // 네트에 걸림
  const prevX = s0.sh.x
  if ((prevX - NET_X) * (s.sh.x - NET_X) <= 0 && s.sh.h < NET_H) { point(s, other(s.lastHit), 'net'); return s }
  // 받아치기 — 내 코트 쪽에 있고, 상대가 친 셔틀콕일 때
  for (const side of ['L', 'R'] as DSide[]) {
    const p = s[side]
    const mine = side === 'L' ? s.sh.x < NET_X : s.sh.x > NET_X
    if (!mine || s.lastHit === side || p.swing < 0 || p.swing > SWING_MS) continue
    const reach = s.sh.special ? SPECIAL_HIT_X : HIT_X, high = s.sh.special ? SPECIAL_HIT_HIGH : HIT_HIGH
    if (Math.abs(s.sh.x - p.x) <= reach && s.sh.h >= HIT_LOW && s.sh.h <= high) hitBy(s, side, s.sh.h >= SMASH_H, inp[side].dir)
  }
  // 바닥
  if (s.sh.h <= 0) {
    const x = s.sh.x
    const lastHit = s.lastHit
    if (x < COURT_L || x > COURT_R) point(s, other(lastHit), 'out')
    else point(s, x < NET_X ? 'R' : 'L', 'floor')
  }
  return s
}

// 셔틀콕이 높이 h까지 내려왔을 때의 x(내 쪽으로 올 때 미리 자리 잡기용)
export function landingX(sh: Shuttle, h = 30) {
  const a = -0.5 * SH_G, b = sh.vh, c = sh.h - h
  const disc = b * b - 4 * a * c
  if (disc < 0) return sh.x
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return sh.x + sh.vx * Math.max(0, t)
}

// ── CPU ──────────────────────────────────────────────────────────
// mem = CPU별로 들고 다니는 작은 기억(이번 공 칠지 여부)
export type CpuMem = { decided: number; willHit: boolean }
export const newCpuMem = (): CpuMem => ({ decided: -1, willHit: true })

export function cpuInput(state: BadmintonState, side: DSide, mem: CpuMem, rand: () => number): DuelInput {
  const s = state
  const me = s[side]
  if (s.pause > 0) return { dir: 0, act: false }
  if (s.lastHit === null) return { dir: 0, act: s.server === side && s.serving > 700 + rand() * 600 }
  const coming = s.lastHit !== side
  const target = coming ? landingX(s.sh, 45) : HOME[side]
  const lo = side === 'L' ? COURT_L : NET_X + 16, hi = side === 'L' ? NET_X - 16 : COURT_R
  const tx = clamp(target, lo, hi)
  const dir = (Math.abs(tx - me.x) < 8 ? 0 : tx > me.x ? 1 : -1) as -1 | 0 | 1
  // 이번 공을 칠지 한 번 정한다(88%)
  const shotId = Math.round(s.sh.vx * 10)
  if (coming && mem.decided !== shotId) { mem.decided = shotId; mem.willHit = rand() < (s.sh.special ? 0.35 : 0.88) }
  const reach = s.sh.special ? SPECIAL_HIT_X : HIT_X, high = s.sh.special ? SPECIAL_HIT_HIGH : HIT_HIGH
  const inZone = Math.abs(s.sh.x - me.x) <= reach - 6 && s.sh.h >= HIT_LOW + 6 && s.sh.h <= high - 10
  const act = coming && mem.willHit && inZone && me.swing < 0
  if (!act) return { dir, act }
  // 칠 때 샷 고르기: 기가 차 있으면 70% 필살구, 아니면 드롭 25% / 클리어 25% / 보통
  const toward = (side === 'L' ? 1 : -1) as 1 | -1
  const r = rand()
  const shot = s.meter[side] >= METER_MAX && r < 0.7 ? toward : r < 0.25 ? toward : r < 0.5 ? (-toward as -1 | 1) : 0
  return { dir: shot, act }
}

export type DuelState = BadmintonState
export const newDuelState = (_game: DuelGame, seed = 7): DuelState => newBadminton(seed)
export const duelStep = (s: DuelState, inp: { L: DuelInput; R: DuelInput }, dtMs: number): DuelState => badmintonStep(s, inp, dtMs)
