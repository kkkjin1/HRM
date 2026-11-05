// 운동장 💥 결재 포격전 — 순수 로직(차례제 포물선 포격, 1:1 / 2:2).
// 방장(host) PC가 판정한다: 차례인 사람이 각도·힘·무기를 보내면(fire) host가 resolveShot()으로 결과(구덩이·피해·다음 차례)를 계산해
// 방송하고, 모두 같은 궤적을 그리고 나서 결과 상태로 넘어간다. 지형은 seed + 구덩이 목록으로 누구나 똑같이 다시 만든다.
// 화면은 components/playground/FortArena.tsx, 방 모집은 lib/useFortRooms.ts, 전적·꾸미기 저장은 lib/useFortProfile.ts.

import { H, W } from '@/lib/playground'

export const FORT_PROTO = 1 // 규칙(무기·지형·물리)을 바꾸면 올린다 — 버전 다르면 같은 방에 못 들어감
export type FortMode = '1v1' | '2v2'
export type Team = 'A' | 'B'
export type WeaponKey = 'clip' | 'mail' | 'reject' | 'bomb' | 'coffee'
export type SkinKey = 'desk' | 'cabinet' | 'water' | 'plant' | 'copier' | 'server'
export type FortTheme = 'office' | 'workshop' | 'road'

export const TEAM_COLOR: Record<Team, string> = { A: '#2563EB', B: '#E11D48' }
export const TEAM_NAME: Record<Team, string> = { A: '파랑팀', B: '빨강팀' }

// uses: -1 = 무제한
export const WEAPONS: Record<WeaponKey, { name: string; emoji: string; dmg: number; r: number; uses: number; push?: number; heal?: number; help: string }> = {
  clip: { name: '클립 뭉치', emoji: '📎', dmg: 45, r: 30, uses: -1, help: '기본 포탄' },
  mail: { name: '메일 폭탄', emoji: '📧', dmg: 22, r: 20, uses: 2, help: '가장 높이 올라간 순간 3갈래로 갈라짐' },
  reject: { name: '반려 서류', emoji: '📑', dmg: 12, r: 22, uses: 2, push: 95, help: '맞은 근처를 멀리 밀어냄 — 화면 밖으로 밀리면 탈락' },
  bomb: { name: '야근 폭탄', emoji: '💣', dmg: 60, r: 44, uses: 1, help: '크게 터지고 땅도 크게 파임' },
  coffee: { name: '아아 한 잔', emoji: '☕', dmg: 0, r: 0, uses: 1, heal: 30, help: '쏘지 않고 내 체력 +30 (차례 사용)' },
}
export const WEAPON_ORDER: WeaponKey[] = ['clip', 'mail', 'reject', 'bomb', 'coffee']

