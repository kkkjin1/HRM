// 운동장 🏸 배드민턴(중계 시점 · 1:1 / 2:2) — 순수 로직. 화면은 STEP 2에서 붙인다.
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

export const BM_HELP = '방향키 이동 · Space 받아치기 — 라켓이 뒤에 있을 때 맞으면 높고 멀리, 앞으로 넘어간 뒤 맞으면 짧게 · 라켓이 위를 향한 순간 몸 가까이 머리 위에서 맞으면 정타 = 스매시 · 팀 기 5칸 찬 뒤 정타 = ⚡번개 스매시 · ←→ 누르며 치면 그쪽으로 · 7점 먼저'

export const fwdOf =(t: BTeam) => (t === 'A' ? 1 : -1)
export const otherTeam = (t: BTeam): BTeam => (t === 'A' ? 'B' : 'A')
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export type BmPlayer = { team: BTeam; x: number; y: number; swing: number } // swing = 휘두른 뒤 경과 ms(-1 = 안 휘두름)
export type Shuttle = { x: number; y: number; h: number; vx: number; vy: number; vh: number; special: boolean }
export type BmShot = 'normal' | 'smash' | 'special' | 'drop' | 'clear'
// 마지막 사건: 샷이면 team = 친 팀, 득점이면 team = 득점 팀. by = 친 사람 index(-1 = 없음)
export type BmEvent = { team: BTeam; kind: BmShot | 'net' | 'out' | 'floor'; by: number }
export type BmState = {
  game: 'badminton2'; t: number; size: 1 | 2; players: BmPlayer[]; sh: Shuttle
  score: { A: number; B: number }; meter: { A: number; B: number }
  server: BTeam; srv: number // 서브하는 팀 / 서브하는 사람 index
  serving: number; lastHit: number // -1 = 서브 대기
  hits: number // 이번 판 타구 수(CPU가 "새 공"을 알아보는 용도)
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
  return { x: p.x + f * 0.25, y: p.y + f * 0.45, h: 1.0, vx: 0, vy: 0, vh: 0, special: false }
}

function resetRally(s: BmState) {
  s.players = s.players.map((p, i) => {
    const k = teamIdx(s, p.team).indexOf(i)
    return { ...p, ...homeOf(s.size, p.team, k), swing: -1 }
  })
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
  for (const team of ['A', 'B'] as BTeam[]) for (let k = 0; k < size; k++) players.push({ team, ...homeOf(size, team, k), swing: -1 })
  const s: BmState = {
    game: 'badminton2', t: 0, size, players, sh: { x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, special: false },
    score: { A: 0, B: 0 }, meter: { A: 0, B: 0 }, server: 'A', srv: 0, serving: 0, lastHit: -1, hits: 0, hitAt: -1,
    pause: 0, last: null, winner: null, seed,
  }
  resetRally(s)
  return s
}

// 셔틀콕을 (tx, ty)에 T초 뒤 떨어지게 — 네트(y 0)를 못 넘으면 더 높고 느리게
export function launch(sh: Shuttle, tx: number, ty: number, T: number): Shuttle {
  const v = (T: number) => ({ vx: (tx - sh.x) / T, vy: (ty - sh.y) / T, vh: (0 - sh.h + 0.5 * G * T * T) / T })
  let o = v(T)
  for (let i = 0; i < 20; i++) {
    const tn = -sh.y / o.vy
    const hn = sh.h + o.vh * tn - 0.5 * G * tn * tn
    if (tn <= 0 || hn > NET_H + 0.2) break
    T *= 1.12
    o = v(T)
  }
  return { ...sh, ...o, special: false }
}

// 지금부터 0.35초 동안 셔틀콕(바닥 위 투영)이 (px, py)에 가장 가까이 오는 거리
export function passDist(sh: Shuttle, px: number, py: number) {
  let best = Math.hypot(sh.x - px, sh.y - py)
  for (let t = 0.01; t <= 0.35; t += 0.01) {
    if (sh.h + sh.vh * t - 0.5 * G * t * t < HIT_LOW) break
    best = Math.min(best, Math.hypot(sh.x + sh.vx * t - px, sh.y + sh.vy * t - py))
  }
  return best
}

