// 운동장 🏸 배드민턴(중계 시점 · 1:1 / 2:2) — 순수 로직. 화면은 components/playground/BadmintonArena.tsx.
// 좌표(미터, 실제 복식 코트 크기): x = 코트 폭 방향(-3.05~3.05), y = 길이 방향(-6.7~6.7), 네트 = y 0, h = 높이.
// 팀 A는 y<0 쪽, 팀 B는 y>0 쪽. 화면은 "내 팀이 항상 아래쪽"이 되게 뒤집어 그린다(B는 180° 돌림).
// 그래서 입력도 팀 기준으로 받는다: fwd +1 = 네트(상대) 쪽, side +1 = 내 화면 오른쪽.
//   → 월드 방향 = fwdOf(team) 를 곱하면 된다(A: +1, B: -1). 상대 쪽 y 방향과 내 오른쪽 x 방향이 같은 부호.
// 대결은 방장(host) PC가 시뮬레이션하고, 나머지는 입력만 보낸다(1:1 대결과 같음).

export type BTeam = 'A' | 'B'
export type BInput = { fwd: -1 | 0 | 1; side: -1 | 0 | 1; act: boolean } // act = 이번 프레임에 Space를 새로 눌렀는지
export const IDLE: BInput = { fwd: 0, side: 0, act: false }

export const COURT_HW = 3.05 // 코트 반폭
export const COURT_HL = 6.7 // 코트 반길이(네트~끝선)
export const NET_H = 1.55
export const PLAY_HW = 3.6 // 선수가 다닐 수 있는 범위(코트 밖 조금까지)
export const PLAY_HL = 7.4
export const NET_GAP = 0.35 // 네트에 이만큼까지 붙을 수 있다
export const P_SPEED = 4.4 // m/s
export const G = 12 // 중력을 키우고 비행 시간을 늘려 기본적으로 더 높이 뜨게(템포는 비슷하게)
export const HIT_R = 1.15 // 라켓이 닿는 가로 거리(바닥 기준)
export const HIT_LOW = 0.25
export const HIT_HIGH = 2.9
// 받아치기 = Space 하나. 라켓은 SWING_MS 동안 뒤 → 위 → 앞으로 돈다(phase 0 → 0.5 → 1).
// 그 도중 셔틀콕이 닿은 순간의 라켓 각도로 샷이 정해진다:
//   일찍 맞음(라켓이 뒤, phase 0) = 높고 멀리 · 늦게 맞음(라켓이 앞, phase 1) = 짧게 네트 앞
//   정타(라켓이 위를 향할 때 ±SWEET_PHASE + 몸 가까이 SWEET_R + 머리 위 SWEET_LOW 이상) = 스매시(팀 기 꽉 차 있으면 ⚡)
//   라켓 가장자리로 맞으면 좌우가 흔들린다(아웃 날 수 있음)
export const SWING_MS = 240
export const SWING_COOLDOWN = 460
export const SWEET_PHASE = 0.12
export const SWEET_R = 0.45
export const SWEET_LOW = 1.4
export const SERVE_AUTO_MS = 2500
export const POINT_PAUSE_MS = 1300
export const METER_MAX = 5 // 팀 기가 이만큼 차면 ⚡ 번개 스매시
export const SPECIAL_T = 0.42
export const SPECIAL_HIT_R = 0.6 // 번개 스매시는 받을 수 있는 범위가 좁다
export const SPECIAL_HIT_HIGH = 1.8
export const MATE_GAP = 0.8 // 같은 팀끼리 이보다 가까워지면 서로 밀어낸다
export const WIN = 7
// ── 랠리를 다양하게(조작은 그대로 — 방향키 + Space) ──
export const DRAG = 1.1 // 공기저항(1/s) — 빨리 나갔다가 뚝 떨어지는 셔틀콕 궤적
export const NET_ZONE = 2.0 // 네트에서 이만큼 안이면 '네트 앞'
export const KILL_H = 1.7 // 네트 앞에서 이보다 높은 공 = 자동 내리꽂기
export const HAIRPIN_H = 1.15 // 네트 앞에서 이보다 낮은 공 = 자동 살짝 넘기기
export const CHANCE_R = 0.85 // 찬스볼 밑에 이만큼 가까이 있으면 스매시 자리
export const CHANCE_PHASE = 0.4 // 찬스볼 스매시 타이밍 폭(라켓 위 ±0.4 ≈ 0.19초)
export const PR_MAX = 3 // 밀림
export const PR_LIFT = 2 // 밀림이 이 이상이면 높이 띄워 버티기만(= 상대 찬스볼)
export const RUN_FAR = 2.8 // 상대가 친 뒤 이만큼 넘게 뛰어 받으면 밀림 +1
export const SPEEDUP_FROM = 5 // 랠리 타구가 이보다 많아지면 조금씩 빨라진다
export const SPEEDUP_STEP = 0.06
export const SPEEDUP_MAX = 1.45
// ── 💥 스매시 원(2026-11-10 사용자 요청: "스매시가 너무 어렵다 → 떨어질수록 작아지는 원, 정해진 크기에 맞춰 누르면 스매시") ──
// 높이 뜬 공이 내 코트로 내려와 SMASH_H(머리 위 타점)를 지나는 순간이 '스매시 순간'. 그 RING_LEAD초 전부터 셔틀콕에 원이 생겨
// 점점 작아지고, 스매시 순간에 고정 원(과녁) 크기와 딱 겹친다. 그때(±RING_OK초) Space를 누르면 스매시.
// 단, 타점 근처(SMASH_REACH 안)에 서 있어야 한다. 찬스볼은 허용 폭이 넓다. 예전의 '라켓 각도 정타' 스매시는 없앴다(너무 어려움).
export const SMASH_H = 2.2
export const RING_LEAD = 0.9
export const RING_OK = 0.1
export const RING_OK_CHANCE = 0.17
export const SMASH_REACH = 1.0

