// 운동장 🏎 퇴근 레이싱 — 순수 로직(그리기·통신 없음, 테스트 가능).
// 위에서 본 도로가 왼쪽→오른쪽으로 흐른다. 카트는 자동으로 달리고 ↑↓로 차선을 바꾼다.
//   🚧 고깔 = 부딪히면 빙글(감속)   🛢 기름 = 잠깐 미끄러짐   ⏩ 부스터 발판 = 순간 가속
//   ❓ 아이템 상자 = 🚀 부스터 / 🍌 바나나(뒤에 떨굼) / 📧 업무 메일(바로 앞사람 멈춤) 중 하나
// 코스는 레이스 시드로 만들어서 모두에게 같다. 각자 자기 카트만 계산하고 위치를 방송한다(CPU는 방장 PC가 계산).

export const RACE_LEN = 9000 // 결승선까지(px)
export const ROAD_TOP = 64
export const ROAD_BOT = 300

export const KART_HX = 17
export const KART_HY = 10
export const V_MAX = 430
export const V_BOOST = 660
export const ACCEL = 240
export const STEER = 230 // ↑↓ px/초
export const SPIN_MS = 900
export const SLIP_MS = 700
export const PAD_BOOST_MS = 1000
export const ROCKET_MS = 1600
export const STUN_MS = 1100
export const ROLL_MS = 250 // 아이템 상자 룰렛(짧게 — 바로 확인되게)
export const MAIL_FLIGHT_MS = 650
export const RACE_TIMEOUT_MS = 70_000
export const COUNTDOWN_MS = 3000
export const LOBBY_MS = 12_000 // 레이스 열고 참가 받는 시간

export type Item = 'rocket' | 'banana' | 'mail'
export const ITEMS: Record<Item, { emoji: string; name: string }> = {
  rocket: { emoji: '🚀', name: '부스터' },
  banana: { emoji: '🍌', name: '바나나' },
  mail: { emoji: '📧', name: '업무 메일' },
}

export type ThingKind = 'cone' | 'oil' | 'pad' | 'box'
export type Thing = { id: number; kind: ThingKind; x: number; y: number; r: number }
export type Banana = { id: string; x: number; y: number; owner: string }

export type Kart = {
  x: number; y: number; v: number
  spinUntil: number; slipUntil: number; slipDir: number; boostUntil: number; stunUntil: number
  item: Item | null; rollUntil: number; rolling: Item | null
  taken: number[] // 이미 먹은 상자 id(내 화면에서만 사라진다)
  hitIds: number[] // 이미 부딪힌 고깔·기름(같은 것에 두 번 안 걸리게)
  finishedAt: number | null // 레이스 시각(ms)
}