// 셔틀콕을 친다 — 그 순간의 라켓 각도(swing phase)·맞은 자리로 샷이 정해진다. serve = 서브(중간 깊이로 높게)
function hitBy(s: BmState, i: number, inp: BInput, serve = false) {
  const p = s.players[i]
  const f = fwdOf(p.team)
  const phase = serve ? 0.35 : clamp(p.swing / SWING_MS, 0, 1)
  // 몸 가까이 = 셔틀콕이 내 자리를 가장 가까이 지나가는 거리(자리를 잘 잡았나). 맞는 순간은 늘 범위 가장자리라 그걸론 못 잰다
  const d = serve ? 0 : passDist(s.sh, p.x, p.y)
  const reach = s.sh.special ? SPECIAL_HIT_R : HIT_R
  const off = clamp(d / reach, 0, 1) // 0 = 라켓 한가운데, 1 = 가장자리
  const sweet = !serve && Math.abs(phase - 0.5) <= SWEET_PHASE && d <= SWEET_R && s.sh.h >= SWEET_LOW
  // 좌우: ←→ 누른 쪽 사이드라인 근처, 안 누르면 아무 데나. 빗맞을수록 흔들린다
  const aimX = () => (inp.side !== 0 ? f * inp.side * (1.5 + rnd(s) * 1.0) : (rnd(s) * 2 - 1) * 2.2) + (rnd(s) * 2 - 1) * off * off
  const depth = (lo: number, hi: number) => f * (lo + rnd(s) * (hi - lo)) // 네트에서 lo~hi 떨어진 상대 코트
  let kind: BmShot
  if (sweet && s.meter[p.team] >= METER_MAX) {
    s.sh = { ...launch(s.sh, aimX(), depth(4.8, 6.3), SPECIAL_T), special: true }
    s.meter[p.team] = 0
    kind = 'special'
  } else {
    if (sweet) { s.sh = launch(s.sh, aimX(), depth(2.2, 5.8), 0.62); kind = 'smash' }
    else {
      // 라켓 각도 → 깊이·높이: phase 0(뒤) 6.0m 높게 ~ phase 1(앞) 1.4m 낮게
      const c = 6.0 - 4.6 * phase
      const dep = clamp(c + (rnd(s) * 2 - 1) * 0.5, 0.6, 6.4)
      s.sh = launch(s.sh, aimX(), f * dep, 1.8 - 0.75 * phase)
      kind = serve ? 'normal' : phase < 0.34 ? 'clear' : phase > 0.66 ? 'drop' : 'normal'
    }
    s.meter[p.team] = Math.min(METER_MAX, s.meter[p.team] + 1)
  }
  s.lastHit = i
  s.hits++
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

// 셔틀콕이 높이 h까지 내려왔을 때의 바닥 위치(받을 자리 미리 잡기용)
export function landingPoint(sh: Shuttle, h = 0) {
  const a = -0.5 * G, b = sh.vh, c = sh.h - h
  const disc = b * b - 4 * a * c
  if (disc < 0) return { x: sh.x, y: sh.y, t: 0 }
  const t = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a))
  return { x: sh.x + sh.vx * t, y: sh.y + sh.vy * t, t }
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
    if (p.swing >= 0) { p.swing += dtMs; if (p.swing >= SWING_COOLDOWN) p.swing = -1 }
    if (inp.act && p.swing < 0) p.swing = 0
    if (waiting && i === s.srv) return // 서브하는 사람은 서브 전엔 제자리
    const f = fwdOf(p.team)
    let vx = inp.side * f, vy = inp.fwd * f
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2 }
    p.x = clamp(p.x + vx * P_SPEED * dt, -PLAY_HW, PLAY_HW)
    p.y = p.team === 'A' ? clamp(p.y + vy * P_SPEED * dt, -PLAY_HL, -NET_GAP) : clamp(p.y + vy * P_SPEED * dt, NET_GAP, PLAY_HL)
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
  s.sh.x += s.sh.vx * dt
  s.sh.y += s.sh.vy * dt
  s.sh.vh -= G * dt
  s.sh.h += s.sh.vh * dt
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
export type BmHit = { idx: number; hits: number; sh: Shuttle; meter: number; kind: BmShot }
export function applyHit(s0: BmState, h: BmHit): BmState | null {
  const p = s0.players[h.idx]
  if (!p || s0.winner || s0.pause > 0 || h.hits !== s0.hits + 1) return null
  const ok = s0.lastHit === -1 ? s0.srv === h.idx : s0.players[s0.lastHit].team !== p.team
  if (!ok) return null
  return {
    ...s0, sh: { ...h.sh }, lastHit: h.idx, hits: h.hits, hitAt: s0.t,
    meter: { ...s0.meter, [p.team]: h.meter }, last: { team: p.team, kind: h.kind, by: h.idx },
    players: s0.players.map((q, i) => (i === h.idx && q.swing < 0 ? { ...q, swing: SWING_MS / 2 } : q)),
  }
}