export const BM_HELP = '방향키 이동 · Space 받아치기(일찍 = 멀리, 늦게 = 짧게) · 높은 공이 오면 원이 줄어들어요 — 과녁 원과 겹칠 때 Space = 💥 스매시(공 밑에 서 있기) · 네트 앞 높은 공 = 내리꽂기 · 세게 온 공·멀리 뛰어 받으면 밀려서 공이 뜬다(찬스볼) · 기 5칸 찬 뒤 스매시 = ⚡ · ←→ 누르며 치면 그쪽으로 · 7점 먼저'

export const fwdOf =(t: BTeam) => (t === 'A' ? 1 : -1)
export const otherTeam = (t: BTeam): BTeam => (t === 'A' ? 'B' : 'A')
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// swing = 휘두른 뒤 경과 ms(-1 = 안 휘두름) · pr = 밀림(0~PR_MAX) · run = 상대가 친 뒤 뛴 거리(m)
// arm = 이번 스윙을 스매시 원이 맞을 때 시작했나(그 스윙으로 맞히면 스매시)
export type BmPlayer = { team: BTeam; x: number; y: number; swing: number; pr: number; run: number; arm?: boolean }
// chance = 밀려서 띄운 공(받는 쪽 찬스볼)
export type Shuttle = { x: number; y: number; h: number; vx: number; vy: number; vh: number; special: boolean; chance?: boolean }
export type BmShot = 'normal' | 'smash' | 'special' | 'drop' | 'clear' | 'kill' | 'hairpin' | 'lift'
// 마지막 사건: 샷이면 team = 친 팀, 득점이면 team = 득점 팀. by = 친 사람 index(-1 = 없음)
export type BmEvent = { team: BTeam; kind: BmShot | 'net' | 'out' | 'floor'; by: number }
export type BmState = {
  game: 'badminton2'; t: number; size: 1 | 2; players: BmPlayer[]; sh: Shuttle
  score: { A: number; B: number }; meter: { A: number; B: number }
  server: BTeam; srv: number // 서브하는 팀 / 서브하는 사람 index
  serving: number; lastHit: number // -1 = 서브 대기
  hits: number // 이번 판 타구 수(CPU가 "새 공"을 알아보는 용도)
  rally: number // 이번 랠리 타구 수(길어지면 빨라진다)
  hitAt: number // 마지막 타구 시각(t) — 화면에서 '멀리/짧게' 꼬리표 잠깐 보여 주기
  pause: number; last: BmEvent | null; winner: BTeam | null; seed: number
}

// 선수 순서: [A0, (A1), B0, (B1)]
export const teamIdx = (s: { size: 1 | 2 }, team: BTeam) => (team === 'A' ? [0, 1] : [s.size, s.size + 1]).slice(0, s.size)

// 기본 자리 — 1:1은 가운데, 2:2는 좌우 나란히
export function homeOf(size: 1 | 2, team: BTeam, k: number) {
  const f = fwdOf(team)
  const x = size === 1 ? 0 : (k === 0 ? -1.4 : 1.4) * f // 팀 기준 왼쪽이 0번
  return { x, y: -f * 3.4 }
}

