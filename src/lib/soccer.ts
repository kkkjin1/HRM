// ⚽ 미니 축구(1:1 · 2:2 · 3:3) — 순수 엔진(화면·통신과 분리, 테스트 가능). 2026-11-19
//
// 위에서 내려다본 작은 경기장. 벽에 맞으면 튕긴다(풋살·에어하키 느낌 — 스로인·오프사이드·반칙 없음).
// A팀은 왼쪽 골대를 지키고 오른쪽으로 공격, B팀은 반대.
//
// 조작(사람·CPU 모두 같은 입력 SoccerInput)
//   이동(dx, dy) · sprint 달리기(기력 막대) ·
//   kick(Space, 누르고 있는 상태): 공 있으면 누른 만큼 힘 모아 떼는 순간 슛 / 공 없으면 누르는 순간 태클(슬라이딩)
//   act(X, 누른 순간): 공 있으면 개인기(짧은 대시, 그동안 태클·몸통박치기 안 먹힘) / 공 없으면 몸통박치기
//   pass(C, 누른 순간): 바라보는 쪽에 가까운 우리 팀에게 패스(없으면 앞으로 툭)
//
// 가위바위보: 태클은 길게 미끄러지지만 빗나가면 오래 넘어져 있다 · 몸통박치기는 짧고 빠르지만 다시 쓰려면 기다려야 한다 ·
// 개인기는 둘 다 피하지만 쿨타임이 있다 → 상대 개인기를 본 다음 들어가면 이긴다.
//
// 실시간(방장 1 + 참가자): 방장이 공·판정·점수를 맡고, 참가자는 자기 몸만 움직인다(SoccerStepOpts.move/judge, soccerNet.ts).

export const FIELD_W = 900
export const FIELD_H = 520
export const GOAL_TOP = 192
export const GOAL_BOT = 328
export const GOAL_DEPTH = 34
export const PR = 13 // 선수 반지름
export const BR = 7 // 공 반지름
export const MATCH_SEC = 120
export const GOLDEN_SEC = 60 // 동점이면 골든골(최대 이만큼 더, 그래도 없으면 무승부)
export const GOAL_PAUSE_SEC = 2.4

export const WALK = 150
export const SPRINT = 238
export const DRIBBLE_K = 0.9 // 공 몰고 갈 땐 이만큼 느리다(따라잡을 수 있게)
export const STAMINA_USE = 0.5 // 초당
export const STAMINA_GAIN = 0.22
export const CHARGE_SEC = 0.85 // 이만큼 누르면 최대 힘
export const SHOT_MIN = 330
export const SHOT_MAX = 860
export const TACKLE_SEC = 0.38
export const TACKLE_SPEED = 410
export const TACKLE_MISS_DOWN = 0.6 // 빗나간 태클 뒤 넘어져 있는 시간
export const TACKLE_HIT_DOWN = 0.22
export const CHECK_SEC = 0.18
export const CHECK_SPEED = 340
export const CHECK_COOL = 1.0
export const DODGE_SEC = 0.28
export const DODGE_SPEED = 335
export const DODGE_COOL = 1.4
export const PICK_R = PR + BR + 4
export const HOLD_D = PR + BR + 1 // 몰고 갈 때 공이 발 앞 이만큼

export type Team = 'A' | 'B'
export type Act = 'none' | 'tackle' | 'check' | 'dodge' | 'down'
export const ACTS: Act[] = ['none', 'tackle', 'check', 'dodge', 'down']

export interface SoccerInput {
  dx: number
  dy: number
  sprint: boolean
  kick: boolean // Space 누르고 있는가
  act: boolean // X 누른 순간
  pass: boolean // C 누른 순간
}
export const NO_INPUT: SoccerInput = { dx: 0, dy: 0, sprint: false, kick: false, act: false, pass: false }

export interface SoccerPlayer {
  id: string
  team: Team
  slot: number // 팀 안 순서(대형 자리)
  x: number
  y: number
  vx: number
  vy: number
  fx: number // 바라보는 방향(단위 벡터)
  fy: number
  moving: boolean
  stamina: number // 0~1
  tired: boolean // 기력 바닥 → 조금 찰 때까지 못 달림
  act: Act
  actUntil: number
  adx: number // 동작 방향(태클·박치기·개인기)
  ady: number
  checkCool: number // 이 시각 전엔 박치기 못 함
  dodgeCool: number
  chargeAt: number | null // 슛 힘 모으기 시작 시각
  kickHeld: boolean
  kc: number // 밀려난 횟수(통신: 참가자가 자기 몸에 넉백을 적용할 때 비교)
  kx: number // 마지막 넉백 속도
  ky: number
  goals: number
  steals: number
  shots: number
}

