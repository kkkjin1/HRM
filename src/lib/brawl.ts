// 🥊 운동장 격투기 — 낭떠러지 밀어내기(2026-11-24 STEP 1: 혼자 CPU 연습판)
// 막대 인간 + 큰 글러브. 맞을수록 "밀림 %"가 쌓이고, %가 높을수록 같은 펀치에도 멀리 날아간다. 무대 밖으로 떨어지면 목숨 하나.
// 30초가 지나면 무대가 무너지기 시작해 판이 끌리지 않는다. 최대 5명 개인전, 마지막 남은 사람이 승리.
// 순수 계산만 — 그리기는 BrawlArena(캔버스). 나중에 온라인 대결에서 방장이 이 step을 그대로 돌린다.

export const BW = 960
export const BH = 540
export const DT = 1 / 60
export const MAX_FIGHTERS = 5

// 움직임
const GRAV = 2000
const MAX_FALL = 950
const JUMP_V = 720
const AIR_JUMP_V = 650
const RUN = 290
const ACC_GROUND = 2600
const ACC_AIR = 1300
const FRIC_GROUND = 2800
export const BODY_H = 56 // 발 → 머리 꼭대기
const HURT_R = 22 // 몸통 맞는 범위(원)

// 펀치
export const JAB = { startup: 0.06, active: 0.08, recover: 0.14, reach: 36, r: 20, dmg: 4, base: 120, grow: 2.2 }
export const STRONG = { startup: 0.1, active: 0.09, recover: 0.32, reach: 42, r: 24, maxCharge: 0.9 }
// 공격 키 하나(Space): 짧게 떼면 잽, TAP초 넘게 누르고 있으면 강펀치 모으기 → 떼면 강펀치(2026-11-24 사용자 요청)
export const TAP = 0.16
const strongDmg = (c: number) => Math.round(9 + 11 * c) // 9~20%
const strongBase = (c: number) => 200 + 150 * c
const strongGrow = (c: number) => 4.6 + 3.2 * c
const CHARGE_HIT_MULT = 1.5 // 모으는 중에 맞으면 더 아프고 더 멀리
const GUARD_MAX = 1.6
const GUARD_COOLDOWN = 1.0

// 판
export const CRUMBLE_AT = 30 // 초
const CRUMBLE_SPEED = 9 // px/s(양쪽 끝에서)
const MIN_PLAT_W = 170
export const TIME_LIMIT = 150
const RESPAWN_INVULN = 1.5

export type BrawlMapKey = 'peak' | 'bridge' | 'ice' | 'isles'
// move = 좌우 왕복(px, 주기 초), bob = 위아래 출렁, breaksAt = 그 시각에 사라짐(끊어짐·녹음·가라앉음)
export type Platform = { id: number; x0: number; x1: number; y: number; main?: boolean; breaksAt?: number; move?: { amp: number; period: number }; bob?: { amp: number; period: number } }
export type BrawlMap = { key: BrawlMapKey; name: string; emoji: string; hint: string; ice: boolean; crumble: boolean; wind: boolean; platforms: Platform[]; spawnY: number }
const P = (id: number, x0: number, x1: number, y: number, o: Omit<Platform, 'id' | 'x0' | 'x1' | 'y'> = {}): Platform => ({ id, x0, x1, y, ...o })