function rnd(s: BmState) {
  s.seed = (s.seed * 1103515245 + 12345) % 2147483648
  return s.seed / 2147483648
}

function serveSpot(s: BmState): Shuttle {
  const p = s.players[s.srv]
  const f = fwdOf(p.team)
  return { x: p.x + f * 0.25, y: p.y + f * 0.45, h: 1.0, vx: 0, vy: 0, vh: 0, special: false, chance: false }
}

function resetRally(s: BmState) {
  s.players = s.players.map((p, i) => {
    const k = teamIdx(s, p.team).indexOf(i)
    return { ...p, ...homeOf(s.size, p.team, k), swing: -1, pr: 0, run: 0, arm: false }
  })
  s.rally = 0
  // 서브는 팀 안에서 점수에 따라 번갈아(짝수/홀수 점수 = 0번/1번)
  const mates = teamIdx(s, s.server)
  s.srv = mates[s.score[s.server] % mates.length]
  const sp = s.players[s.srv]
  sp.y = -fwdOf(sp.team) * 2.5 // 서브 라인 근처로 나와서 서브
  s.serving = 0
  s.lastHit = -1
  s.sh = serveSpot(s)
}

export function newBadminton2(size: 1 | 2, seed = 7): BmState {
  const players: BmPlayer[] = []
  for (const team of ['A', 'B'] as BTeam[]) for (let k = 0; k < size; k++) players.push({ team, ...homeOf(size, team, k), swing: -1, pr: 0, run: 0 })
  const s: BmState = {
    game: 'badminton2', t: 0, size, players, sh: { x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, special: false },
    score: { A: 0, B: 0 }, meter: { A: 0, B: 0 }, server: 'A', srv: 0, serving: 0, lastHit: -1, hits: 0, rally: 0, hitAt: -1,
    pause: 0, last: null, winner: null, seed,
  }
  resetRally(s)
  return s
}

// ── 비행(선형 공기저항 — 정확한 식이라 방장·참가자 PC가 같은 궤적을 계산한다) ──
const decay = (t: number) => (1 - Math.exp(-DRAG * t)) / DRAG // t초 동안 처음 속도 1로 간 거리
const TERM = G / DRAG
// 지금부터 t초 뒤 셔틀콕 위치
export function shAt(sh: Shuttle, t: number) {
  const e = decay(t)
  return { x: sh.x + sh.vx * e, y: sh.y + sh.vy * e, h: sh.h + (sh.vh + TERM) * e - TERM * t }
}
function flyStep(sh: Shuttle, dt: number) {
  const p = shAt(sh, dt), k = Math.exp(-DRAG * dt)
  sh.x = p.x; sh.y = p.y; sh.h = p.h
  sh.vx *= k; sh.vy *= k; sh.vh = (sh.vh + TERM) * k - TERM
}

// 셔틀콕을 (tx, ty)에 T초 뒤 떨어지게 — 네트(y 0)를 못 넘으면 더 높고 느리게
export function launch(sh: Shuttle, tx: number, ty: number, T: number): Shuttle {
  const v = (T: number) => { const e = decay(T); return { vx: (tx - sh.x) / e, vy: (ty - sh.y) / e, vh: (TERM * T - sh.h) / e - TERM } }
  let o = v(T)
  for (let i = 0; i < 20; i++) {
    const r = (-sh.y / o.vy) * DRAG // 네트까지 걸리는 시간: 1 - e^(-Dt) = r
    if (!(r > 0 && r < 1)) break
    const tn = -Math.log(1 - r) / DRAG
    if (shAt({ ...sh, ...o }, tn).h > NET_H + 0.2) break
    T *= 1.12
    o = v(T)
  }
  return { ...sh, ...o, special: false, chance: false }
}

// 지금부터 0.35초 동안 셔틀콕(바닥 위 투영)이 (px, py)에 가장 가까이 오는 거리
export function passDist(sh: Shuttle, px: number, py: number) {
  let best = Math.hypot(sh.x - px, sh.y - py)
  for (let t = 0.01; t <= 0.35; t += 0.01) {
    const q = shAt(sh, t)
    if (q.h < HIT_LOW) break
    best = Math.min(best, Math.hypot(q.x - px, q.y - py))
  }
  return best
}

// 랠리가 길어질수록 빨라지는 배수
export const rallySpeed = (rally: number) => Math.min(SPEEDUP_MAX, 1 + SPEEDUP_STEP * Math.max(0, rally - SPEEDUP_FROM))