export function rng(seed: number) {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const laneY = (i: number) => ROAD_TOP + 30 + i * ((ROAD_BOT - ROAD_TOP - 60) / 3)
export const LANE_Y = [0, 1, 2, 3].map(laneY)

// 코스: 400~600px마다 한 줄씩 — 고깔/기름/발판, 1800px쯤마다 아이템 상자 줄. 한 줄에 최소 한 차선은 비워 둔다.
export function makeTrack(seed: number): Thing[] {
  const r = rng(seed)
  const out: Thing[] = []
  let id = 0
  let nextBox = 900
  for (let x = 700; x < RACE_LEN - 350; x += 380 + r() * 220) {
    if (x >= nextBox) {
      for (let i = 0; i < 4; i++) out.push({ id: id++, kind: 'box', x, y: LANE_Y[i], r: 13 })
      nextBox = x + 1500 + r() * 600
      continue
    }
    const roll = r()
    const lanes = [0, 1, 2, 3].sort(() => r() - 0.5)
    if (roll < 0.55) {
      const n = r() < 0.45 ? 2 : 1
      for (let k = 0; k < n; k++) out.push({ id: id++, kind: 'cone', x: x + k * 30, y: LANE_Y[lanes[k]] + (r() - 0.5) * 16, r: 12 })
    } else if (roll < 0.8) {
      out.push({ id: id++, kind: 'oil', x, y: LANE_Y[lanes[0]], r: 20 })
      if (r() < 0.4) out.push({ id: id++, kind: 'cone', x: x + 60, y: LANE_Y[lanes[1]], r: 12 })
    } else {
      out.push({ id: id++, kind: 'pad', x, y: LANE_Y[lanes[0]], r: 18 })
    }
  }
  return out
}

export function startGrid(i: number): { x: number; y: number } {
  return { x: 120 - Math.floor(i / 4) * 50, y: LANE_Y[i % 4] }
}

export function newKart(i: number): Kart {
  const g = startGrid(i)
  return { ...g, v: 0, spinUntil: 0, slipUntil: 0, slipDir: 0, boostUntil: 0, stunUntil: 0, item: null, rollUntil: 0, rolling: null, taken: [], hitIds: [], finishedAt: null }
}

const touches = (k: { x: number; y: number }, t: { x: number; y: number; r: number }) =>
  Math.abs(k.x - t.x) < KART_HX + t.r * 0.8 && Math.abs(k.y - t.y) < KART_HY + t.r * 0.8

export const disabled = (k: Kart, t: number) => t < k.spinUntil || t < k.stunUntil

// 순위대로 아이템 확률이 다르다 — 뒤에 있을수록 🚀·📧, 1등은 🍌 위주
export function pickItem(rank: number, total: number, rand: () => number): Item {
  const behind = total <= 1 ? 0.5 : rank / (total - 1) // 0 = 1등, 1 = 꼴찌
  const pRocket = 0.2 + 0.35 * behind
  const pMail = total <= 1 ? 0.25 : rank === 0 ? 0.05 : 0.2 + 0.2 * behind
  const u = rand()
  return u < pRocket ? 'rocket' : u < pRocket + pMail ? 'mail' : 'banana'
}

export type StepEvent =
  | { type: 'spin'; by: 'cone' | 'banana'; bananaId?: string }
  | { type: 'slip' }
  | { type: 'pad' }
  | { type: 'box' }
  | { type: 'finish' }

// 한 스텝(dt ms). t = 레이스 시각(ms, 출발=0). 출발 전(t<0)엔 서 있는다.
export function kartStep(k: Kart, steer: -1 | 0 | 1, t: number, dt: number, track: Thing[], bananas: Banana[], rank: number, total: number, rand: () => number): { k: Kart; events: StepEvent[] } {
  const events: StepEvent[] = []
  if (t < 0 || k.finishedAt !== null) {
    // 결승 뒤엔 천천히 멈춘다
    if (k.finishedAt !== null) k = { ...k, v: Math.max(0, k.v - 400 * dt / 1000), x: k.x + k.v * dt / 1000 }
    return { k, events }
  }
  const s = dt / 1000
  let { x, y, v, item, rolling } = k
  const rollUntil = k.rollUntil
  const off = disabled(k, t)
  const slipping = t < k.slipUntil
  const boosting = t < k.boostUntil
  // 속도
  if (off) v = Math.max(0, v - 500 * s)
  else if (boosting) v = Math.max(v, V_BOOST - 40) + ACCEL * s
  else v = v + (v < V_MAX ? ACCEL : -300) * s
  v = Math.min(v, boosting ? V_BOOST : Math.max(V_MAX, v))
  // 조향 — 미끄러지는 중엔 키가 안 먹고 한쪽으로 흘러간다
  const dy = off ? 0 : slipping ? k.slipDir * STEER * 0.8 : steer * STEER
  y = Math.max(ROAD_TOP + KART_HY + 4, Math.min(ROAD_BOT - KART_HY - 4, y + dy * s))
  x = x + v * s
  let next: Kart = { ...k, x, y, v }
  // 아이템 룰렛 끝
  if (rolling && t >= rollUntil) { item = rolling; rolling = null; next = { ...next, item, rolling } }
  // 부딪힘
  for (const th of track) {
    if (th.x < x - 60 || th.x > x + 60) continue
    if (!touches(next, th)) continue
    if (th.kind === 'box') {
      if (next.taken.includes(th.id)) continue
      // 같은 줄 상자는 한 번에 하나만
      const row = track.filter(o => o.kind === 'box' && o.x === th.x).map(o => o.id)
      next = { ...next, taken: [...next.taken, ...row] }
      if (!next.item && !next.rolling) { next = { ...next, rolling: pickItem(rank, total, rand), rollUntil: t + ROLL_MS }; events.push({ type: 'box' }) }
      continue
    }
    if (next.hitIds.includes(th.id)) continue
    next = { ...next, hitIds: [...next.hitIds, th.id] }
    if (th.kind === 'pad') { next = { ...next, boostUntil: Math.max(next.boostUntil, t + PAD_BOOST_MS) }; events.push({ type: 'pad' }) }
    else if (off) continue
    else if (th.kind === 'cone') { next = { ...next, spinUntil: t + SPIN_MS, v: next.v * 0.3, boostUntil: 0 }; events.push({ type: 'spin', by: 'cone' }) }
    else if (th.kind === 'oil') { next = { ...next, slipUntil: t + SLIP_MS, slipDir: rand() < 0.5 ? -1 : 1, v: next.v * 0.6 }; events.push({ type: 'slip' }) }
  }
  if (!disabled(next, t)) {
    for (const b of bananas) {
      if (touches(next, { ...b, r: 11 })) { next = { ...next, spinUntil: t + SPIN_MS, v: next.v * 0.3, boostUntil: 0 }; events.push({ type: 'spin', by: 'banana', bananaId: b.id }); break }
    }
  }
  if (next.x >= RACE_LEN && next.finishedAt === null) { next = { ...next, finishedAt: t }; events.push({ type: 'finish' }) }
  return { k: next, events }
}

// 아이템 쓰기 — 🚀는 바로, 🍌는 뒤에 떨굼, 📧는 대상 고르기(바로 앞사람, 내가 1등이면 바로 뒷사람)
export function fireItem(k: Kart, t: number): { k: Kart; used: Item | null } {
  if (!k.item || disabled(k, t) || k.finishedAt !== null) return { k, used: null }
  const used = k.item
  let next: Kart = { ...k, item: null }
  if (used === 'rocket') next = { ...next, boostUntil: Math.max(next.boostUntil, t + ROCKET_MS), v: Math.max(next.v, V_BOOST - 40) }
  return { k: next, used }
}

export function bananaDrop(k: Kart): { x: number; y: number } {
  return { x: k.x - KART_HX - 16, y: k.y }
}

export function mailTarget(me: string, racers: { id: string; x: number; done: boolean }[]): string | null {
  const mine = racers.find(r => r.id === me)
  if (!mine) return null
  const live = racers.filter(r => r.id !== me && !r.done)
  const ahead = live.filter(r => r.x > mine.x).sort((a, b) => a.x - b.x)
  if (ahead.length) return ahead[0].id
  const behind = live.filter(r => r.x <= mine.x).sort((a, b) => b.x - a.x)
  return behind[0]?.id ?? null
}

export function stunKart(k: Kart, t: number): Kart {
  return { ...k, stunUntil: t + STUN_MS, v: k.v * 0.25, boostUntil: 0 }
}

// 순위: 완주한 사람(빠른 순) → 달리는 중(앞선 순)
export function ranking<T extends { x: number; finishedAt: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.x - a.x
  })
}