export interface SoccerBall {
  x: number
  y: number
  vx: number
  vy: number
  owner: string | null
  last: string | null // 마지막으로 찬 사람(골 기록)
  lockId: string | null // 이 사람은 lockUntil 전까지 못 잡는다(방금 빼앗긴·찬 사람)
  lockUntil: number
}

export type SoccerEvent =
  | { kind: 'shoot'; id: string; power: number }
  | { kind: 'pass'; id: string; to: string | null }
  | { kind: 'tackle'; id: string; on: string | null } // on = 공 빼앗은 상대(없으면 빗나감/공만 건드림)
  | { kind: 'check'; id: string; on: string }
  | { kind: 'dodged'; id: string; by: string }
  | { kind: 'steal'; id: string; from: string }
  | { kind: 'goal'; team: Team; by: string | null; own: boolean }
  | { kind: 'post' }
  | { kind: 'wall' }
  | { kind: 'end' }

export type Phase = 'play' | 'goal' | 'end'

export interface SoccerState {
  t: number
  size: number
  phase: Phase
  phaseUntil: number
  score: Record<Team, number>
  players: SoccerPlayer[]
  ball: SoccerBall
  golden: boolean
  winner: Team | 'draw' | null
  endedAt: number | null
  events: SoccerEvent[]
  goalSeq: number // 골이 날 때마다 +1 (통신·연출)
  ko: number // 킥오프(골 뒤 다시 시작) 횟수 — 참가자가 자기 몸을 제자리로 보낼 때 비교
  lastGoal: { team: Team; by: string | null; own: boolean } | null
}

// 대형(왼쪽 = A 기준, 0~1). B는 좌우 반전.
const FORMATION: Record<number, [number, number][]> = {
  1: [[0.3, 0.5]],
  2: [[0.33, 0.5], [0.15, 0.5]],
  3: [[0.33, 0.5], [0.19, 0.27], [0.19, 0.73]],
}
export function homeSpot(team: Team, slot: number, size: number) {
  const f = (FORMATION[size] ?? FORMATION[3])[slot] ?? [0.25, 0.5]
  const x = f[0] * FIELD_W
  return { x: team === 'A' ? x : FIELD_W - x, y: f[1] * FIELD_H }
}

export function newSoccerState(seats: { id: string; team: Team }[]): SoccerState {
  const size = Math.max(1, Math.max(seats.filter(s => s.team === 'A').length, seats.filter(s => s.team === 'B').length))
  const slotOf: Record<Team, number> = { A: 0, B: 0 }
  const players: SoccerPlayer[] = seats.map(s => {
    const slot = slotOf[s.team]++
    const h = homeSpot(s.team, slot, size)
    return {
      id: s.id, team: s.team, slot, x: h.x, y: h.y, vx: 0, vy: 0, fx: s.team === 'A' ? 1 : -1, fy: 0, moving: false,
      stamina: 1, tired: false, act: 'none', actUntil: 0, adx: 0, ady: 0, checkCool: 0, dodgeCool: 0, chargeAt: null, kickHeld: false,
      kc: 0, kx: 0, ky: 0, goals: 0, steals: 0, shots: 0,
    }
  })
  return {
    t: 0, size, phase: 'play', phaseUntil: 0, score: { A: 0, B: 0 }, players,
    ball: { x: FIELD_W / 2, y: FIELD_H / 2, vx: 0, vy: 0, owner: null, last: null, lockId: null, lockUntil: 0 },
    golden: false, winner: null, endedAt: null, events: [], goalSeq: 0, ko: 0, lastGoal: null,
  }
}