export const BRAWL_MAPS: Record<BrawlMapKey, BrawlMap> = {
  // 산 정상: 가운데 떠 있는 바위가 좌우로 천천히 오간다(올라탄 사람도 같이). 30초부터 양끝 무너짐
  peak: { key: 'peak', name: '산 정상', emoji: '⛰️', hint: '떠 있는 바위가 움직여요 · 30초부터 땅이 무너져요', ice: false, crumble: true, wind: false, spawnY: 150,
    platforms: [P(0, 190, 770, 390, { main: true }), P(1, 400, 560, 262, { move: { amp: 170, period: 7 } })] },
  // 흔들다리: 다리가 출렁이고 가끔 돌풍. 30초에 다리가 끊어져 가운데가 낭떠러지(절벽은 그대로 — 좁히면 틈이 넓어져 못 건넘)
  bridge: { key: 'bridge', name: '흔들다리', emoji: '🌉', hint: '다리가 출렁이고 돌풍이 불어요 · 30초에 다리가 끊어져요', ice: false, crumble: false, wind: true, spawnY: 150,
    platforms: [P(0, 110, 370, 380, { main: true }), P(1, 590, 850, 380, { main: true }), P(2, 370, 590, 392, { breaksAt: CRUMBLE_AT, bob: { amp: 7, period: 1.6 } })] },
  // 빙판 절벽: 미끄러움. 양옆 얼음판은 50초에 녹는다
  ice: { key: 'ice', name: '빙판 절벽', emoji: '🧊', hint: '미끄러워요 · 양옆 얼음은 50초에 녹아요', ice: true, crumble: true, wind: false, spawnY: 150,
    platforms: [P(0, 210, 750, 385, { main: true }), P(1, 120, 250, 280, { breaksAt: CRUMBLE_AT + 20 }), P(2, 710, 840, 280, { breaksAt: CRUMBLE_AT + 20 })] },
  // 바위섬: 섬 3개 — 왼쪽 섬은 30초, 오른쪽 섬은 50초에 가라앉아 가운데 섬만 남는다. 섬들은 살짝 위아래로 흔들림
  isles: { key: 'isles', name: '바위섬', emoji: '🏝️', hint: '바깥 섬이 하나씩 가라앉아요(30초·50초)', ice: false, crumble: false, wind: false, spawnY: 150,
    platforms: [P(0, 105, 315, 392, { main: true, breaksAt: CRUMBLE_AT, bob: { amp: 4, period: 3.1 } }), P(1, 385, 575, 372, { main: true, bob: { amp: 3, period: 2.6 } }), P(2, 645, 855, 392, { main: true, breaksAt: CRUMBLE_AT + 20, bob: { amp: 4, period: 3.5 } })] },
}
export const MAP_ORDER: BrawlMapKey[] = ['peak', 'bridge', 'ice', 'isles']

// 🌬 돌풍(흔들다리): 8초부터 12초마다 3초씩, 방향은 번갈아. 1.5초 전에 예고
const GUST_EVERY = 12, GUST_FIRST = 8, GUST_LEN = 3, GUST_ACC = 760
export function windAt(map: BrawlMapKey, time: number): { acc: number; warn: -1 | 0 | 1 } {
  if (!BRAWL_MAPS[map].wind || time < GUST_FIRST - 1.5) return { acc: 0, warn: 0 }
  const k = Math.floor((time - GUST_FIRST + 1.5) / GUST_EVERY)
  const ph = time - GUST_FIRST - k * GUST_EVERY
  const dir: 1 | -1 = k % 2 === 0 ? 1 : -1
  if (ph >= 0 && ph < GUST_LEN) return { acc: dir * GUST_ACC, warn: 0 }
  if (ph < 0 && ph >= -1.5) return { acc: 0, warn: dir }
  return { acc: 0, warn: 0 }
}

export type Act = 'idle' | 'jab' | 'charge' | 'strong' | 'guard' | 'stun' | 'out'
export type Fighter = {
  id: string; name: string; color: string; cpu: boolean
  x: number; y: number; vx: number; vy: number; facing: 1 | -1
  ground: boolean; airJumps: number
  pct: number; lives: number
  act: Act; t: number // 지금 동작이 시작된 뒤 지난 시간
  charge: number // 강펀치에 실린 모으기(0~1)
  chargeKey: 'attack' | 'strong' // 모으기를 시작한 키(사람 = attack 한 키, CPU = strong)
  on: number | null // 서 있는 판 id(움직이는 판에 실려 가게)
  hitDone: boolean // 이번 펀치가 이미 누굴 맞혔는지
  guardT: number; guardCd: number
  stun: number; invuln: number
  lastHitBy: string | null
  outAt: number | null // 탈락(목숨 0) 시각
  place: number | null // 등수(1 = 우승)
}
export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; jab: boolean; strong: boolean; attack: boolean }
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, jab: false, strong: false, attack: false }
// 지금 강펀치를 '모으는 중'으로 보이는지(한 키로 시작했으면 TAP초가 지나야)
export const isCharging = (f: Fighter) => f.act === 'charge' && (f.chargeKey === 'strong' || f.t >= TAP)

