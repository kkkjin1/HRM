// 운동장 ⚔ 1:1 대결 — 순수 로직(🤺 졸라맨 펜싱 · 🏸 배드민턴).
// 대결은 신청한 쪽(host) PC가 시뮬레이션하고, 상대(guest)는 입력만 보내고 host가 보내 주는 상태를 그린다.
// CPU 상대는 host PC 안에서 cpuInput()이 입력을 만든다. 화면은 components/playground/DuelArena.tsx.

export type DuelGame = 'fencing' | 'badminton'
export type DSide = 'L' | 'R'
export type DuelInput = { dir: -1 | 0 | 1; act: boolean } // act = 이번 프레임에 Space를 새로 눌렀는지(찌르기·휘두르기)

export const DUEL_GAMES: Record<DuelGame, { name: string; emoji: string; win: number; help: string }> = {
  fencing: { name: '졸라맨 펜싱', emoji: '🤺', win: 5, help: 'Space 찌르기 · 상대쪽+Space 돌진(멀리, 빈틈 큼) · 뒤쪽+Space 막기(성공하면 상대 굳음) · 붙어서 밀어 끝선 밖으로 내보내면 득점 · 5점 먼저' },
  badminton: { name: '배드민턴', emoji: '🏸', win: 7, help: 'Space 받아치기(높을 때 치면 스매시) · 상대쪽+Space 드롭(네트 앞) · 뒤쪽+Space 클리어(멀리) · 받아칠 때마다 기 +1, 5칸 차면 상대쪽+Space = ⚡번개 스매시 · 7점 먼저' },
}

export const COURT_L = 200
export const COURT_R = 880
export const NET_X = 540

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
const other = (s: DSide): DSide => (s === 'L' ? 'R' : 'L')
const facingOf = (s: DSide) => (s === 'L' ? 1 : -1)

// ── 🤺 펜싱 ──────────────────────────────────────────────────────
// 기술 3가지(←→ + Space 조합):
//   Space만      = 찌르기  — 빠르고 짧다(빈틈 작음)
//   상대 쪽 + Space = 돌진  — 몸까지 앞으로 날아가며 멀리 찌른다(빈틈 큼)
//   뒤쪽 + Space   = 막기   — 잠깐 막는 자세. 그 사이 상대 칼끝이 닿으면 튕겨내고 상대는 STUN_MS 동안 굳는다(반격 기회)
// 칼끝이 상대 몸(중심에서 BODY_HALF 앞)에 닿으면 득점 후보 → DOUBLE_MS 안에 상대도 닿으면 무효.
// 몸으로 밀기: 상대 쪽으로 계속 걸어가면 상대를 밀어낸다 — 자기 끝선(COURT_L/R) 밖으로 밀려나면 실점(장외).
export const F_SPEED = 130 // 보고 반응할 여유가 있게 전체 동작을 약 25% 느리게
export const PUSH_SPEED = 70 // 밀려날 때 속도
export const ARM = 14
export const BODY_HALF = 10
export const F_MIN_GAP = 30
export const DOUBLE_MS = 80
export const POINT_PAUSE_MS = 1300
export const STUN_MS = 700
export type Move = 'thrust' | 'fleche' | 'parry'
// dur = 동작 시간, from~to = 칼끝이 유효한 구간(막기는 막는 구간), reach = 칼끝이 뻗는 거리, dash = 몸이 앞으로 나가는 거리, recover = 끝난 뒤 빈틈
export const MOVES: Record<Move, { dur: number; from: number; to: number; reach: number; dash: number; recover: number }> = {
  thrust: { dur: 215, from: 80, to: 215, reach: 48, dash: 0, recover: 370 },
  fleche: { dur: 380, from: 140, to: 380, reach: 70, dash: 46, recover: 800 },
  parry: { dur: 330, from: 0, to: 290, reach: 0, dash: 0, recover: 300 },
}