const len = (x: number, y: number) => Math.hypot(x, y)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const attackDir = (team: Team) => (team === 'A' ? 1 : -1)
/** 상대 골대 가운데 */
export const goalOf = (team: Team) => ({ x: team === 'A' ? FIELD_W : 0, y: (GOAL_TOP + GOAL_BOT) / 2 })
/** 우리 골대 가운데 */
export const ownGoalOf = (team: Team) => ({ x: team === 'A' ? 0 : FIELD_W, y: (GOAL_TOP + GOAL_BOT) / 2 })

export function ownerOf(s: SoccerState) {
  return s.ball.owner ? s.players.find(p => p.id === s.ball.owner) ?? null : null
}
export function shotPower(p: SoccerPlayer, t: number) {
  return p.chargeAt === null ? 0 : clamp((t - p.chargeAt) / CHARGE_SEC, 0, 1)
}
/** 슛·개인기·박치기를 못 하는 상태(넘어짐·태클 중) */
export const busy = (p: SoccerPlayer, t: number) => (p.act === 'down' || p.act === 'tackle') && t < p.actUntil
/** 태클·박치기가 안 먹히는 상태 */
export const evading = (p: SoccerPlayer, t: number) => p.act === 'dodge' && t < p.actUntil + 0.08

export interface SoccerStepOpts {
  move: Set<string> // 이 PC가 움직이는 선수
  judge: boolean // 공 줍기·빼앗기·골·시간 판정(방장/혼자)
}

/** 넘어뜨리기(넉백) — 방장 판정. 참가자는 kc가 바뀐 걸 보고 자기 몸에 적용한다 */
export function knock(p: SoccerPlayer, t: number, vx: number, vy: number, down: number) {
  p.act = 'down'
  p.actUntil = t + down
  p.vx = vx
  p.vy = vy
  p.kx = vx
  p.ky = vy
  p.kc++
  p.chargeAt = null
}

function loseBall(s: SoccerState, p: SoccerPlayer, vx: number, vy: number, lock = 0.5) {
  const b = s.ball
  if (b.owner !== p.id) return
  b.owner = null
  b.vx = vx
  b.vy = vy
  b.lockId = p.id
  b.lockUntil = s.t + lock
  p.chargeAt = null
}

/** 슛(방장·참가자 예측 공통) */
export function shootBall(s: SoccerState, p: SoccerPlayer, power: number) {
  const b = s.ball
  const v = SHOT_MIN + (SHOT_MAX - SHOT_MIN) * clamp(power, 0, 1)
  b.owner = null
  b.x = p.x + p.fx * HOLD_D
  b.y = p.y + p.fy * HOLD_D
  b.vx = p.fx * v
  b.vy = p.fy * v
  b.last = p.id
  b.lockId = p.id
  b.lockUntil = s.t + 0.25
  p.chargeAt = null
  p.shots++
  s.events.push({ kind: 'shoot', id: p.id, power })
}

/** 패스 받을 사람 — 바라보는 쪽(±70°) 우리 팀 중 가까운 사람. 없으면 null */
export function passTarget(s: SoccerState, p: SoccerPlayer): SoccerPlayer | null {
  let best: SoccerPlayer | null = null
  let bestScore = Infinity
  for (const o of s.players) {
    if (o.id === p.id || o.team !== p.team) continue
    const dx = o.x - p.x, dy = o.y - p.y
    const d = len(dx, dy)
    if (d < 30) continue
    const cos = (dx * p.fx + dy * p.fy) / d
    if (cos < 0.34) continue
    const score = d * (1.6 - cos)
    if (score < bestScore) { bestScore = score; best = o }
  }
  return best
}

export function passBall(s: SoccerState, p: SoccerPlayer) {
  const b = s.ball
  const to = passTarget(s, p)
  let dx = p.fx, dy = p.fy, v = 300
  if (to) {
    // 받는 사람이 가는 쪽을 조금 앞서
    const tx = to.x + to.vx * 0.25, ty = to.y + to.vy * 0.25
    const d = len(tx - p.x, ty - p.y) || 1
    dx = (tx - p.x) / d
    dy = (ty - p.y) / d
    v = clamp(220 + d * 1.1, 340, 600)
    p.fx = dx
    p.fy = dy
  }
  b.owner = null
  b.x = p.x + dx * HOLD_D
  b.y = p.y + dy * HOLD_D
  b.vx = dx * v
  b.vy = dy * v
  b.last = p.id
  b.lockId = p.id
  b.lockUntil = s.t + 0.3
  p.chargeAt = null
  s.events.push({ kind: 'pass', id: p.id, to: to?.id ?? null })
}