export type HitFx = { x: number; y: number; strong: boolean; guard: boolean; big: boolean }
export type KoFx = { id: string; x: number; y: number }
export type BrawlState = {
  map: BrawlMapKey; time: number; platforms: Platform[]
  fighters: Fighter[]
  prev: Record<string, Input> // 직전 입력(눌린 순간 판별)
  winner: string | null; over: boolean
  seed: number
  fx: { hits: HitFx[]; kos: KoFx[] } // 이번 step에 생긴 연출(그리기 쪽이 가져가 쓴다)
}

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Entrant = { id: string; name: string; color: string; cpu: boolean }
export function newBrawl(map: BrawlMapKey, entrants: Entrant[], lives = 3, seed = 1): BrawlState {
  const m = BRAWL_MAPS[map]
  const es = entrants.slice(0, MAX_FIGHTERS)
  const mains = m.platforms.filter(p => p.main)
  const left = Math.min(...mains.map(p => p.x0)) + 95, right = Math.max(...mains.map(p => p.x1)) - 95 // 시작하자마자 끝에서 밀려 떨어지지 않게 안쪽에서
  const fighters = es.map((e, i): Fighter => {
    const x = es.length === 1 ? BW / 2 : left + ((right - left) * i) / (es.length - 1)
    const plat = mains.find(p => x >= p.x0 && x <= p.x1) ?? mains[0]
    return {
      ...e, x, y: plat.y, vx: 0, vy: 0, facing: x < BW / 2 ? 1 : -1, ground: true, airJumps: 1,
      pct: 0, lives, act: 'idle', t: 0, charge: 0, chargeKey: 'strong', on: plat.id, hitDone: false, guardT: 0, guardCd: 0, stun: 0, invuln: 0,
      lastHitBy: null, outAt: null, place: null,
    }
  })
  return { map, time: 0, platforms: platformsAt(map, 0), fighters, prev: {}, winner: null, over: false, seed, fx: { hits: [], kos: [] } }
}

// 무대: 시간이 지나면 main 판 양 끝이 무너지고, breaksAt 판은 그때 끊어진다
export function platformsAt(map: BrawlMapKey, time: number): Platform[] {
  const out: Platform[] = []
  const m = BRAWL_MAPS[map]
  for (const p of m.platforms) {
    if (p.breaksAt !== undefined && time >= p.breaksAt) continue
    const q = { ...p }
    if (p.move) { const dx = Math.sin((time / p.move.period) * Math.PI * 2) * p.move.amp; q.x0 += dx; q.x1 += dx }
    if (p.bob) q.y += Math.sin((time / p.bob.period) * Math.PI * 2) * p.bob.amp
    if (p.main && m.crumble && time > CRUMBLE_AT) {
      const cut = (time - CRUMBLE_AT) * CRUMBLE_SPEED
      const mid = (q.x0 + q.x1) / 2, half = Math.max(MIN_PLAT_W / 2, (q.x1 - q.x0) / 2 - cut)
      q.x0 = mid - half; q.x1 = mid + half
    }
    out.push(q)
  }
  return out
}

// 발 아래 판(위에서 내려올 때만 걸림 — 아래에서는 뚫고 올라감)
function landOn(plats: Platform[], x: number, yPrev: number, y: number): Platform | null {
  for (const p of plats) if (x >= p.x0 && x <= p.x1 && yPrev <= p.y + 0.5 && y >= p.y) return p
  return null
}
export function groundUnder(plats: Platform[], x: number, y: number): Platform | null {
  let best: Platform | null = null
  for (const p of plats) if (x >= p.x0 && x <= p.x1 && p.y >= y - 1 && (!best || p.y < best.y)) best = p
  return best
}

const alive = (f: Fighter) => f.lives > 0
const busy = (f: Fighter) => f.act === 'jab' || f.act === 'strong' || f.act === 'stun' || f.act === 'out'
const bodyY = (f: Fighter) => f.y - BODY_H / 2

function punchBox(f: Fighter) {
  if (f.act === 'jab' && f.t >= JAB.startup && f.t < JAB.startup + JAB.active) return { x: f.x + f.facing * JAB.reach, y: f.y - 36, r: JAB.r, strong: false }
  if (f.act === 'strong' && f.t >= STRONG.startup && f.t < STRONG.startup + STRONG.active) return { x: f.x + f.facing * STRONG.reach, y: f.y - 36, r: STRONG.r, strong: true }
  return null
}