// ── CPU ──────────────────────────────────────────────────────────
// decided = 마지막으로 판단한 타구 번호, willHit = 이번 공을 받을지, reactAt = 이 시각 전엔 새 공에 반응 안 함(사람처럼 지연)
// plan = 이번 공을 라켓의 어느 순간(phase)에 맞힐지 — 그만큼 미리 휘두른다. jitter = 사람처럼 타이밍 오차(ms)
export type BmCpuMem = { decided: number; willHit: boolean; reactAt: number; serveAt: number; plan: number; jitter: number }
export const newBmCpuMem = (): BmCpuMem => ({ decided: -1, willHit: true, reactAt: 0, serveAt: -1, plan: 0.5, jitter: 0 })

// 지금 자리에 서 있으면 셔틀콕이 몇 ms 뒤 라켓 범위에 들어오나(0.5초 안, 없으면 null)
function entryMs(sh: Shuttle, px: number, py: number, reach: number, high: number) {
  for (let t = 0; t <= 0.5; t += 0.01) {
    const h = sh.h + sh.vh * t - 0.5 * G * t * t
    if (h < HIT_LOW) return null
    if (h <= high && Math.hypot(sh.x + sh.vx * t - px, sh.y + sh.vy * t - py) <= reach - 0.1) return t * 1000
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
  if (mem.decided !== s.hits) {
    mem.decided = s.hits
    mem.willHit = rand() < (s.sh.special ? 0.35 : 0.88)
    mem.reactAt = s.t + 120 + rand() * 140
    mem.plan = rand() < 0.3 ? 0.5 : 0.15 + rand() * 0.85 // 30%는 정타를 노림
    mem.jitter = (rand() * 2 - 1) * 35
  }
  if (s.t < mem.reactAt) return IDLE
  // 받을 자리(높이 1m로 내려올 곳) — 2:2면 더 가까운 사람이 가고, 다른 사람은 빈 곳을 메운다
  const lp = landingPoint(s.sh, 1.0)
  const tx = clamp(lp.x, -COURT_HW, COURT_HW)
  const ty = me.team === 'A' ? clamp(lp.y, -COURT_HL, -NET_GAP) : clamp(lp.y, NET_GAP, COURT_HL)
  const chaser = mates.reduce((a, b) => (Math.hypot(s.players[a].x - tx, s.players[a].y - ty) <= Math.hypot(s.players[b].x - tx, s.players[b].y - ty) ? a : b))
  if (chaser !== i) return go(-tx * 0.5, -f * 3.4)
  const mv = go(tx, ty)
  const reach = s.sh.special ? SPECIAL_HIT_R : HIT_R, high = s.sh.special ? SPECIAL_HIT_HIGH : HIT_HIGH
  if (!(mem.willHit && me.swing < 0)) return mv
  const ms = entryMs(s.sh, me.x, me.y, reach, high)
  if (ms === null || ms > mem.plan * SWING_MS + mem.jitter) return mv
  return { ...mv, side: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1, act: true }
}