/** 사람(내 PC가 움직이는 선수)의 입력 처리 + 이동. judge가 없으면 공과의 상호작용(슛 등)은 하지 않고 예측만 한다 */
function stepPlayer(s: SoccerState, p: SoccerPlayer, inp: SoccerInput, dt: number, judge: boolean) {
  const t = s.t
  const b = s.ball
  const hasBall = b.owner === p.id
  const frozen = s.phase !== 'play'

  // 동작 끝
  if (p.act !== 'none' && t >= p.actUntil) {
    if (p.act === 'tackle') {
      // 빗나간 태클 → 넘어짐
      p.act = 'down'
      p.actUntil = t + TACKLE_MISS_DOWN
    } else p.act = 'none'
  }

  // 버튼
  const press = inp.kick && !p.kickHeld
  const release = !inp.kick && p.kickHeld
  p.kickHeld = inp.kick
  if (!frozen && p.act !== 'down' && p.act !== 'tackle') {
    if (hasBall) {
      if (press) p.chargeAt = t
      if (release && p.chargeAt !== null && judge) shootBall(s, p, shotPower(p, t))
      if (inp.pass && judge) passBall(s, p)
      else if (inp.act && t >= p.dodgeCool && b.owner === p.id) {
        const d = len(inp.dx, inp.dy)
        p.act = 'dodge'
        p.actUntil = t + DODGE_SEC
        p.adx = d > 0.1 ? inp.dx / d : p.fx
        p.ady = d > 0.1 ? inp.dy / d : p.fy
        p.dodgeCool = t + DODGE_COOL
      }
    } else {
      p.chargeAt = null
      if (press) {
        p.act = 'tackle'
        p.actUntil = t + TACKLE_SEC
        const d = len(inp.dx, inp.dy)
        p.adx = d > 0.1 ? inp.dx / d : p.fx
        p.ady = d > 0.1 ? inp.dy / d : p.fy
      } else if (inp.act && t >= p.checkCool) {
        p.act = 'check'
        p.actUntil = t + CHECK_SEC
        const d = len(inp.dx, inp.dy)
        p.adx = d > 0.1 ? inp.dx / d : p.fx
        p.ady = d > 0.1 ? inp.dy / d : p.fy
        p.checkCool = t + CHECK_COOL
      }
    }
  }

  // 이동
  let tvx = 0, tvy = 0
  const active = p.act !== 'none' && t < p.actUntil
  if (active && p.act === 'tackle') {
    const k = 1 - (p.actUntil - t) / TACKLE_SEC // 0 → 1
    const v = TACKLE_SPEED * (1 - k * 0.55)
    tvx = p.adx * v; tvy = p.ady * v
    p.vx = tvx; p.vy = tvy
  } else if (active && p.act === 'check') {
    p.vx = p.adx * CHECK_SPEED; p.vy = p.ady * CHECK_SPEED
  } else if (active && p.act === 'dodge') {
    p.vx = p.adx * DODGE_SPEED; p.vy = p.ady * DODGE_SPEED
  } else if (active && p.act === 'down') {
    // 밀려나다 멈춤
    const f = Math.exp(-7 * dt)
    p.vx *= f; p.vy *= f
  } else if (!frozen) {
    const d = len(inp.dx, inp.dy)
    const wantSprint = inp.sprint && !p.tired && d > 0.1
    let sp = wantSprint ? SPRINT : WALK
    if (b.owner === p.id) sp *= DRIBBLE_K
    if (p.chargeAt !== null) sp *= 0.75
    if (d > 0.1) {
      tvx = (inp.dx / d) * sp
      tvy = (inp.dy / d) * sp
      p.fx = inp.dx / d
      p.fy = inp.dy / d
    }
    const k = Math.min(1, dt * 12)
    p.vx += (tvx - p.vx) * k
    p.vy += (tvy - p.vy) * k
    if (wantSprint) {
      p.stamina = Math.max(0, p.stamina - STAMINA_USE * dt)
      if (p.stamina <= 0) p.tired = true
    } else p.stamina = Math.min(1, p.stamina + STAMINA_GAIN * dt)
    if (p.tired && p.stamina >= 0.3) p.tired = false
  } else {
    p.vx = 0; p.vy = 0
  }
  if (p.act !== 'none' && p.act !== 'down' && active) {
    p.fx = p.adx; p.fy = p.ady
  }
  p.x = clamp(p.x + p.vx * dt, PR, FIELD_W - PR)
  p.y = clamp(p.y + p.vy * dt, PR, FIELD_H - PR)
  p.moving = len(p.vx, p.vy) > 20
}