function respawn(s: BrawlState, f: Fighter) {
  const plats = s.platforms.filter(p => p.main)
  const p = plats.reduce((a, b) => (Math.abs((b.x0 + b.x1) / 2 - BW / 2) < Math.abs((a.x0 + a.x1) / 2 - BW / 2) ? b : a), plats[0] ?? s.platforms[0])
  f.x = p ? (p.x0 + p.x1) / 2 : BW / 2
  f.y = BRAWL_MAPS[s.map].spawnY
  f.vx = 0; f.vy = 0; f.pct = 0; f.act = 'idle'; f.t = 0; f.stun = 0; f.charge = 0; f.on = null
  f.ground = false; f.airJumps = 1; f.invuln = RESPAWN_INVULN; f.lastHitBy = null
}

// 한 프레임 진행. inputs[id] 없는 사람은 손 놓은 것으로.
// judge = false(온라인 참가자 화면): 움직임만 돌리고 판정(맞음·KO·판 끝)은 건너뛴다 — 방장 소식으로 맞춘다(brawlNet)
export function step(s: BrawlState, inputs: Record<string, Input>, dt = DT, judge = true): BrawlState {
  if (s.over) return s
  s.fx = { hits: [], kos: [] }
  s.time += dt
  const before = new Map(s.platforms.map(p => [p.id, p]))
  s.platforms = platformsAt(s.map, s.time)
  const ice = BRAWL_MAPS[s.map].ice
  const wind = windAt(s.map, s.time).acc
  // 움직이는·출렁이는 판에 서 있으면 판과 같이 움직인다
  for (const f of s.fighters) {
    if (!f.ground || f.on === null) continue
    const a = before.get(f.on), b = s.platforms.find(p => p.id === f.on)
    if (a && b) { f.x += b.x0 - a.x0; f.y = b.y } else { f.ground = false; f.on = null }
  }
  const live = s.fighters.filter(alive)

  for (const f of live) {
    const inp = inputs[f.id] ?? NO_INPUT
    const pv = s.prev[f.id] ?? NO_INPUT
    const pressed = (k: keyof Input) => inp[k] && !pv[k]
    f.t += dt
    f.invuln = Math.max(0, f.invuln - dt)
    f.guardCd = Math.max(0, f.guardCd - dt)

    // 동작 끝남
    if (f.act === 'jab' && f.t >= JAB.startup + JAB.active + JAB.recover) { f.act = 'idle'; f.t = 0 }
    if (f.act === 'strong' && f.t >= STRONG.startup + STRONG.active + STRONG.recover) { f.act = 'idle'; f.t = 0; f.charge = 0 }
    if (f.act === 'stun') { f.stun -= dt; if (f.stun <= 0) { f.act = 'idle'; f.t = 0 } }

    // 가드(↓, 땅에서): 오래 들면 풀리고 잠깐 못 듦
    if (f.act === 'guard') {
      f.guardT += dt
      if (!inp.down || !f.ground || f.guardT > GUARD_MAX) { if (f.guardT > GUARD_MAX) f.guardCd = GUARD_COOLDOWN; f.act = 'idle'; f.t = 0 }
    } else if (!busy(f) && f.act !== 'charge' && inp.down && f.ground && f.guardCd <= 0) { f.act = 'guard'; f.t = 0; f.guardT = 0 }

    // 강펀치: 공격 키를 누르고 있는 동안 모으고, 떼면 지른다. 한 키(attack)는 TAP초 안에 떼면 잽
    if (f.act === 'charge') {
      const lead = f.chargeKey === 'attack' ? TAP : 0
      f.charge = Math.max(0, Math.min(1, (f.t - lead) / STRONG.maxCharge))
      if (!inp[f.chargeKey]) {
        if (f.chargeKey === 'attack' && f.t < TAP) { f.act = 'jab'; f.t = 0; f.hitDone = false; f.charge = 0 }
        else { f.act = 'strong'; f.t = 0; f.hitDone = false }
      }
    } else if (!busy(f) && f.act !== 'guard' && (pressed('strong') || pressed('attack'))) { f.chargeKey = pressed('attack') ? 'attack' : 'strong'; f.act = 'charge'; f.t = 0; f.charge = 0 }
    // 잽
    if (!busy(f) && f.act !== 'guard' && f.act !== 'charge' && pressed('jab')) { f.act = 'jab'; f.t = 0; f.hitDone = false }

    // 좌우
    const canMove = f.act === 'idle' || f.act === 'charge' || (f.act === 'jab' && !f.ground)
    const dir = canMove ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0
    if (dir && !isCharging(f) && f.act !== 'jab') f.facing = dir as 1 | -1
    const want = dir * RUN * (isCharging(f) ? 0.35 : 1)
    const acc = f.ground ? (ice ? ACC_GROUND * 0.22 : ACC_GROUND) : ACC_AIR
    const fric = f.ground ? (ice ? FRIC_GROUND * 0.1 : FRIC_GROUND) : 300
    if (f.act === 'stun') { /* 날아가는 중엔 조종 불가 */ }
    else if (dir) f.vx += Math.max(-acc * dt, Math.min(acc * dt, want - f.vx))
    else f.vx -= Math.sign(f.vx) * Math.min(Math.abs(f.vx), fric * dt)
    if (f.act === 'guard' && f.ground) f.vx -= Math.sign(f.vx) * Math.min(Math.abs(f.vx), FRIC_GROUND * dt)
    // 돌풍: 땅에선 마찰과 상관없이 천천히 밀리고(초당 약 53px — 걸으면 버팀, 가드하면 1/4), 공중에선 크게 밀림
    if (wind) { if (f.ground) f.x += wind * 0.07 * dt * (f.act === 'guard' ? 0.25 : 1); else f.vx += wind * dt }

    // 점프(땅 1번 + 공중 1번)
    if (pressed('up') && (f.act === 'idle' || f.act === 'jab' || f.act === 'charge')) {
      if (f.act === 'charge') { f.act = 'idle'; f.t = 0; f.charge = 0 } // 점프하면 모으기는 풀린다(떨어질 때 살아날 수 있게)
      if (f.ground) { f.vy = -JUMP_V; f.ground = false }
      else if (f.airJumps > 0) { f.airJumps--; f.vy = -AIR_JUMP_V }
    }

    // 중력·이동·착지
    f.vy = Math.min(MAX_FALL * (f.act === 'stun' ? 1.6 : 1), f.vy + GRAV * dt)
    const yPrev = f.y
    f.x += f.vx * dt
    f.y += f.vy * dt
    if (f.vy >= 0) {
      const p = landOn(s.platforms, f.x, yPrev, f.y)
      if (p) { f.y = p.y; f.vy = 0; f.ground = true; f.airJumps = 1; f.on = p.id } else f.ground = false
    } else f.ground = false
    if (f.ground && !groundUnder(s.platforms, f.x, f.y)) f.ground = false
    if (!f.ground) f.on = null
  }

  // 맞았는지
  if (judge) for (const a of live) {
    const box = punchBox(a)
    if (!box || a.hitDone) continue
    for (const d of live) {
      if (d === a || d.invuln > 0 || d.act === 'out') continue
      if ((box.x - d.x) ** 2 + (box.y - bodyY(d)) ** 2 > (box.r + HURT_R) ** 2) continue
      a.hitDone = true
      const guarding = d.act === 'guard' && d.facing === -a.facing
      let dmg = box.strong ? strongDmg(a.charge) : JAB.dmg
      let mult = 1
      if (isCharging(d)) { dmg = Math.round(dmg * CHARGE_HIT_MULT); mult = 1.3 }
      if (guarding) {
        if (!box.strong) { dmg = 0; mult = 0.15 }
        else { dmg = Math.round(dmg * 0.4); mult = 0.5; d.act = 'stun'; d.stun = 0.35; d.guardCd = GUARD_COOLDOWN } // 강펀치는 가드를 깬다
      }
      d.pct = Math.min(999, d.pct + dmg)
      const base = box.strong ? strongBase(a.charge) : JAB.base
      const grow = box.strong ? strongGrow(a.charge) : JAB.grow
      const v = (base + grow * d.pct) * mult
      const ang = ((box.strong ? 38 : 30) * Math.PI) / 180
      d.vx = a.facing * v * Math.cos(ang)
      d.vy = -v * Math.sin(ang) - (d.ground ? 80 : 0)
      d.ground = false
      d.lastHitBy = a.id
      if (!guarding || box.strong) {
        if (!guarding) { d.act = 'stun'; d.stun = Math.min(1.1, 0.12 + v / 1500); d.charge = 0 }
        d.t = 0
      }
      s.fx.hits.push({ x: box.x, y: box.y, strong: box.strong, guard: guarding, big: v > 900 })
      break
    }
  }

  if (!judge) { s.prev = { ...inputs }; return s }
  // 무대 밖 → 목숨 하나
  for (const f of live) {
    if (f.y > BH + 90 || f.x < -160 || f.x > BW + 160 || f.y < -700) {
      s.fx.kos.push({ id: f.id, x: Math.max(0, Math.min(BW, f.x)), y: Math.max(0, Math.min(BH, f.y)) })
      f.lives--
      if (f.lives > 0) respawn(s, f)
      else { f.act = 'out'; f.outAt = s.time; f.vx = 0; f.vy = 0 }
    }
  }

  // 판 끝
  const left = s.fighters.filter(alive)
  const timeUp = s.time >= TIME_LIMIT
  if (left.length <= 1 || timeUp) {
    // 등수: 남은 사람(시간 초과면 목숨 많고 % 낮은 순) → 늦게 떨어진 순
    const rank = [...left].sort((a, b) => b.lives - a.lives || a.pct - b.pct)
    const outs = s.fighters.filter(f => !alive(f)).sort((a, b) => (b.outAt ?? 0) - (a.outAt ?? 0))
    ;[...rank, ...outs].forEach((f, i) => { f.place = i + 1 })
    s.winner = rank[0]?.id ?? outs[0]?.id ?? null
    s.over = true
  }
  s.prev = { ...inputs }
  return s
}