// ── 컨셉(판마다 바뀜) — 배경·지형·요새·던지는 것이 한 세트. 규칙(피해·반경·개수)은 무기 칸(WeaponKey)마다 같고 이름·그림만 다르다.
// 요새 꾸미기(SkinKey)는 6단계 그대로, 컨셉마다 다른 물건으로 그린다(회사 책상 = 워크샵 돗자리 = 도로 경차 …).
export const THEMES: Record<FortTheme, {
  name: string; emoji: string; wind: string; place: (seed: number) => string
  weapons: Record<WeaponKey, { name: string; emoji: string }>
  skins: Record<SkinKey, string>
}> = {
  office: {
    name: '사무실', emoji: '🏢', wind: '에어컨 바람', place: () => '본사 3층 사무실',
    weapons: {
      clip: { name: '클립 뭉치', emoji: '📎' }, mail: { name: '메일 폭탄', emoji: '📧' }, reject: { name: '반려 서류', emoji: '📑' },
      bomb: { name: '야근 폭탄', emoji: '💣' }, coffee: { name: '아아 한 잔', emoji: '☕' },
    },
    skins: { desk: '기본 책상', cabinet: '서류 캐비닛', water: '정수기', plant: '화분 책상', copier: '복합기', server: '서버랙' },
  },
  workshop: {
    name: '워크샵', emoji: '🏕️', wind: '산바람', place: seed => (['가평 펜션', '양평 캠핑장', '춘천 강변'] as const)[seed % 3],
    weapons: {
      clip: { name: '김밥 한 줄', emoji: '🍙' }, mail: { name: '케이크 폭탄', emoji: '🎂' }, reject: { name: '족구공', emoji: '🏐' },
      bomb: { name: '수박', emoji: '🍉' }, coffee: { name: '이온음료', emoji: '🥤' },
    },
    skins: { desk: '돗자리', cabinet: '아이스박스', water: '텐트', plant: '캠핑 의자', copier: '바베큐 그릴', server: '캠핑카' },
  },
  road: {
    name: '도로', emoji: '🚦', wind: '빌딩 바람', place: seed => (['강남대로', '판교 테크노밸리', '테헤란로'] as const)[seed % 3],
    weapons: {
      clip: { name: '타이어', emoji: '🛞' }, mail: { name: '라바콘 3개', emoji: '🚧' }, reject: { name: '킥보드', emoji: '🛴' },
      bomb: { name: '공사 벽돌', emoji: '🧱' }, coffee: { name: '편의점 커피', emoji: '🧋' },
    },
    skins: { desk: '경차', cabinet: '택시', water: '버스 정류장', plant: '푸드트럭', copier: '광역버스', server: '스포츠카' },
  },
}
export const THEME_ORDER: FortTheme[] = ['office', 'workshop', 'road']
export const themeOfSeed = (seed: number): FortTheme => THEME_ORDER[Math.floor(seed / 2) % 3]
export const weaponLook = (theme: FortTheme, w: WeaponKey) => THEMES[theme].weapons[w]

// 책상 요새 꾸미기 — 잠금 조건(전적)
export const SKINS: Record<SkinKey, { name: string; emoji: string; need: { games?: number; wins?: number } }> = {
  desk: { name: '기본 책상', emoji: '🖥️', need: {} },
  cabinet: { name: '서류 캐비닛', emoji: '🗄️', need: {} },
  water: { name: '정수기', emoji: '🚰', need: { games: 1 } },
  plant: { name: '화분 책상', emoji: '🪴', need: { games: 5 } },
  copier: { name: '복합기', emoji: '🖨️', need: { wins: 3 } },
  server: { name: '서버랙', emoji: '🗃️', need: { wins: 10 } },
}
export const SKIN_ORDER: SkinKey[] = ['desk', 'cabinet', 'water', 'plant', 'copier', 'server']
export function skinUnlocked(skin: SkinKey, rec: { games: number; wins: number } | null) {
  const n = SKINS[skin].need
  return (n.games ?? 0) <= (rec?.games ?? 0) && (n.wins ?? 0) <= (rec?.wins ?? 0)
}
export function skinNeedText(skin: SkinKey) {
  const n = SKINS[skin].need
  return n.wins ? `${n.wins}승` : n.games ? `${n.games}판` : ''
}

// ── 숫자 ─────────────────────────────────────────
export const TSTEP = 2 // 지형 칸 너비(px)
export const TCOLS = W / TSTEP
export const MAX_HP = 100
export const BODY_H = 18 // 요새 높이
export const HIT_R = 14 // 요새 맞는 반경(몸 가운데 기준)
export const GRAV = 260
export const V_MIN = 90
export const V_MAX = 520
export const WIND_ACC = 70 // 바람 1.0일 때 가로 가속(px/s²)
export const TURN_MS = 25000
export const START_DELAY_MS = 2500
export const AFTER_SHOT_MS = 900 // 터지고 나서 다음 차례까지 쉬는 시간
export const FUEL = 110 // 한 차례에 움직일 수 있는 거리(px)
export const MOVE_SPEED = 45
export const ELEV_SPEED = 40 // 각도 바꾸는 속도(도/초)
export const CHARGE_MS = 1600 // Space 꾹 → 힘 0→100%
export const MAX_TURNS = 30 // 넘으면 남은 체력 합으로 판정
const DT = 1 / 120
const SAMPLE_EVERY = 2 // 궤적 점은 2스텝(약 16ms)마다