// 💥 스매시 원 — i번 선수 기준. null = 이 공엔 원이 없음(내 쪽으로 안 옴·낮은 공·세게 온 공·네트 앞·밀림 상태)
//   tau = 스매시 순간까지 남은 초(지나면 음수), x·y = 그 순간 셔틀콕 바닥 위치, near = 타점 근처에 서 있나,
//   win = 허용 폭(초), ok = 지금 누르면 스매시
export type SmashRing = { tau: number; x: number; y: number; near: boolean; win: number; ok: boolean }
export function smashRing(s: BmState, i: number): SmashRing | null {
  const p = s.players[i]
  if (!p || s.lastHit === -1 || s.pause > 0 || s.winner || s.players[s.lastHit].team === p.team) return null
  const sh = s.sh
  const k = s.last?.kind
  if (sh.special || k === 'smash' || k === 'kill' || k === 'hairpin' || (p.pr ?? 0) >= PR_LIFT) return null
  let tau: number | null = null
  let x = sh.x, y = sh.y
  if (sh.h <= SMASH_H) {
    // 이미 지나왔다 — 떨어지는 중이면 지난 시간을 대충(음수), 올라가는 중이면 원 없음
    if (sh.vh >= 0) return null
    tau = -(SMASH_H - sh.h) / -sh.vh
    if (tau < -0.3) return null
  } else {
    for (let t = 0.01; t <= 3; t += 0.01) {
      const q = shAt(sh, t)
      if (q.h <= SMASH_H) { tau = t; x = q.x; y = q.y; break }
    }
    if (tau === null || tau > RING_LEAD) return null
  }
  if (y * fwdOf(p.team) > 0 || Math.abs(y) < NET_ZONE) return null // 상대 코트이거나 네트 앞(= 자동 내리꽂기)
  const near = Math.hypot(x - p.x, y - p.y) <= SMASH_REACH
  const win = sh.chance ? RING_OK_CHANCE : RING_OK
  return { tau, x, y, near, win, ok: near && Math.abs(tau) <= win }
}

// 화면용: i번 선수가 지금 휘두르면 스매시/내리꽂기가 나가는 자리인가(라켓을 빛나게)
export function smashReady(s: BmState, i: number): 'smash' | 'kill' | null {
  const p = s.players[i]
  if (s.lastHit === -1 || s.pause > 0 || s.winner || s.players[s.lastHit].team === p.team) return null
  const d = passDist(s.sh, p.x, p.y)
  if (Math.abs(p.y) < NET_ZONE && s.sh.h >= KILL_H && d <= HIT_R) return 'kill'
  if (smashRing(s, i)?.ok) return 'smash'
  return null
}