// ── 🤖 CPU ─────────────────────────────────────────
// 가까운 상대에게 다가가 잽·강펀치. 낭떠러지 끝에선 멈추고, 떨어지면 판 쪽으로 점프해 돌아온다.
export type CpuMind = { next: number; hold: number; guard: number; crossTo: number | null; rng: () => number }
export const newCpuMind = (seed: number): CpuMind => ({ next: 0, hold: 0, guard: 0, crossTo: null, rng: mulberry32(seed) })

export function cpuInput(s: BrawlState, id: string, mind: CpuMind, level = 0.6): Input {
  const me = s.fighters.find(f => f.id === id)
  if (!me || !alive(me) || s.over) return NO_INPUT
  return brake(s, me, cpuDecide(s, me, id, mind, level))
}
// 미끄러짐 브레이크: 지금 속도로 멈추는 데 드는 거리보다 끝이 가까우면 반대로(빙판은 150px 넘게 미끄러진다). 어떤 판단 뒤에도 마지막에 적용
function brake(s: BrawlState, me: Fighter, inp: Input): Input {
  if (!me.ground || me.act === 'stun') return inp
  const under = groundUnder(s.platforms, me.x, me.y)
  if (!under) return inp
  const ice = BRAWL_MAPS[s.map].ice
  const decel = ice ? ACC_GROUND * 0.22 + FRIC_GROUND * 0.1 : ACC_GROUND
  const stopDist = (me.vx * me.vx) / (2 * decel)
  // 돌풍이 낭떠러지 쪽으로 불면 바람을 거슬러 걷는다(예고 중에도)
  const wd = windAt(s.map, s.time)
  const wdir = Math.sign(wd.acc || wd.warn)
  if (wdir > 0 && under.x1 - me.x < 110) return { ...inp, right: false, left: true }
  if (wdir < 0 && me.x - under.x0 < 110) return { ...inp, left: false, right: true }
  if (me.vx > 20 && under.x1 - me.x < stopDist + 30) return { ...inp, right: false, left: true, strong: me.act === 'charge' ? false : inp.strong }
  if (me.vx < -20 && me.x - under.x0 < stopDist + 30) return { ...inp, left: false, right: true, strong: me.act === 'charge' ? false : inp.strong }
  return inp
}
function cpuDecide(s: BrawlState, me: Fighter, id: string, mind: CpuMind, level: number): Input {
  const inp: Input = { ...NO_INPUT }
  const plats = s.platforms
  const under = groundUnder(plats, me.x, me.y)
  const mains = plats.filter(p => p.main)
  const home = (mains.length ? mains : plats).reduce((a, b) => (Math.abs((b.x0 + b.x1) / 2 - me.x) < Math.abs((a.x0 + a.x1) / 2 - me.x) ? b : a), (mains.length ? mains : plats)[0])

  if (me.ground) mind.crossTo = null
  // 복귀: 발밑에 판이 없으면 판 쪽으로 + 내려가는 중에 점프. 건너뛰는 중이면(뛰어오른 직후 아직 내 판 위여도) 건너편 판 쪽으로
  if (!me.ground && (!under || mind.crossTo !== null)) {
    const goal = mind.crossTo !== null ? plats.find(p => mind.crossTo! >= p.x0 && mind.crossTo! <= p.x1) ?? home : home
    if (!goal) return inp
    const cx = mind.crossTo ?? (goal.x0 + goal.x1) / 2
    const home2 = goal
    if (me.x < home2.x0 + 20) inp.right = true
    else if (me.x > home2.x1 - 20) inp.left = true
    else if (me.x < cx - 30) inp.right = true
    else if (me.x > cx + 30) inp.left = true
    const prevUp = s.prev[id]?.up ?? false
    if (!prevUp && me.airJumps > 0 && ((mind.crossTo !== null && me.vy > 0) || (me.vy > 60 && me.y > home2.y - 60))) inp.up = true
    return inp
  }

  const foes = s.fighters.filter(f => f.id !== id && alive(f) && f.act !== 'out')
  if (!foes.length) return inp
  const t = foes.reduce((a, b) => (Math.abs(b.x - me.x) + Math.abs(b.y - me.y) * 0.5 < Math.abs(a.x - me.x) + Math.abs(a.y - me.y) * 0.5 ? b : a))
  const dx = t.x - me.x, dy = t.y - me.y
  const edgeL = under ? me.x - under.x0 : 999, edgeR = under ? under.x1 - me.x : 999

  // 강펀치 모으는 중: 정해 둔 만큼 잡고 있다가 뗀다
  if (me.act === 'charge') {
    if (me.t < mind.hold && Math.abs(dx) < 120) inp.strong = true
    if (Math.sign(dx) !== me.facing && Math.abs(dx) > 10) { /* 등 뒤로 가면 그냥 지름 */ }
    return inp
  }
  // 가드 유지
  if (mind.guard > s.time) { inp.down = true; return inp }

  if (s.time < mind.next) {
    // 생각 사이엔 이동만
  } else {
    mind.next = s.time + 0.12 + (1 - level) * 0.25 + mind.rng() * 0.12
    const close = Math.abs(dx) < 52 && Math.abs(dy) < 50
    const threat = (t.act === 'charge' && Math.abs(dx) < 90) || (t.act === 'strong' && t.t < STRONG.startup && Math.abs(dx) < 70)
    if (threat && mind.rng() < 0.35 * level + 0.1 && me.ground) { mind.guard = s.time + 0.3 + mind.rng() * 0.3; inp.down = true; return inp }
    if (close && me.facing === Math.sign(dx)) {
      if (mind.rng() < 0.32) { mind.hold = 0.25 + mind.rng() * 0.6; inp.strong = true; return inp }
      inp.jab = true
      return inp
    }
    if (dy < -60 && Math.abs(dx) < 120 && me.ground && mind.rng() < 0.5) inp.up = true
  }
  // 상대가 건너편 판에 있으면 끝에서 뛰어 건넌다(다리가 끊긴 뒤 등)
  const tPlat = t.ground ? groundUnder(plats, t.x, t.y) : null
  if (under && tPlat && tPlat !== under && me.ground && Math.abs(t.y - me.y) < 40) {
    const toward = t.x > me.x ? 1 : -1
    const edge = toward > 0 ? edgeR : edgeL
    if (edge < 34 && !(s.prev[id]?.up)) {
      // 상대 판이 아니라 그 방향 바로 옆 판으로(섬 여러 개를 한 번에 건너뛰려다 떨어지지 않게)
      const next = plats.filter(p => p !== under && (toward > 0 ? p.x0 >= under.x1 - 5 : p.x1 <= under.x0 + 5))
        .sort((a, b) => (toward > 0 ? a.x0 - b.x0 : b.x1 - a.x1))[0] ?? tPlat
      mind.crossTo = toward > 0 ? next.x0 + 50 : next.x1 - 50
      inp.up = true; if (toward > 0) inp.right = true; else inp.left = true; return inp
    }
    if (toward > 0) inp.right = true; else inp.left = true
    return inp
  }
  // 다가가기(낭떠러지 끝 앞에서는 멈춤)
  if (Math.abs(dx) > 40) {
    if (dx > 0 && edgeR > 26) inp.right = true
    if (dx < 0 && edgeL > 26) inp.left = true
  } else if (Math.sign(dx) !== me.facing && dx !== 0) {
    if (dx > 0) inp.right = true; else inp.left = true // 몸만 돌림
  }
  // 무너지는 끝에 서 있으면 안쪽으로
  if (edgeL < 18) { inp.right = true; inp.left = false }
  if (edgeR < 18) { inp.left = true; inp.right = false }
  return inp
}