// ── 타입 ─────────────────────────────────────────
export type FortPlayer = {
  id: string; team: Team; cpu: boolean; skin: SkinKey
  x: number; y: number; hp: number; alive: boolean; facing: 1 | -1; elev: number
  ammo: Record<WeaponKey, number>
  out: 'hp' | 'pushed' | 'fell' | null // 탈락 이유
}
export type Crater = { x: number; y: number; r: number }
export type FortState = {
  v: number; seed: number; mode: FortMode; theme: FortTheme; players: FortPlayer[]; order: string[]
  active: string; turnNo: number; wind: number; craters: Crater[]
  turnEndsAt: number // 서버 시각(ms)
  winner: Team | 'draw' | null; last: string | null
}
export type Shot = { id: string; x: number; facing: 1 | -1; elev: number; power: number; weapon: WeaponKey }
export type TrailPt = { t: number; x: number; y: number }
export type Blast = { x: number; y: number; r: number; t: number; weapon: WeaponKey }
export type HitFx = { id: string; dmg: number; t: number } // dmg < 0 = 회복
export type ShotResult = { trails: { emoji: string; pts: TrailPt[] }[]; blasts: Blast[]; hits: HitFx[]; endMs: number }

// ── 랜덤 ─────────────────────────────────────────
export function mulberry32(a: number) {
  let s = a >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function windFor(seed: number, turnNo: number) {
  const r = mulberry32((seed ^ Math.imul(turnNo + 1, 2654435761)) >>> 0)
  r()
  return Math.round((r() * 2 - 1) * 10) / 10
}

// ── 지형 ─────────────────────────────────────────
// 칸마다 땅 윗면의 y(화면 좌표, 클수록 낮음). H 이상 = 바닥까지 뚫린 구덩이(빠지면 탈락).
export function spawnXs(mode: FortMode): Record<Team, number[]> {
  return mode === '1v1' ? { A: [W * 0.15], B: [W * 0.85] } : { A: [W * 0.08, W * 0.27], B: [W * 0.73, W * 0.92] }
}
export function baseTerrain(seed: number, mode: FortMode): number[] {
  const r = mulberry32(seed)
  const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28
  const f1 = 0.006 + r() * 0.004, f2 = 0.014 + r() * 0.008, f3 = 0.03 + r() * 0.02
  const hill = 30 + r() * 45 // 가운데 서류 언덕 높이
  const t: number[] = []
  for (let i = 0; i < TCOLS; i++) {
    const x = i * TSTEP
    const y = H * 0.62 + 30 * Math.sin(x * f1 + p1) + 16 * Math.sin(x * f2 + p2) + 6 * Math.sin(x * f3 + p3) - hill * Math.exp(-(((x - W / 2) / 170) ** 2))
    t.push(Math.max(H * 0.3, Math.min(H * 0.88, y)))
  }
  // 요새 자리는 평평하게
  const sp = spawnXs(mode)
  for (const sx of [...sp.A, ...sp.B]) {
    const i0 = Math.max(0, Math.floor((sx - 18) / TSTEP)), i1 = Math.min(TCOLS - 1, Math.ceil((sx + 18) / TSTEP))
    let sum = 0
    for (let i = i0; i <= i1; i++) sum += t[i]
    const avg = sum / (i1 - i0 + 1)
    for (let i = Math.max(0, i0 - 8); i <= Math.min(TCOLS - 1, i1 + 8); i++) {
      const edge = i < i0 ? (i0 - i) / 8 : i > i1 ? (i - i1) / 8 : 0
      t[i] = avg * (1 - edge) + t[i] * edge
    }
  }
  return t
}
export function applyCrater(t: number[], c: Crater) {
  const i0 = Math.max(0, Math.floor((c.x - c.r) / TSTEP)), i1 = Math.min(TCOLS - 1, Math.ceil((c.x + c.r) / TSTEP))
  for (let i = i0; i <= i1; i++) {
    const dx = i * TSTEP - c.x
    if (Math.abs(dx) >= c.r) continue
    const bottom = c.y + Math.sqrt(c.r * c.r - dx * dx)
    if (bottom > t[i]) t[i] = Math.min(H + 40, bottom)
  }
}
export function terrainOf(seed: number, mode: FortMode, craters: Crater[]) {
  const t = baseTerrain(seed, mode)
  for (const c of craters) applyCrater(t, c)
  return t
}
export function groundAt(t: number[], x: number) {
  if (x < 0 || x > W) return H + 100
  const f = x / TSTEP
  const i = Math.min(TCOLS - 1, Math.floor(f))
  const j = Math.min(TCOLS - 1, i + 1)
  return t[i] + (t[j] - t[i]) * (f - i)
}
export const isPit = (y: number) => y >= H - 2

// 차례인 사람이 ←→로 움직일 때 — 너무 가파른 비탈은 못 오른다. 화면 끝 10px 안으로는 못 감.
export function moveAlong(t: number[], x: number, dir: -1 | 1, dist: number) {
  let cx = x
  let cy = groundAt(t, x)
  const steps = Math.floor(dist)
  for (let k = 0; k < steps; k++) {
    const nx = cx + dir
    if (nx < 10 || nx > W - 10) break
    const ny = groundAt(t, nx)
    if (cy - ny > 2.2) break // 오르막이 너무 가파름
    if (isPit(ny)) break // 구덩이로 걸어 들어가지 않게
    cx = nx; cy = ny
  }
  return cx
}

// ── 새 판 ────────────────────────────────────────
const fullAmmo = (): Record<WeaponKey, number> => ({ clip: -1, mail: WEAPONS.mail.uses, reject: WEAPONS.reject.uses, bomb: WEAPONS.bomb.uses, coffee: WEAPONS.coffee.uses })
export function newFortState(seed: number, mode: FortMode, roster: { id: string; team: Team; cpu: boolean; skin: SkinKey }[], now: number, theme: FortTheme = themeOfSeed(seed)): FortState {
  const t = baseTerrain(seed, mode)
  const sp = spawnXs(mode)
  const used: Record<Team, number> = { A: 0, B: 0 }
  const players: FortPlayer[] = roster.map(p => {
    const x = sp[p.team][used[p.team]++ % sp[p.team].length]
    return { id: p.id, team: p.team, cpu: p.cpu, skin: p.skin, x, y: groundAt(t, x), hp: MAX_HP, alive: true, facing: p.team === 'A' ? 1 : -1, elev: 45, ammo: fullAmmo(), out: null }
  })
  // 차례: 팀 번갈아(A1 B1 A2 B2), 누가 먼저인지는 seed로
  const a = players.filter(p => p.team === 'A'), b = players.filter(p => p.team === 'B')
  const first = seed % 2 === 0 ? [a, b] : [b, a]
  const order: string[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (first[0][i]) order.push(first[0][i].id)
    if (first[1][i]) order.push(first[1][i].id)
  }
  return {
    v: FORT_PROTO, seed, mode, theme, players, order, active: order[0], turnNo: 0, wind: windFor(seed, 0), craters: [],
    turnEndsAt: now + START_DELAY_MS + TURN_MS, winner: null, last: null,
  }
}

export function winnerOf(s: FortState): Team | 'draw' | null {
  const aliveA = s.players.some(p => p.team === 'A' && p.alive)
  const aliveB = s.players.some(p => p.team === 'B' && p.alive)
  if (aliveA && aliveB) return null
  return aliveA ? 'A' : aliveB ? 'B' : 'draw'
}
function hpWinner(s: FortState): Team | 'draw' {
  const sum = (tm: Team) => s.players.filter(p => p.team === tm && p.alive).reduce((a, p) => a + p.hp, 0)
  const a = sum('A'), b = sum('B')
  return a === b ? 'draw' : a > b ? 'A' : 'B'
}

// 다음 차례로(살아 있는 사람만). 판이 끝났으면 winner만 채운다.
export function advanceTurn(s0: FortState, endsAt: number): FortState {
  const s = { ...s0 }
  const w = winnerOf(s)
  if (w) { s.winner = w; return s }
  if (s.turnNo + 1 >= MAX_TURNS) { s.winner = hpWinner(s); s.last = `⏱ ${MAX_TURNS}차례 끝 — 남은 체력으로 판정`; return s }
  const idx = s.order.indexOf(s.active)
  for (let k = 1; k <= s.order.length; k++) {
    const id = s.order[(idx + k) % s.order.length]
    if (s.players.find(p => p.id === id)?.alive) { s.active = id; break }
  }
  s.turnNo = s.turnNo + 1
  s.wind = windFor(s.seed, s.turnNo)
  s.turnEndsAt = endsAt
  return s
}

// ── 포탄 날리기 ──────────────────────────────────
type FlyEnd = { pts: TrailPt[]; end: { x: number; y: number; t: number } | null; split: { x: number; y: number; vx: number; vy: number; t: number } | null }
const bodyY = (p: FortPlayer) => p.y - BODY_H / 2
function fly(t: number[], players: FortPlayer[], shooter: string, x0: number, y0: number, vx0: number, vy0: number, wind: number, t0: number, splitAtApex: boolean, record = true): FlyEnd {
  let x = x0, y = y0, vx = vx0, vy = vy0, tm = t0
  const pts: TrailPt[] = record ? [{ t: tm, x, y }] : []
  for (let step = 1; step < 14 / DT; step++) {
    const pvy = vy
    vx += wind * WIND_ACC * DT
    vy += GRAV * DT
    x += vx * DT
    y += vy * DT
    tm += DT * 1000
    if (record && step % SAMPLE_EVERY === 0) pts.push({ t: tm, x, y })
    if (x < -60 || x > W + 60 || y > H + 30) return { pts, end: null, split: null }
    if (splitAtApex && pvy < 0 && vy >= 0) return { pts, end: null, split: { x, y, vx, vy, t: tm } }
    if (x >= 0 && x <= W && y >= groundAt(t, x)) { if (record) pts.push({ t: tm, x, y }); return { pts, end: { x, y, t: tm }, split: null } }
    // 요새에 직접 맞음(쏜 사람은 처음 0.15초 동안 제외 — 포구에서 바로 맞지 않게)
    for (const p of players) {
      if (!p.alive || (p.id === shooter && tm - t0 < 150)) continue
      if ((x - p.x) ** 2 + (y - bodyY(p)) ** 2 <= HIT_R * HIT_R) { if (record) pts.push({ t: tm, x, y }); return { pts, end: { x, y, t: tm }, split: null } }
    }
  }
  return { pts, end: null, split: null }
}
export function muzzle(p: { x: number; y: number; facing: 1 | -1; elev: number }) {
  const a = (p.elev * Math.PI) / 180
  return { x: p.x + p.facing * 14 * Math.cos(a), y: p.y - BODY_H + 2 - 14 * Math.sin(a) }
}
function launch(p: { x: number; y: number; facing: 1 | -1; elev: number }, power: number) {
  const m = muzzle(p)
  const a = (p.elev * Math.PI) / 180
  const v = V_MIN + Math.max(0, Math.min(1, power)) * (V_MAX - V_MIN)
  return { ...m, vx: p.facing * v * Math.cos(a), vy: -v * Math.sin(a) }
}

// 한 발의 결과: 궤적·폭발·피해 + 다음 상태(차례 넘김 포함). now = 서버 시각(다음 차례 마감 계산용)
export function resolveShot(s0: FortState, shot: Shot, now: number): { result: ShotResult; next: FortState } {
  const t = terrainOf(s0.seed, s0.mode, s0.craters)
  const players = s0.players.map(p => ({ ...p, ammo: { ...p.ammo } }))
  const me = players.find(p => p.id === shot.id)
  const result: ShotResult = { trails: [], blasts: [], hits: [], endMs: 600 }
  if (!me || !me.alive) return { result, next: advanceTurn(s0, now + TURN_MS) }
  // 움직인 자리·방향 반영(차례 동안 움직일 수 있는 거리 안에서만)
  const nx = Math.max(10, Math.min(W - 10, shot.x))
  if (Math.abs(nx - me.x) <= FUEL + 1 && !isPit(groundAt(t, nx))) { me.x = nx; me.y = groundAt(t, nx) }
  me.facing = shot.facing
  me.elev = Math.max(0, Math.min(90, shot.elev))
  let weapon: WeaponKey = shot.weapon
  if (me.ammo[weapon] === 0) weapon = 'clip'
  if (me.ammo[weapon] > 0) me.ammo[weapon]--
  const W0 = WEAPONS[weapon]
  const look = weaponLook(s0.theme ?? 'office', weapon)
  const craters = [...s0.craters]
  let last = ''

  if (weapon === 'coffee') {
    const heal = Math.min(MAX_HP - me.hp, W0.heal ?? 0)
    me.hp += heal
    result.hits.push({ id: me.id, dmg: -heal, t: 200 })
    result.endMs = 700
    last = `${look.emoji} ${look.name} — 체력 +${heal}`
  } else {
    const l = launch(me, shot.power)
    const ends: { x: number; y: number; t: number }[] = []
    const first = fly(t, players, me.id, l.x, l.y, l.vx, l.vy, s0.wind, 0, weapon === 'mail')
    result.trails.push({ emoji: look.emoji, pts: first.pts })
    if (first.end) ends.push(first.end)
    if (first.split) {
      for (const dvx of [-55, 0, 55]) {
        const c = fly(t, players, '', first.split.x, first.split.y, first.split.vx + dvx, first.split.vy, s0.wind, first.split.t, false)
        result.trails.push({ emoji: look.emoji, pts: c.pts })
        if (c.end) ends.push(c.end)
      }
    }
    // 폭발: 구덩이 → 피해 → 밀어내기
    const before = new Map(players.map(p => [p.id, p.hp]))
    for (const e of ends.sort((a, b) => a.t - b.t)) {
      result.blasts.push({ x: e.x, y: e.y, r: W0.r, t: e.t, weapon })
      const cr = { x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, r: W0.r }
      craters.push(cr)
      applyCrater(t, cr)
      for (const p of players) {
        if (!p.alive) continue
        const d = Math.hypot(p.x - e.x, bodyY(p) - e.y)
        if (d < W0.r + HIT_R) {
          const f = 1 - d / (W0.r + HIT_R)
          p.hp = Math.max(0, p.hp - Math.round(W0.dmg * (0.5 + 0.5 * f)))
        }
        if (W0.push && d < W0.r + 50) {
          const dir = p.x === e.x ? (p.id === me.id ? -me.facing : me.facing) : Math.sign(p.x - e.x)
          p.x += dir * W0.push * (1 - d / (W0.r + 50))
          if (p.x < 0 || p.x > W) { p.alive = false; p.out = 'pushed'; p.hp = 0 }
        }
      }
    }
    for (const p of players) {
      const dmg = (before.get(p.id) ?? 0) - p.hp
      if (dmg > 0) result.hits.push({ id: p.id, dmg, t: ends.length ? ends[ends.length - 1].t : 0 })
    }
    const lastT = ends.length ? ends[ends.length - 1].t : Math.max(0, ...result.trails.map(tr => tr.pts.at(-1)?.t ?? 0))
    result.endMs = lastT + 350
    const total = result.hits.filter(h => h.id !== me.id).reduce((a, h) => a + h.dmg, 0)
    last = ends.length === 0 ? `${look.emoji} 날아가 버렸다…` : total > 0 ? `${look.emoji} ${look.name} 명중! -${total}` : `${look.emoji} 빗나감`
  }
  // 땅이 꺼진 곳은 아래로 떨어진다(바닥까지 뚫렸으면 탈락)
  for (const p of players) {
    if (!p.alive) continue
    const g = groundAt(t, p.x)
    p.y = g
    if (isPit(g)) { p.alive = false; p.out = 'fell'; p.hp = 0 }
    else if (p.hp <= 0) { p.alive = false; p.out = 'hp' }
  }
  const mid: FortState = { ...s0, players, craters, last }
  return { result, next: advanceTurn(mid, now + result.endMs + AFTER_SHOT_MS + TURN_MS) }
}

// 시간 초과 — 쏘지 않고 넘김(움직인 자리는 반영)
export function skipTurn(s0: FortState, lastAim: { x: number; facing: 1 | -1; elev: number } | null, now: number): FortState {
  const t = terrainOf(s0.seed, s0.mode, s0.craters)
  const players = s0.players.map(p => {
    if (p.id !== s0.active || !lastAim) return p
    const nx = Math.max(10, Math.min(W - 10, lastAim.x))
    const ok = Math.abs(nx - p.x) <= FUEL + 1 && !isPit(groundAt(t, nx))
    return { ...p, x: ok ? nx : p.x, y: groundAt(t, ok ? nx : p.x), facing: lastAim.facing, elev: lastAim.elev }
  })
  return advanceTurn({ ...s0, players, last: '⌛ 시간 초과 — 차례 넘김' }, now + TURN_MS)
}

// 남은 사람이 나가면 CPU가 대신 — 방장이 계속 진행
export function toCpu(s: FortState, id: string): FortState {
  return { ...s, players: s.players.map(p => (p.id === id ? { ...p, cpu: true } : p)) }
}

// ── 🤖 CPU ───────────────────────────────────────
// 가까운 적을 노려 각도·힘을 훑어 가장 가까이 떨어지는 조합을 고른 뒤 약간 흔든다.
export function cpuPlan(s: FortState, id: string, rng: () => number): Shot {
  const t = terrainOf(s.seed, s.mode, s.craters)
  const me = s.players.find(p => p.id === id)!
  const foes = s.players.filter(p => p.alive && p.team !== me.team)
  const target = foes.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0]
  if (!target) return { id, x: me.x, facing: me.facing, elev: me.elev, power: 0.5, weapon: 'clip' }
  const facing: 1 | -1 = target.x >= me.x ? 1 : -1
  let weapon: WeaponKey = 'clip'
  if (me.hp <= 50 && me.ammo.coffee > 0 && rng() < 0.6) weapon = 'coffee'
  else if (me.ammo.reject > 0 && (target.x < 110 || target.x > W - 110) && rng() < 0.7) weapon = 'reject'
  else if (me.ammo.bomb > 0 && rng() < 0.3) weapon = 'bomb'
  else if (me.ammo.mail > 0 && rng() < 0.3) weapon = 'mail'
  if (weapon === 'coffee') return { id, x: me.x, facing, elev: me.elev, power: 0, weapon }
  const tx = target.x, ty = bodyY(target)
  let best = { elev: 45, power: 0.6, d: Infinity }
  for (let elev = 20; elev <= 80; elev += 4) {
    for (let power = 0.06; power <= 1.0001; power += 0.02) {
      const l = launch({ x: me.x, y: me.y, facing, elev }, power)
      const f = fly(t, s.players, id, l.x, l.y, l.vx, l.vy, s.wind, 0, false, false)
      if (!f.end) continue
      if (Math.hypot(f.end.x - me.x, f.end.y - bodyY(me)) < 40) continue // 내 발밑은 피함
      const d = Math.hypot(f.end.x - tx, f.end.y - ty)
      if (d < best.d) best = { elev, power, d }
    }
  }
  return {
    id, x: me.x, facing,
    elev: Math.max(5, Math.min(88, best.elev + (rng() - 0.5) * 7)),
    power: Math.max(0.05, Math.min(1, best.power + (rng() - 0.5) * 0.075)),
    weapon,
  }
}

// 궤적에서 시각 ms의 위치(그리기용)
export function trailAt(pts: TrailPt[], ms: number): TrailPt | null {
  if (!pts.length || ms < pts[0].t || ms > pts[pts.length - 1].t) return null
  let lo = 0, hi = pts.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= ms) lo = m; else hi = m }
  const a = pts[lo], b = pts[hi]
  const k = b.t === a.t ? 0 : (ms - a.t) / (b.t - a.t)
  return { t: ms, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}