/** 공 굴리기(마찰·벽 튕김) + 몰고 가는 공 위치. judge면 골 판정까지 */
function stepBall(s: SoccerState, dt: number, judge: boolean) {
  const b = s.ball
  const owner = ownerOf(s)
  if (owner) {
    b.x = clamp(owner.x + owner.fx * HOLD_D, BR, FIELD_W - BR)
    b.y = clamp(owner.y + owner.fy * HOLD_D, BR, FIELD_H - BR)
    b.vx = owner.vx
    b.vy = owner.vy
    return
  }
  // 여러 번 나눠 움직여 빠른 슛이 골대 기둥을 뚫지 않게
  const sub = Math.max(1, Math.ceil((len(b.vx, b.vy) * dt) / 6))
  const h = dt / sub
  for (let i = 0; i < sub; i++) {
    b.x += b.vx * h
    b.y += b.vy * h
    const inMouth = b.y > GOAL_TOP + 2 && b.y < GOAL_BOT - 2
    // 위·아래 벽
    if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * 0.78; s.events.push({ kind: 'wall' }) }
    if (b.y > FIELD_H - BR) { b.y = FIELD_H - BR; b.vy = -Math.abs(b.vy) * 0.78; s.events.push({ kind: 'wall' }) }
    // 좌우: 골문이면 통과(골), 아니면 벽
    for (const side of [0, 1] as const) {
      const over = side === 0 ? b.x < BR : b.x > FIELD_W - BR
      if (!over) continue
      if (inMouth) {
        if (judge && s.phase === 'play' && (side === 0 ? b.x < -BR : b.x > FIELD_W + BR)) scoreGoal(s, side === 0 ? 'B' : 'A')
        // 골망 안쪽 벽
        if (side === 0 && b.x < -GOAL_DEPTH + BR) { b.x = -GOAL_DEPTH + BR; b.vx = Math.abs(b.vx) * 0.2 }
        if (side === 1 && b.x > FIELD_W + GOAL_DEPTH - BR) { b.x = FIELD_W + GOAL_DEPTH - BR; b.vx = -Math.abs(b.vx) * 0.2 }
        if (b.y < GOAL_TOP + BR && (side === 0 ? b.x < 0 : b.x > FIELD_W)) { b.y = GOAL_TOP + BR; b.vy = Math.abs(b.vy) * 0.3 }
        if (b.y > GOAL_BOT - BR && (side === 0 ? b.x < 0 : b.x > FIELD_W)) { b.y = GOAL_BOT - BR; b.vy = -Math.abs(b.vy) * 0.3 }
      } else {
        const nearPost = Math.abs(b.y - GOAL_TOP) < BR + 3 || Math.abs(b.y - GOAL_BOT) < BR + 3
        if (side === 0) { b.x = BR; b.vx = Math.abs(b.vx) * 0.78 } else { b.x = FIELD_W - BR; b.vx = -Math.abs(b.vx) * 0.78 }
        s.events.push({ kind: nearPost ? 'post' : 'wall' })
      }
    }
  }
  // 마찰: 비례 + 일정량
  const sp = len(b.vx, b.vy)
  if (sp > 0) {
    const ns = Math.max(0, sp * Math.exp(-0.85 * dt) - 38 * dt)
    b.vx *= ns / sp
    b.vy *= ns / sp
  }
}

function scoreGoal(s: SoccerState, team: Team) {
  const by = s.ball.last
  const scorer = by ? s.players.find(p => p.id === by) : undefined
  const own = !!scorer && scorer.team !== team
  s.score[team]++
  if (scorer && !own) scorer.goals++
  s.goalSeq++
  s.lastGoal = { team, by, own }
  s.events.push({ kind: 'goal', team, by: by, own })
  if (s.golden) {
    finish(s, team)
    return
  }
  s.phase = 'goal'
  s.phaseUntil = s.t + GOAL_PAUSE_SEC
}