// 셔틀콕을 친다 — 서 있는 자리·공 높이·밀림·라켓 각도(swing phase)로 샷이 정해진다. serve = 서브(중간 깊이로 높게)
//   밀림 2 이상 = 높이 띄워 버팀(상대 찬스볼) · 네트 앞 높은 공 = 내리꽂기 · 찬스볼 밑에서 라켓 위 = 스매시
//   네트 앞 낮은 공 = 살짝 넘기기 · 나머지는 라켓 각도대로(일찍 = 멀리, 늦게 = 짧게)
function hitBy(s: BmState, i: number, inp: BInput, serve = false) {
  const p = s.players[i]
  const f = fwdOf(p.team)
  const inc = s.sh
  const incKind = serve ? null : s.last?.kind
  const phase = serve ? 0.35 : clamp(p.swing / SWING_MS, 0, 1)
  // 몸 가까이 = 셔틀콕이 내 자리를 가장 가까이 지나가는 거리(자리를 잘 잡았나). 맞는 순간은 늘 범위 가장자리라 그걸론 못 잰다
  const d = serve ? 0 : passDist(inc, p.x, p.y)
  const reach = inc.special ? SPECIAL_HIT_R : HIT_R
  const off = clamp(d / reach, 0, 1) // 0 = 라켓 한가운데, 1 = 가장자리
  // 밀림: 세게 온 공(스매시·내리꽂기)을 받거나 멀리 뛰어 받으면 쌓이고, 편하게 받으면 풀린다
  if (!serve) {
    const push = (inc.special || incKind === 'smash' || incKind === 'kill' ? 2 : 0) + ((p.run ?? 0) > RUN_FAR ? 1 : 0)
    p.pr = push > 0 ? Math.min(PR_MAX, (p.pr ?? 0) + push) : Math.max(0, (p.pr ?? 0) - 1)
  }
  const sp = rallySpeed(s.rally ?? 0)
  // 스매시 = 스매시 원이 과녁과 겹칠 때 시작한 스윙(arm)으로 맞힘. 예전의 라켓 각도 정타(SWEET_*)·찬스볼 각도 판정은 2026-11-10 대체
  const ringSmash = !serve && !!p.arm
  p.arm = false
  const atNet = !serve && Math.abs(p.y) < NET_ZONE
  // 좌우: ←→ 누른 쪽 사이드라인 근처, 안 누르면 아무 데나. 빗맞을수록·밀릴수록 흔들린다
  const wob = off * off + (p.pr ?? 0) * 0.25
  const aimX = (k = 1) => ((inp.side !== 0 ? f * inp.side * (1.5 + rnd(s) * 1.0) : (rnd(s) * 2 - 1) * 2.2) + (rnd(s) * 2 - 1) * wob) * k
  const depth = (lo: number, hi: number) => f * (lo + rnd(s) * (hi - lo)) // 네트에서 lo~hi 떨어진 상대 코트
  const full = s.meter[p.team] >= METER_MAX
  let kind: BmShot
  if (!serve && p.pr >= PR_LIFT) {
    // 밀려서 높이 띄워 버티기 — 상대에겐 찬스볼. 시간을 벌어 밀림이 한 칸 풀린다
    s.sh = { ...launch(inc, aimX(0.7), depth(3.0, 5.4), 2.15 / sp), chance: true }
    p.pr -= 1
    kind = 'lift'
  } else if ((atNet && inc.h >= KILL_H) || ringSmash) {
    const kill = atNet && inc.h >= KILL_H
    if (full) {
      s.sh = { ...launch(inc, aimX(), kill ? depth(2.0, 4.6) : depth(4.8, 6.3), SPECIAL_T), special: true }
      s.meter[p.team] = 0
      kind = 'special'
    } else if (kill) { s.sh = launch(inc, aimX(0.9), depth(1.8, 4.2), 0.42); kind = 'kill' }
    else { s.sh = launch(inc, aimX(), depth(2.2, 5.8), 0.62 / Math.sqrt(sp)); kind = 'smash' }
  } else if (atNet && inc.h < HAIRPIN_H) {
    s.sh = launch(inc, aimX(0.6), depth(0.5, 1.3), 1.0 / sp)
    kind = 'hairpin'
  } else {
    // 라켓 각도 → 깊이·높이: phase 0(뒤) 6.0m 높게 ~ phase 1(앞) 1.4m 낮게
    const c = 6.0 - 4.6 * phase
    const dep = clamp(c + (rnd(s) * 2 - 1) * 0.5, 0.6, 6.4)
    s.sh = launch(inc, aimX(), f * dep, (1.9 - 0.85 * phase) / sp)
    kind = serve ? 'normal' : phase < 0.34 ? 'clear' : phase > 0.66 ? 'drop' : 'normal'
  }
  if (kind !== 'special') s.meter[p.team] = Math.min(METER_MAX, s.meter[p.team] + 1)
  // 받는 쪽은 지금부터 뛴 거리를 잰다
  for (const j of teamIdx(s, otherTeam(p.team))) s.players[j].run = 0
  p.run = 0
  s.lastHit = i
  s.hits++
  s.rally = (s.rally ?? 0) + 1
  s.hitAt = s.t
  s.last = { team: p.team, kind, by: i }
}

function point(s: BmState, w: BTeam, kind: 'net' | 'out' | 'floor', by: number) {
  s.score[w]++
  s.last = { team: w, kind, by }
  s.pause = POINT_PAUSE_MS
  s.server = w
  if (s.score[w] >= WIN) s.winner = w
}

// 셔틀콕이 내려오며 높이 h를 지날 때의 바닥 위치(받을 자리 미리 잡기용)
export function landingPoint(sh: Shuttle, h = 0) {
  if (sh.h <= h && sh.vh <= 0) return { x: sh.x, y: sh.y, t: 0 }
  let prev = sh.h
  for (let t = 0.01; t <= 8; t += 0.01) {
    const q = shAt(sh, t)
    const falling = (sh.vh + TERM) * Math.exp(-DRAG * t) - TERM < 0
    if (falling && q.h <= h) {
      const tt = Math.max(0, t - 0.01 * ((h - q.h) / Math.max(1e-6, prev - q.h))) // 한 칸 안에서 맞춤
      const r = shAt(sh, tt)
      return { x: r.x, y: r.y, t: tt }
    }
    prev = q.h
  }
  return { x: sh.x, y: sh.y, t: 0 }
}