export type Fencer = { x: number; move: Move | null; t: number; stun: number } // t = 동작 시작 후 경과 ms
export type FencingState = {
  game: 'fencing'; t: number; L: Fencer; R: Fencer; score: { L: number; R: number }
  pending: { side: DSide; at: number } | null; pause: number; last: string | null; winner: DSide | null; spark: number
}
const freshFencer = (x: number): Fencer => ({ x, move: null, t: 0, stun: 0 })
export function newFencing(): FencingState {
  return { game: 'fencing', t: 0, L: freshFencer(400), R: freshFencer(680), score: { L: 0, R: 0 }, pending: null, pause: 0, last: null, winner: null, spark: 0 }
}
// 칼끝이 뻗은 정도(찌르기·돌진 중에만)
export function lungeReach(f: Fencer) {
  if (!f.move || f.move === 'parry') return 0
  const m = MOVES[f.move]
  return f.t > m.dur ? 0 : m.reach * Math.sin((f.t / m.dur) * Math.PI)
}
export const tipX = (f: Fencer, side: DSide) => f.x + facingOf(side) * (ARM + lungeReach(f))
export const isParrying = (f: Fencer) => f.move === 'parry' && f.t >= MOVES.parry.from && f.t <= MOVES.parry.to
const busy = (f: Fencer) => f.stun > 0 || (!!f.move && f.t < MOVES[f.move].dur + MOVES[f.move].recover)

export function fencingStep(s0: FencingState, inp: { L: DuelInput; R: DuelInput }, dtMs: number): FencingState {
  if (s0.winner) return s0
  const s: FencingState = { ...s0, t: s0.t + dtMs, L: { ...s0.L }, R: { ...s0.R }, score: { ...s0.score }, spark: Math.max(0, s0.spark - dtMs) }
  if (s.pause > 0) {
    s.pause -= dtMs
    if (s.pause <= 0) { s.L = freshFencer(400); s.R = freshFencer(680); s.pending = null }
    return s
  }
  const win = (w: DSide, why: string) => {
    s.score[w]++
    s.last = `${w}:${why}`
    s.pending = null
    s.pause = POINT_PAUSE_MS
    if (s.score[w] >= DUEL_GAMES.fencing.win) s.winner = w
  }
  for (const side of ['L', 'R'] as DSide[]) {
    const f = s[side]
    const i = inp[side]
    const fwd = facingOf(side)
    if (f.stun > 0) { f.stun = Math.max(0, f.stun - dtMs); continue }
    if (f.move) {
      const m = MOVES[f.move]
      const before = f.t
      f.t += dtMs
      // 돌진: 동작 앞부분 동안 몸이 앞으로 나간다
      if (m.dash && before < m.dur * 0.6) f.x += fwd * m.dash * (Math.min(f.t, m.dur * 0.6) - before) / (m.dur * 0.6)
      if (f.t >= m.dur + m.recover) { f.move = null; f.t = 0 }
    }
    if (!busy(f)) {
      if (i.act) { f.move = i.dir === fwd ? 'fleche' : i.dir === -fwd ? 'parry' : 'thrust'; f.t = 0 }
      else f.x += i.dir * F_SPEED * (dtMs / 1000)
    }
  }
  // 몸 겹침 = 밀기: 서로 붙으면 앞으로 걷고 있는 쪽이 상대를 민다
  if (s.R.x - s.L.x < F_MIN_GAP) {
    const pushL = inp.L.dir === 1 && !busy(s.L), pushR = inp.R.dir === -1 && !busy(s.R)
    const mid = (s.L.x + s.R.x) / 2
    if (pushL && !pushR) { s.L.x = Math.min(s.L.x, s.R.x - F_MIN_GAP + 1); s.R.x = s.L.x + F_MIN_GAP; s.R.x += PUSH_SPEED * (dtMs / 1000) }
    else if (pushR && !pushL) { s.R.x = Math.max(s.R.x, s.L.x + F_MIN_GAP - 1); s.L.x = s.R.x - F_MIN_GAP; s.L.x -= PUSH_SPEED * (dtMs / 1000) }
    else { s.L.x = mid - F_MIN_GAP / 2; s.R.x = mid + F_MIN_GAP / 2 }
  }
  // 장외 — 자기 끝선 밖으로 나가면 실점
  if (s.L.x < COURT_L) { win('R', 'out'); return s }
  if (s.R.x > COURT_R) { win('L', 'out'); return s }
  // 칼끝이 상대 몸에 닿았나
  const touches = (side: DSide) => {
    const f = s[side], o = s[other(side)]
    if (!f.move || f.move === 'parry') return false
    const m = MOVES[f.move]
    if (f.t < m.from || f.t > m.to) return false
    return facingOf(side) * (tipX(f, side) - (o.x - facingOf(side) * BODY_HALF)) >= 0
  }
  for (const side of ['L', 'R'] as DSide[]) {
    if (!touches(side)) continue
    const o = s[other(side)]
    if (isParrying(o)) {
      // 막기 성공: 튕겨내고 공격한 쪽은 굳는다, 막은 쪽은 바로 움직일 수 있다
      const f = s[side]
      f.move = null; f.t = 0; f.stun = STUN_MS
      o.move = null; o.t = 0
      s.spark = 400
      s.last = `${other(side)}:parry`
      continue
    }
    if (!s.pending) s.pending = { side, at: s.t }
    else if (s.pending.side !== side && s.t - s.pending.at <= DOUBLE_MS) { s.pending = null; s.pause = POINT_PAUSE_MS; s.last = '⚔ 동시 찌르기 — 무효'; return s }
  }
  if (s.pending && s.t - s.pending.at > DOUBLE_MS) win(s.pending.side, s[s.pending.side].move === 'fleche' ? 'fleche' : 'touch')
  return s
}

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
// mem = CPU별로 들고 다니는 작은 기억(반응 지연·이번 공 칠지 여부)
// opStart = 지금 보고 있는 상대 동작의 시작 시각, react = 그 동작을 알아채기까지 걸리는 ms(사람처럼 반응 지연)
export type CpuMem = { next: number; decided: number; willHit: boolean; opStart: number; react: number }
export const newCpuMem = (): CpuMem => ({ next: 0, decided: -1, willHit: true, opStart: -1, react: 250 })