function finish(s: SoccerState, w: Team | 'draw') {
  s.phase = 'end'
  s.winner = w
  s.endedAt = s.t
  s.ball.owner = null
  s.events.push({ kind: 'end' })
}

/** 킥오프 때 선수 제자리 — 먹힌 팀 앞사람은 공 가까이 */
export function resetToKickoff(s: SoccerState, p: SoccerPlayer, conceded: Team | null) {
  const h = homeSpot(p.team, p.slot, s.size)
  p.x = conceded === p.team && p.slot === 0 ? FIELD_W / 2 - attackDir(p.team) * 34 : h.x
  p.y = h.y
  p.vx = 0; p.vy = 0
  p.fx = attackDir(p.team); p.fy = 0
  p.act = 'none'
  p.chargeAt = null
  p.stamina = Math.max(p.stamina, 0.6)
  p.tired = false
}

/** 골 뒤 다시 시작 — 모두 제자리, 공 가운데 */
export function kickoff(s: SoccerState, conceded: Team | null) {
  for (const p of s.players) resetToKickoff(s, p, conceded)
  s.ko++
  const b = s.ball
  b.x = FIELD_W / 2; b.y = FIELD_H / 2; b.vx = 0; b.vy = 0; b.owner = null; b.lockId = null; b.lockUntil = 0
  s.phase = 'play'
}

/** 몸끼리 겹치지 않게(움직이는 사람만 밀려난다) */
function separate(s: SoccerState, move: Set<string>) {
  const ps = s.players
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j]
    const dx = c.x - a.x, dy = c.y - a.y
    const d = len(dx, dy)
    const min = PR * 2 - 2
    if (d >= min || d === 0) continue
    const push = (min - d) / d
    const ma = move.has(a.id), mc = move.has(c.id)
    const wa = ma && mc ? 0.5 : ma ? 1 : 0
    const wc = ma && mc ? 0.5 : mc ? 1 : 0
    a.x = clamp(a.x - dx * push * wa, PR, FIELD_W - PR)
    a.y = clamp(a.y - dy * push * wa, PR, FIELD_H - PR)
    c.x = clamp(c.x + dx * push * wc, PR, FIELD_W - PR)
    c.y = clamp(c.y + dy * push * wc, PR, FIELD_H - PR)
  }
}