// opts.remote[i] = 이 선수의 타구는 이 PC가 판정하지 않는다(다른 PC가 판정해 'hit'로 알려 준다) — 휘두르는 모습만 움직인다.
// opts.autoServe = false 면 서브 시간 초과 자동 서브를 안 한다(참가자 PC의 예측 계산용 — 자동 서브는 방장만).
export type StepOpts = { remote?: boolean[]; autoServe?: boolean }
export function badminton2Step(s0: BmState, inputs: BInput[], dtMs: number, opts: StepOpts = {}): BmState {
  if (s0.winner) return s0
  const s: BmState = {
    ...s0, t: s0.t + dtMs, players: s0.players.map(p => ({ ...p })), sh: { ...s0.sh },
    score: { ...s0.score }, meter: { ...s0.meter },
  }
  const dt = dtMs / 1000
  if (s.pause > 0) {
    s.pause -= dtMs
    if (s.pause <= 0) resetRally(s)
    return s
  }
  const waiting = s.lastHit === -1
  // 이동·휘두르기
  s.players.forEach((p, i) => {
    const inp = inputs[i] ?? IDLE
    if (p.swing >= 0) { p.swing += dtMs; if (p.swing >= SWING_COOLDOWN) { p.swing = -1; p.arm = false } }
    if (inp.act && p.swing < 0) { p.swing = 0; p.arm = !waiting && !!smashRing(s, i)?.ok }
    if (waiting && i === s.srv) return // 서브하는 사람은 서브 전엔 제자리
    const f = fwdOf(p.team)
    let vx = inp.side * f, vy = inp.fwd * f
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2 }
    const ox = p.x, oy = p.y
    p.x = clamp(p.x + vx * P_SPEED * dt, -PLAY_HW, PLAY_HW)
    p.y = p.team === 'A' ? clamp(p.y + vy * P_SPEED * dt, -PLAY_HL, -NET_GAP) : clamp(p.y + vy * P_SPEED * dt, NET_GAP, PLAY_HL)
    p.run = (p.run ?? 0) + Math.hypot(p.x - ox, p.y - oy)
  })
  // 같은 팀끼리 겹치지 않게 밀어내기
  if (s.size === 2) {
    for (const team of ['A', 'B'] as BTeam[]) {
      const [a, b] = teamIdx(s, team).map(i => s.players[i])
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < MATE_GAP) {
        const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0
        const push = (MATE_GAP - d) / 2
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push
      }
    }
  }
  // 서브 대기: Space(또는 시간 초과)로 서브
  if (waiting) {
    s.sh = serveSpot(s)
    s.serving += dtMs
    const sv = s.players[s.srv]
    if ((!opts.remote?.[s.srv] && sv.swing >= 0 && sv.swing <= SWING_MS) || (opts.autoServe !== false && s.serving >= SERVE_AUTO_MS)) hitBy(s, s.srv, inputs[s.srv] ?? IDLE, true)
    return s
  }
  // 비행
  const prevY = s.sh.y
  flyStep(s.sh, dt)
  const hitTeam = s.players[s.lastHit].team
  // 네트에 걸림
  if (prevY * s.sh.y <= 0 && prevY !== s.sh.y && s.sh.h < NET_H) { point(s, otherTeam(hitTeam), 'net', s.lastHit); return s }
  // 받아치기 — 받는 팀 중 휘두르는 중이고 범위 안인 사람, 여럿이면 가장 가까운 사람
  const recv = otherTeam(hitTeam)
  const onRecvSide = s.sh.y * fwdOf(recv) < 0
  if (onRecvSide) {
    const reach = s.sh.special ? SPECIAL_HIT_R : HIT_R, high = s.sh.special ? SPECIAL_HIT_HIGH : HIT_HIGH
    let best = -1, bestD = Infinity
    for (const i of teamIdx(s, recv)) {
      const p = s.players[i]
      if (opts.remote?.[i] || p.swing < 0 || p.swing > SWING_MS) continue
      const d = Math.hypot(s.sh.x - p.x, s.sh.y - p.y)
      if (d <= reach && s.sh.h >= HIT_LOW && s.sh.h <= high && d < bestD) { best = i; bestD = d }
    }
    if (best >= 0) { hitBy(s, best, inputs[best] ?? IDLE); return s }
  }
  // 바닥
  if (s.sh.h <= 0) {
    if (Math.abs(s.sh.x) > COURT_HW || Math.abs(s.sh.y) > COURT_HL) point(s, otherTeam(hitTeam), 'out', s.lastHit)
    else point(s, s.sh.y < 0 ? 'B' : 'A', 'floor', s.lastHit)
  }
  return s
}