export function cpuInput(state: FencingState | BadmintonState, side: DSide, mem: CpuMem, rand: () => number): DuelInput {
  if (state.game === 'fencing') {
    const me = state[side], op = state[other(side)]
    if (busy(me) || state.pause > 0) return { dir: 0, act: false }
    const d = Math.abs(op.x - me.x)
    const toward = (side === 'L' ? 1 : -1) as 1 | -1
    const back = (-toward) as -1 | 1
    const myEdge = side === 'L' ? me.x - COURT_L : COURT_R - me.x
    // 상대가 찌르거나 돌진해 오면(0.11~0.23초 늦게 알아챔): 막기 45% / 물러나기 30%
    if (op.move && op.move !== 'parry') {
      const start = Math.round(state.t - op.t)
      if (start !== mem.opStart) { mem.opStart = start; mem.react = 110 + rand() * 120 }
    }
    if (op.move && op.move !== 'parry' && op.t >= mem.react && op.t < MOVES[op.move].to && d < 120 && state.t >= mem.next) {
      mem.next = state.t + 200
      const r = rand()
      if (r < 0.45) return { dir: back, act: true }
      if (r < 0.75 && myEdge > 40) return { dir: back, act: false }
    }
    // 상대가 굳었으면(막기 성공) 바로 찌르기
    if (op.stun > 0 && d < 75) return { dir: 0, act: true }
    // 끝선에 몰리면 밀고 나간다
    if (myEdge < 50) return { dir: toward, act: false }
    // 상대가 이미 공격 중이면(알아챘든 아니든) 맞찌르기는 가끔만 — 동시 찌르기 무효가 너무 잦지 않게
    const opAttacking = !!op.move && op.move !== 'parry' && op.t < MOVES[op.move].dur
    if (state.t >= mem.next && (!opAttacking || rand() < 0.15)) {
      if (d <= 66 && rand() < 0.5) { mem.next = state.t + 300 + rand() * 500; return { dir: 0, act: true } }
      if (d > 80 && d < 120 && rand() < 0.18) { mem.next = state.t + 600 + rand() * 600; return { dir: toward, act: true } }
    }
    if (d > 110) return { dir: toward, act: false }
    if (d < 40) return { dir: rand() < 0.6 ? toward : back, act: false } // 붙으면 밀기 싸움
    return { dir: rand() < 0.5 ? toward : rand() < 0.5 ? back : 0, act: false }
  }
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

export type DuelState = FencingState | BadmintonState
export const newDuelState = (game: DuelGame, seed = 7): DuelState => (game === 'fencing' ? newFencing() : newBadminton(seed))
export const duelStep = (s: DuelState, inp: { L: DuelInput; R: DuelInput }, dtMs: number): DuelState =>
  s.game === 'fencing' ? fencingStep(s, inp, dtMs) : badmintonStep(s, inp, dtMs)