/** 판정: 태클·박치기 맞음, 공 줍기 */
function judgeContacts(s: SoccerState) {
  const t = s.t
  const b = s.ball
  if (s.phase !== 'play') return
  for (const p of s.players) {
    if (p.act !== 'tackle' && p.act !== 'check') continue
    if (t >= p.actUntil) continue
    // 태클: 공을 가진 상대 or 굴러가는 공
    for (const o of s.players) {
      if (o.team === p.team || o.id === p.id) continue
      const d = len(o.x - p.x, o.y - p.y)
      if (d > PR * 2 + 5) continue
      if (o.act === 'down' && t < o.actUntil) continue
      if (evading(o, t)) {
        if (p.act === 'tackle') {
          // 개인기에 당함 → 태클한 사람이 바로 넘어짐
          p.act = 'down'
          p.actUntil = t + TACKLE_MISS_DOWN
          s.events.push({ kind: 'dodged', id: o.id, by: p.id })
        } else if (p.act === 'check') {
          p.actUntil = t // 박치기 헛방
          s.events.push({ kind: 'dodged', id: o.id, by: p.id })
        }
        continue
      }
      if (p.act === 'tackle') {
        const had = b.owner === o.id
        if (had) {
          loseBall(s, o, p.adx * 150 + p.vx * 0.15, p.ady * 150 + p.vy * 0.15, 0.6)
          b.lockId = o.id
          p.steals++
          s.events.push({ kind: 'steal', id: p.id, from: o.id })
        }
        // 공이 없는 사람을 태클하면 둘 다 넘어진다(공 없는 사람은 덜)
        knock(o, t, p.adx * 160, p.ady * 160, had ? 0.55 : 0.35)
        p.act = 'down'
        p.actUntil = t + TACKLE_HIT_DOWN
        s.events.push({ kind: 'tackle', id: p.id, on: had ? o.id : null })
        break
      } else {
        const had = b.owner === o.id
        if (had) {
          loseBall(s, o, o.vx * 0.4 + p.adx * 130, o.vy * 0.4 + p.ady * 130, 0.55)
          p.steals++
          s.events.push({ kind: 'steal', id: p.id, from: o.id })
        }
        knock(o, t, p.adx * 270, p.ady * 270, had ? 0.38 : 0.3)
        p.actUntil = t // 한 번만
        s.events.push({ kind: 'check', id: p.id, on: o.id })
        break
      }
    }
    // 태클로 굴러가는 공 건드리기
    if (p.act === 'tackle' && t < p.actUntil && !b.owner && len(b.x - p.x, b.y - p.y) < PICK_R + 2 && !(b.lockId === p.id && t < b.lockUntil)) {
      b.vx = p.adx * 230 + b.vx * 0.2
      b.vy = p.ady * 230 + b.vy * 0.2
      b.last = p.id
      b.lockId = p.id
      b.lockUntil = t + 0.15
      p.act = 'down'
      p.actUntil = t + TACKLE_HIT_DOWN
      s.events.push({ kind: 'tackle', id: p.id, on: null })
    }
  }
  // 공 줍기 — 가장 가까운 사람
  if (!b.owner) {
    let best: SoccerPlayer | null = null
    let bd = PICK_R
    for (const p of s.players) {
      if ((p.act === 'down' || p.act === 'tackle') && t < p.actUntil) continue
      if (b.lockId === p.id && t < b.lockUntil) continue
      const d = len(b.x - p.x, b.y - p.y)
      // 너무 빠른 공(강슛)은 몸에 맞고 튕긴다
      if (d < bd) { bd = d; best = p }
    }
    if (best) {
      const sp = len(b.vx, b.vy)
      if (sp > 640 && b.last && s.players.find(p => p.id === b.last)?.team !== best.team) {
        // 강슛 블록: 튕겨냄
        const nx = (b.x - best.x) / (bd || 1), ny = (b.y - best.y) / (bd || 1)
        const dot = b.vx * nx + b.vy * ny
        b.vx = (b.vx - 2 * dot * nx) * 0.45
        b.vy = (b.vy - 2 * dot * ny) * 0.45
        b.lockId = best.id
        b.lockUntil = t + 0.15
      } else {
        b.owner = best.id
        b.last = best.id
        b.lockId = null
      }
    }
  }
}

/** 한 칸(dt) 진행 */
export function stepSoccer(s: SoccerState, inputs: Record<string, SoccerInput>, dt: number, opts: SoccerStepOpts) {
  s.t += dt
  if (s.phase === 'end') return
  if (opts.judge && s.phase === 'goal' && s.t >= s.phaseUntil) {
    kickoff(s, s.lastGoal ? (s.lastGoal.team === 'A' ? 'B' : 'A') : null)
  }
  for (const p of s.players) {
    if (!opts.move.has(p.id)) continue
    stepPlayer(s, p, inputs[p.id] ?? NO_INPUT, dt, opts.judge)
  }
  separate(s, opts.move)
  if (opts.judge) judgeContacts(s)
  stepBall(s, dt, opts.judge)
  // 시간
  if (opts.judge && s.phase === 'play') {
    if (!s.golden && s.t >= MATCH_SEC) {
      if (s.score.A !== s.score.B) finish(s, s.score.A > s.score.B ? 'A' : 'B')
      else s.golden = true
    } else if (s.golden && s.t >= MATCH_SEC + GOLDEN_SEC) finish(s, 'draw')
  }
}

/** 공만 sec초 굴리기(참가자: 방장 소식 시각 → 지금까지 따라잡기). 판정 없음, 시각(s.t)은 그대로 */
export function rollBall(s: SoccerState, sec: number) {
  let left = Math.min(0.5, Math.max(0, sec))
  const n = s.events.length
  while (left > 1e-6) {
    const h = Math.min(1 / 60, left)
    stepBall(s, h, false)
    left -= h
  }
  s.events.length = n
}

/** 남은 시간(초) — 골든골이면 골든골 남은 시간 */
export function timeLeft(s: SoccerState) {
  return s.golden ? Math.max(0, MATCH_SEC + GOLDEN_SEC - s.t) : Math.max(0, MATCH_SEC - s.t)
}

// 결정적 난수 (같은 시드면 같은 값)
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