// 다른 PC가 판정한 타구를 방장 상태에 반영 — 받을 차례가 맞을 때만(중복·늦은 메시지 무시)
export type BmHit = { idx: number; hits: number; sh: Shuttle; meter: number; kind: BmShot; pr?: number }
export function applyHit(s0: BmState, h: BmHit): BmState | null {
  const p = s0.players[h.idx]
  if (!p || s0.winner || s0.pause > 0 || h.hits !== s0.hits + 1) return null
  const ok = s0.lastHit === -1 ? s0.srv === h.idx : s0.players[s0.lastHit].team !== p.team
  if (!ok) return null
  return {
    ...s0, sh: { ...h.sh }, lastHit: h.idx, hits: h.hits, rally: (s0.rally ?? 0) + 1, hitAt: s0.t,
    meter: { ...s0.meter, [p.team]: h.meter }, last: { team: p.team, kind: h.kind, by: h.idx },
    players: s0.players.map((q, i) => {
      if (i === h.idx) return { ...q, swing: q.swing < 0 ? SWING_MS / 2 : q.swing, pr: h.pr ?? q.pr, run: 0 }
      return q.team !== p.team ? { ...q, run: 0 } : q
    }),
  }
}

// ── CPU ──────────────────────────────────────────────────────────
// decided = 마지막으로 판단한 타구 번호, willHit = 이번 공을 받을지, reactAt = 이 시각 전엔 새 공에 반응 안 함(사람처럼 지연)
// plan = 이번 공을 라켓의 어느 순간(phase)에 맞힐지 — 그만큼 미리 휘두른다. jitter = 사람처럼 타이밍 오차(ms)
// smash = 이번 공을 스매시 원으로 노릴지, smashJit = 원 타이밍 오차(초 — 허용 폭보다 크면 놓쳐서 그냥 넘김)
export type BmCpuMem = { decided: number; willHit: boolean; reactAt: number; serveAt: number; plan: number; jitter: number; smash?: boolean; smashJit?: number }
export const newBmCpuMem = (): BmCpuMem => ({ decided: -1, willHit: true, reactAt: 0, serveAt: -1, plan: 0.5, jitter: 0, smash: false, smashJit: 0 })

// 지금 자리에 서 있으면 셔틀콕이 몇 ms 뒤 라켓 범위에 들어오나(0.5초 안, 없으면 null)
function entryMs(sh: Shuttle, px: number, py: number, reach: number, high: number) {
  for (let t = 0; t <= 0.5; t += 0.01) {
    const q = shAt(sh, t)
    if (q.h < HIT_LOW) return null
    if (q.h <= high && Math.hypot(q.x - px, q.y - py) <= reach - 0.1) return t * 1000
  }
  return null
}

const sgn = (v: number, dead: number) => (Math.abs(v) < dead ? 0 : v > 0 ? 1 : -1) as -1 | 0 | 1