// CPU 조향: 앞 260px 안 고깔·기름·바나나를 피해서, 상자·발판 쪽으로. 가끔(실수) 늦게 반응.
export type CpuMem = { target: number; nextThink: number; useAt: number; skill: number }
export function newCpu(rand: () => number): CpuMem {
  return { target: Math.floor(rand() * 4), nextThink: 0, useAt: 0, skill: 0.7 + rand() * 0.25 }
}
export function cpuSteer(k: Kart, mem: CpuMem, t: number, track: Thing[], bananas: Banana[], rand: () => number): { steer: -1 | 0 | 1; use: boolean } {
  if (t >= mem.nextThink) {
    mem.nextThink = t + 180 + rand() * 200
    const look = 140 + mem.skill * 160
    const danger = [0, 0, 0, 0]
    const bonus = [0, 0, 0, 0]
    const near = (y: number) => LANE_Y.reduce((b, ly, i) => (Math.abs(ly - y) < Math.abs(LANE_Y[b] - y) ? i : b), 0)
    for (const th of track) {
      if (th.x < k.x || th.x > k.x + look) continue
      const li = near(th.y)
      if (th.kind === 'cone' || th.kind === 'oil') danger[li] += 3
      else if (th.kind === 'pad') bonus[li] += 1.5
      else if (th.kind === 'box' && !k.item && !k.taken.includes(th.id)) bonus[li] += 0.5
    }
    for (const b of bananas) if (b.x > k.x && b.x < k.x + look) danger[near(b.y)] += 3
    const cur = near(k.y)
    const score = (i: number) => danger[i] * 2 - bonus[i] + Math.abs(i - cur) * 0.6 + (i === mem.target ? -0.3 : 0)
    if (rand() < mem.skill) mem.target = [0, 1, 2, 3].reduce((b, i) => (score(i) < score(b) ? i : b), mem.target)
  }
  const ty = LANE_Y[mem.target]
  const steer: -1 | 0 | 1 = Math.abs(ty - k.y) < 6 ? 0 : ty < k.y ? -1 : 1
  let use = false
  if (k.item) {
    if (!mem.useAt) mem.useAt = t + 500 + rand() * 2500
    if (t >= mem.useAt) { use = true; mem.useAt = 0 }
  }
  return { steer, use }
}