export function bmCpuInput(s: BmState, i: number, mem: BmCpuMem, rand: () => number): BInput {
  if (s.pause > 0 || s.winner) return IDLE
  const me = s.players[i]
  const f = fwdOf(me.team)
  const mates = teamIdx(s, me.team)
  const k = mates.indexOf(i)
  const go = (tx: number, ty: number): BInput => ({ fwd: sgn((ty - me.y) * f, 0.12), side: sgn((tx - me.x) * f, 0.12), act: false })
  const home = homeOf(s.size, me.team, k)
  // 서브 대기
  if (s.lastHit === -1) {
    if (s.srv !== i) return go(home.x, home.y)
    if (mem.serveAt < 0) mem.serveAt = s.t + 700 + rand() * 600
    if (s.t < mem.serveAt) return IDLE
    mem.serveAt = -1
    return { fwd: rand() < 0.3 ? 1 : rand() < 0.4 ? -1 : 0, side: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1, act: true }
  }
  mem.serveAt = -1
  const coming = s.players[s.lastHit].team !== me.team
  if (!coming) return go(home.x, home.y)
  const opps = teamIdx(s, otherTeam(me.team)).map(j => s.players[j])
  if (mem.decided !== s.hits) {
    mem.decided = s.hits
    // 놓칠 확률은 상황에 따라 — 세게 온 공·멀리 뛰어야 하는 공·밀린 상태일수록 높다(그냥 운으로 놓치지 않게)
    const lp0 = landingPoint(s.sh, 1.0)
    const need = Math.hypot(lp0.x - me.x, lp0.y - me.y) / Math.max(0.2, lp0.t * P_SPEED) // 1 넘으면 제때 못 감
    const k = s.last?.kind
    const miss = s.sh.special ? 0.65
      : 0.04 + (k === 'kill' ? 0.4 : k === 'smash' ? 0.18 : 0) + (me.pr ?? 0) * 0.05 + (need > 0.85 ? 0.25 : need > 0.6 ? 0.08 : 0)
    mem.willHit = rand() >= miss
    mem.reactAt = s.t + 120 + rand() * 140
    // 어느 순간에 맞힐지(= 깊이) — 찬스볼이면 스매시, 아니면 상대가 비운 쪽으로(앞에 있으면 멀리, 뒤에 있으면 짧게). 가끔은 아무렇게나
    const oppNet = Math.min(...opps.map(o => Math.abs(o.y)))
    const r = rand()
    mem.plan = s.sh.chance && r < 0.85 ? 0.5
      : r < 0.7 ? (oppNet < 2.8 ? 0.06 + rand() * 0.2 : oppNet > 4.2 ? 0.74 + rand() * 0.22 : 0.15 + rand() * 0.85)
        : r < 0.82 ? 0.5 : 0.15 + rand() * 0.85
    mem.jitter = (rand() * 2 - 1) * 35
    // 💥 스매시 원 노리기 — 찬스볼이면 자주, 아니면 가끔. 타이밍 오차가 허용 폭을 넘으면 그냥 넘긴다(사람처럼 실수)
    const sp = landingPoint(s.sh, SMASH_H)
    const smashable = sp.t > 0 && sp.y * f < 0 && Math.abs(sp.y) >= NET_ZONE && !s.sh.special && k !== 'smash' && k !== 'kill' && k !== 'hairpin'
    mem.smash = mem.willHit && smashable && rand() < (s.sh.chance ? 0.8 : 0.3)
    mem.smashJit = (rand() * 2 - 1) * 0.13
  }
  if (s.t < mem.reactAt) return IDLE
  // 받을 자리(높이 1m로 내려올 곳) — 2:2면 더 가까운 사람이 가고, 다른 사람은 빈 곳을 메운다
  const lp = landingPoint(s.sh, 1.0)
  const tx = clamp(lp.x, -COURT_HW, COURT_HW)
  const ty = me.team === 'A' ? clamp(lp.y, -COURT_HL, -NET_GAP) : clamp(lp.y, NET_GAP, COURT_HL)
  const chaser = mates.reduce((a, b) => (Math.hypot(s.players[a].x - tx, s.players[a].y - ty) <= Math.hypot(s.players[b].x - tx, s.players[b].y - ty) ? a : b))
  if (chaser !== i) return go(-tx * 0.5, -f * 3.4)
  if (mem.smash && me.swing < 0) {
    const rg = smashRing(s, i)
    if (!rg || rg.tau > -rg.win) {
      // 타점(공이 SMASH_H로 내려올 곳)으로 가서, 원이 과녁에 닿을 즈음 휘두른다
      const sp = rg ?? (() => { const q = landingPoint(s.sh, SMASH_H); return { x: q.x, y: q.y, tau: q.t, near: false } })()
      const mv = go(clamp(sp.x, -COURT_HW, COURT_HW), sp.y)
      if (rg && rg.near && rg.tau <= (mem.smashJit ?? 0)) { mem.smash = false; return { ...mv, act: true } }
      return mv
    }
    mem.smash = false // 놓쳤다 — 평소처럼 받기
  }
  const mv = go(tx, ty)
  const reach = s.sh.special ? SPECIAL_HIT_R : HIT_R, high = s.sh.special ? SPECIAL_HIT_HIGH : HIT_HIGH
  if (!(mem.willHit && me.swing < 0)) return mv
  const ms = entryMs(s.sh, me.x, me.y, reach, high)
  if (ms === null || ms > mem.plan * SWING_MS + mem.jitter) return mv
  // 좌우: 상대가 서 있는 반대쪽(75%), 가끔은 아무 데나
  const ox = opps.reduce((a, o) => a + o.x, 0) / opps.length
  const side = (rand() < 0.75 && Math.abs(ox) > 0.4 ? -Math.sign(ox) * f : Math.floor(rand() * 3) - 1) as -1 | 0 | 1
  return { ...mv, side, act: true }
}
