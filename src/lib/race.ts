// 운동장 🏎 퇴근 레이싱 — 순수 로직(그리기·통신 없음, 테스트 가능).
// 위에서 본 도로가 왼쪽→오른쪽으로 흐른다. 카트는 자동으로 달리고 ↑↓로 차선을 바꾼다.
//   🚧 고깔 = 부딪히면 빙글(감속)   🛢 기름 = 잠깐 미끄러짐   ⏩ 부스터 발판 = 순간 가속
//   ❓ 아이템 상자 = 🚀 부스터 / 🍌 바나나(뒤에 떨굼) / 📧 업무 메일(바로 앞사람 멈춤) 중 하나
// 코스는 레이스 시드로 만들어서 모두에게 같다. 각자 자기 카트만 계산하고 위치를 방송한다(CPU는 방장 PC가 계산).

export const RACE_LEN = 22000 // 기본 결승선까지(px) — 약 55초(2026-11-03 9000→16000, 2026-11-05 →22000: 충돌 넣으며 더 길게). 히든 코스는 Road.len으로 따로
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
export const NOTICE_STUN_MS = 1600 // 📢 전체 공지(1등만) — 메일보다 오래 멈춘다
export const SHIELD_MS = 3000 // 🛡️ 결재 도장 — 이 시간 안에 처음 맞는 한 번을 막는다
export const HURDLE_SHOTS = 3 // 🏃 허들 3연발 — Space마다 내 뒤에 허들 하나, 세 번(2026-11-05 📎 클립(바나나 3개)을 바꿈 — 바나나와 겹쳐서)
export const ROLL_MS = 250 // 아이템 상자 룰렛(짧게 — 바로 확인되게)
export const MAIL_FLIGHT_MS = 1200 // 메일·공지가 날아가는 시간 — 맞는 사람이 경고를 보고 🛡️ 도장을 쓸 수 있게 1초 넘게(2026-11-05 650→1200)
// 시간 초과 = 최고 속도로 달릴 때의 약 2.5배(코스 길이마다)
export const timeoutOf = (len: number) => Math.round((len / V_MAX) * 1000 * 2.5)
export const RACE_TIMEOUT_MS = timeoutOf(RACE_LEN)
export const COUNTDOWN_MS = 3000
export const LOBBY_MS = 12_000 // 레이스 열고 참가 받는 시간
// 레이스 규칙 버전 — 코스 길이·코스 고르기·판정이 바뀌면 올린다. 다른 버전끼리는 같은 레이스에 못 들어간다(2026-11-05:
//   새로고침 안 한 화면과 섞여 결승선·코스가 서로 달라 "꼴찌인데 1등·혼자 끝남" 버그). 옛 화면은 이 값을 안 보낸다(undefined).
export const RACE_PROTO = 5 // 4: 메일·공지 1등 사용 불가·비행 1.2초, 5: 📎 클립 → 🏃 허들(밟으면 감속)

// 2026-11-05 추가: 🛡️ 결재 도장(방어) · 📎 클립 3연발(견제) · 📢 전체 공지(꼴찌 쪽 역전용, 1등만 멈춤)
export type Item = 'rocket' | 'banana' | 'mail' | 'shield' | 'hurdle' | 'notice'
export const ITEMS: Record<Item, { emoji: string; name: string }> = {
  rocket: { emoji: '🚀', name: '부스터' },
  banana: { emoji: '🍌', name: '바나나' },
  mail: { emoji: '📧', name: '업무 메일' },
  shield: { emoji: '🛡️', name: '결재 도장(3초 한 번 막기)' },
  hurdle: { emoji: '🏃', name: '허들 3연발' },
  notice: { emoji: '📢', name: '전체 공지(1등 멈춤)' },
}

// 장애물 — 종류마다 효과는 넷 중 하나: 빙글(spin)·미끄덩(slip)·감속(slow)·가속(boost). 바닥에 붙은 것(floor)은 납작하게 그린다.
// 2026-11-05 랜덤 코스(lib/raceCourses.ts) 추가하면서 고깔·기름·발판 외 종류를 늘렸다. 움직이는 것(moving)은 차선 사이를 오간다.
export type HazardKind =
  | 'cone' | 'barrier' | 'tire' | 'rock' | 'trash' | 'crowd' | 'pigeon' | 'snowman' | 'cactus'
  | 'scooter' | 'duck' | 'crab' | 'ball' | 'deer'
  | 'oil' | 'ice' | 'coffee' | 'leaves'
  | 'puddle' | 'sand' | 'mud' | 'bump' | 'pothole'
  | 'pad'
export type ThingKind = HazardKind | 'box'
export type HazardFx = 'spin' | 'slip' | 'slow' | 'boost'
export const HAZ: Record<HazardKind, { fx: HazardFx; r: number; floor: boolean; emoji: string; msg: string; moving?: boolean }> = {
  cone: { fx: 'spin', r: 12, floor: false, emoji: '🚧', msg: '🚧 고깔에 쾅!' },
  barrier: { fx: 'spin', r: 15, floor: false, emoji: '🚧', msg: '🚧 공사 바리케이드에 쾅!' },
  tire: { fx: 'spin', r: 12, floor: false, emoji: '🛞', msg: '🛞 타이어 더미에 쾅!' },
  rock: { fx: 'spin', r: 13, floor: false, emoji: '🪨', msg: '🪨 낙석에 쾅!' },
  trash: { fx: 'spin', r: 11, floor: false, emoji: '🗑️', msg: '🗑️ 쓰레기통에 쾅!' },
  crowd: { fx: 'spin', r: 14, floor: false, emoji: '🧍', msg: '🧍 팝업스토어 줄에 막혔다!' },
  pigeon: { fx: 'spin', r: 11, floor: false, emoji: '🕊️', msg: '🕊️ 비둘기 떼 습격!' },
  snowman: { fx: 'spin', r: 13, floor: false, emoji: '⛄', msg: '⛄ 눈사람에 쾅!' },
  cactus: { fx: 'spin', r: 12, floor: false, emoji: '🌵', msg: '🌵 선인장 따끔!' },
  scooter: { fx: 'spin', r: 12, floor: false, emoji: '🛴', msg: '🛴 킥보드랑 부딪혔다!', moving: true },
  duck: { fx: 'spin', r: 11, floor: false, emoji: '🦆', msg: '🦆 오리 가족 지나가요!', moving: true },
  crab: { fx: 'spin', r: 11, floor: false, emoji: '🦀', msg: '🦀 꽃게한테 집혔다!', moving: true },
  ball: { fx: 'spin', r: 10, floor: false, emoji: '⚾', msg: '⚾ 파울볼 맞았다!', moving: true },
  deer: { fx: 'spin', r: 13, floor: false, emoji: '🦌', msg: '🦌 고라니 출몰!', moving: true },
  oil: { fx: 'slip', r: 20, floor: true, emoji: '🛢', msg: '🛢 기름에 미끄덩' },
  ice: { fx: 'slip', r: 22, floor: true, emoji: '🧊', msg: '🧊 빙판길 미끄덩' },
  coffee: { fx: 'slip', r: 18, floor: true, emoji: '☕', msg: '☕ 쏟아진 라떼에 미끄덩' },
  leaves: { fx: 'slip', r: 21, floor: true, emoji: '🍂', msg: '🍂 낙엽 더미에 미끄덩' },
  puddle: { fx: 'slow', r: 22, floor: true, emoji: '💦', msg: '💦 웅덩이 첨벙! 감속' },
  sand: { fx: 'slow', r: 24, floor: true, emoji: '🏜', msg: '🏜 모래에 빠졌다! 감속' },
  mud: { fx: 'slow', r: 22, floor: true, emoji: '🟫', msg: '🟫 진흙탕! 감속' },
  bump: { fx: 'slow', r: 16, floor: true, emoji: '〰', msg: '〰 과속방지턱! 덜컹' },
  pothole: { fx: 'slow', r: 15, floor: true, emoji: '🕳', msg: '🕳 포트홀 덜컹! 감속' },
  pad: { fx: 'boost', r: 18, floor: true, emoji: '⏩', msg: '⏩ 부스터!' },
}
export const SLOW_KEEP = 0.45 // 감속 장애물: 속도가 이만큼으로 줄어든다(빙글보다 덜 아픔 — 차선 조작은 그대로)
// 움직이는 장애물: y = 기준 y + amp × sin(2π·t/per + ph). t = 레이스 시각(ms) — 모두에게 같다.
export type Thing = { id: number; kind: ThingKind; x: number; y: number; r: number; mv?: { amp: number; per: number; ph: number } }
export const thingY = (th: Thing, t: number) => (th.mv ? th.y + th.mv.amp * Math.sin((2 * Math.PI * Math.max(0, t)) / th.mv.per + th.mv.ph) : th.y)
export type TrackMix = Partial<Record<HazardKind, number>> // 종류별 비중(줄마다 이 비율로 뽑는다)
export const CLASSIC_MIX: TrackMix = { cone: 0.55, oil: 0.25, pad: 0.2 }
// kind = 'hurdle'이면 🚧 허들(📎 대신, 2026-11-05) — 바나나보다 가로로 넓고, 밟으면 빙글 대신 덜컹 감속. 없으면 🍌
export type Banana = { id: string; x: number; y: number; owner: string; kind?: 'hurdle' }
export const HURDLE_HALF = 20 // 허들 가로 반폭(그림) — 바나나(약 12)보다 넓고 차선 간격(59)의 절반보다 좁아 옆 차선은 안 막는다
export const HURDLE_R = 22 // 허들 판정 반경(가로) — 바나나는 11

export type Kart = {
  x: number; y: number; v: number
  spinUntil: number; slipUntil: number; slipDir: number; boostUntil: number; stunUntil: number
  item: Item | null; rollUntil: number; rolling: Item | null
  charges: number // 📎 클립 남은 발수
  shieldUntil: number // 🛡️ 결재 도장 끝나는 시각(맞으면 0)
  hitIds: number[] // 이미 부딪힌 고깔·기름(같은 것에 두 번 안 걸리게)
  bumpUntil: number // 💥 차끼리 부딪힌 뒤 이 시각까지는 '쿵' 효과(튕김·감속·빙글)를 다시 안 받는다(겹침 풀기만)
  finishedAt: number | null // 레이스 시각(ms)
}

export function rng(seed: number) {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const laneY = (i: number) => ROAD_TOP + 30 + i * ((ROAD_BOT - ROAD_TOP - 60) / 3)
export const LANE_Y = [0, 1, 2, 3].map(laneY)

// ── 도로 모양(2026-11-05): 커브 + 갈림길 ──
// 커브: 굽은 정도 curv(x) ∈ [-curve, curve]. 화면이 휘어 보이고(raceChase), 달리는 중 바깥쪽으로 밀린다(DRIFT) — ←→로 버텨야 한다.
// 갈림길: [x0, x1] 구간은 가운데(차선 1·2 사이)에 화단이 생겨 위(차선 0·1)/아래(차선 2·3) 길로 나뉜다. 들어갈 때 있던 쪽으로 간다.
// risky = 장애물이 몰린 쪽(0 = 위, 1 = 아래). short = 그쪽이 ⚡ 지름길 — 장애물이 빽빽하지만 같은 시간에 SHORTCUT_GAIN배 더 나아간다(길이 짧은 셈)
export type Fork = { x0: number; x1: number; risky: 0 | 1; short?: boolean }
export const SHORTCUT_GAIN = 1.3 // 갈림길 2000px 기준 약 600px(≈1.4초) 단축 — 한 번 빙글(≈2초 손해)이면 거의 다 까먹는다
// len = 결승선까지(px, 없으면 RACE_LEN) — 히든 코스(2분 대장정 등)는 더 길다
export type Road = { curve: number; phase: number; forks: Fork[]; len?: number }
export const STRAIGHT: Road = { curve: 0, phase: 0, forks: [] }
export const lenOf = (road?: Road) => road?.len ?? RACE_LEN
export const DRIFT = 95 // 커브 최대(curv = 1)·최고 속도일 때 바깥으로 밀리는 속도(px/초) — 조향(STEER)보다 한참 약하다
export const MEDIAN_Y = (LANE_Y[1] + LANE_Y[2]) / 2
export const MEDIAN_HALF = 9
export const curvAt = (road: Road, x: number) =>
  road.curve ? road.curve * (0.7 * Math.sin(x / 1300 + road.phase) + 0.3 * Math.sin(x / 470 + road.phase * 2.3)) : 0
export const forkAt = (road: Road, x: number): Fork | null => road.forks.find(f => x >= f.x0 && x <= f.x1) ?? null
// 시드로 도로 모양 만들기 — 갈림길은 3000 이후, 서로 떨어지게, 결승 2000 전까지
// shortcuts = 그중 지름길 갈림길 수(앞에서부터 번갈아)
export function makeRoad(seed: number, curve: number, forks: number, shortcuts = 0, len = RACE_LEN): Road {
  const r = rng(seed ^ 0x2c1b3c6d)
  const out: Fork[] = []
  let x = 3000 + r() * 1500
  for (let i = 0; i < forks && x < len - 4000; i++) {
    const len = 1700 + r() * 900
    const short = shortcuts > 0 && (shortcuts >= forks || i % 2 === 0) && out.filter(o => o.short).length < shortcuts
    out.push({ x0: Math.round(x), x1: Math.round(x + len), risky: r() < 0.5 ? 0 : 1, ...(short ? { short: true } : {}) })
    x += len + 2200 + r() * 1500
  }
  return { curve, phase: r() * Math.PI * 2, forks: out, ...(len !== RACE_LEN ? { len } : {}) }
}

// 코스: 400~600px마다 한 줄씩(gap 배율), 1800px쯤마다 아이템 상자 줄. 한 줄에 최소 한 차선은 비워 둔다.
// mix = 줄마다 뽑을 장애물 비중(코스별, lib/raceCourses.ts). 기본은 예전 코스(고깔·기름·발판).
//   빙글 장애물은 1~2개(다른 차선), 바닥 장애물은 1개(+가끔 옆 차선에 빙글 1개), 움직이는 건 1개(차선 둘 사이를 오감), 발판 1개.
// boxes = 상자 줄 하나에 놓을 상자 수(= 참가 인원, 4명 넘으면 한 차선에 둘). 먹으면 모두에게서 사라진다(RaceArena가 방송).
// road의 갈림길 구간: 한쪽(risky)은 장애물·발판이 몰리고, 다른 쪽은 가끔 감속 장애물만 — 빠르지만 위험한 길 vs 안전한 길.
export function makeTrack(seed: number, mix: TrackMix = CLASSIC_MIX, gap = 1, boxes = 4, road: Road = STRAIGHT): Thing[] {
  const r = rng(seed)
  const out: Thing[] = []
  let id = 0
  let nextBox = 900
  const kinds = (Object.keys(mix) as HazardKind[]).filter(k => (mix[k] ?? 0) > 0)
  const total = kinds.reduce((a, k) => a + (mix[k] ?? 0), 0)
  const pick = (): HazardKind => {
    let u = r() * total
    for (const k of kinds) { u -= mix[k] ?? 0; if (u < 0) return k }
    return kinds[kinds.length - 1] ?? 'cone'
  }
  const standing = kinds.filter(k => !HAZ[k].floor && !HAZ[k].moving)
  const put = (kind: HazardKind, x: number, y: number, extra?: Partial<Thing>) => out.push({ id: id++, kind, x, y, r: HAZ[kind].r, ...extra })
  const LEN = lenOf(road)
  for (let x = 700; x < LEN - 350; x += (380 + r() * 220) * gap) {
    if (x >= nextBox) {
      const order = [0, 1, 2, 3].sort(() => r() - 0.5)
      const n = Math.max(1, Math.min(8, boxes))
      for (let i = 0; i < n; i++) out.push({ id: id++, kind: 'box', x: x + Math.floor(i / 4) * 70, y: LANE_Y[order[i % 4]], r: 13 })
      nextBox = x + 1500 + r() * 600
      continue
    }
    const kind = pick()
    const h = HAZ[kind]
    const lanes = [0, 1, 2, 3].sort(() => r() - 0.5)
    const fork = road.forks.find(fk => x >= fk.x0 - 120 && x <= fk.x1 + 60)
    if (fork) {
      // 갈림길 안: 위험한 쪽 두 차선 중 하나에 장애물(움직이는 건 빼고), 다른 하나엔 가끔 발판 / 안전한 쪽은 가끔 감속 장애물
      const riskyLanes = fork.risky === 0 ? [0, 1] : [2, 3]
      const safeLanes = fork.risky === 0 ? [2, 3] : [0, 1]
      const hard = h.moving || h.fx === 'boost' ? standing[Math.floor(r() * standing.length)] ?? 'cone' : kind
      const a = r() < 0.5 ? 0 : 1
      put(hard, x, LANE_Y[riskyLanes[a]])
      if (fork.short) {
        // ⚡ 지름길: 발판 없이 장애물만 빽빽 — 반 줄 뒤 다른 차선에도 하나(같은 줄은 아니라 좌우로 피해 갈 수 있다)
        if (r() < 0.6) put(standing[Math.floor(r() * standing.length)] ?? 'cone', x + 150 + r() * 60, LANE_Y[riskyLanes[1 - a]])
      } else if (r() < 0.45) put('pad', x + 40, LANE_Y[riskyLanes[1 - a]])
      if (r() < 0.25) { const soft = (['puddle', 'bump', 'sand'] as HazardKind[])[Math.floor(r() * 3)]; put(soft, x + 20, LANE_Y[safeLanes[Math.floor(r() * 2)]]) }
      continue
    }
    if (h.moving) {
      // 차선 둘 사이(가운데 세 곳 중 하나)를 오간다 — 나머지 두 차선은 늘 비어 있다
      const gapI = Math.floor(r() * 3)
      const mid = (LANE_Y[gapI] + LANE_Y[gapI + 1]) / 2
      put(kind, x, mid, { mv: { amp: (LANE_Y[1] - LANE_Y[0]) * 0.55, per: 1400 + r() * 1400, ph: r() * Math.PI * 2 } })
    } else if (h.fx === 'spin') {
      const n = r() < 0.45 ? 2 : 1
      for (let k = 0; k < n; k++) put(kind, x + k * 30, LANE_Y[lanes[k]] + (r() - 0.5) * 16)
    } else if (h.fx === 'boost') {
      put(kind, x, LANE_Y[lanes[0]])
    } else {
      put(kind, x, LANE_Y[lanes[0]])
      if (standing.length && r() < 0.4) put(standing[Math.floor(r() * standing.length)], x + 60, LANE_Y[lanes[1]])
    }
  }
  return out
}

export function startGrid(i: number): { x: number; y: number } {
  return { x: 120 - Math.floor(i / 4) * 50, y: LANE_Y[i % 4] }
}

export function newKart(i: number): Kart {
  const g = startGrid(i)
  return { ...g, v: 0, spinUntil: 0, slipUntil: 0, slipDir: 0, boostUntil: 0, stunUntil: 0, item: null, rollUntil: 0, rolling: null, charges: 0, shieldUntil: 0, hitIds: [], bumpUntil: 0, finishedAt: null }
}

export const touches = (k: { x: number; y: number }, t: { x: number; y: number; r: number }) =>
  Math.abs(k.x - t.x) < KART_HX + t.r * 0.8 && Math.abs(k.y - t.y) < KART_HY + t.r * 0.8

export const disabled = (k: Kart, t: number) => t < k.spinUntil || t < k.stunUntil

// 순위대로 아이템 확률이 다르다(비중, 합으로 나눔) — 앞일수록 🍌·📎(뒤 견제), 뒤일수록 🚀·📧, 꼴찌 쪽만 📢, 🛡️는 중위권에 많이
//   대략 1등: 🚀31 🍌38 📎14 📧3 🛡️14 / 중간: 🚀37 🍌20 📎7 📧19 🛡️17 / 꼴찌(4명): 🚀39 🍌4 📧22 🛡️6 📢29 (%)
export function itemWeights(rank: number, total: number): Record<Item, number> {
  const b = total <= 1 ? 0.5 : rank / (total - 1) // 0 = 1등, 1 = 꼴찌
  return {
    rocket: 0.3 + 0.2 * b,
    banana: 0.35 * (1 - b) + 0.05,
    hurdle: 0.15 * (1 - b),
    mail: total <= 1 ? 0.15 : rank === 0 ? 0 : 0.1 + 0.18 * b, // 1등은 앞사람이 없어 안 나온다
    shield: 0.06 + 0.12 * (1 - Math.abs(b - 0.5) * 2),
    notice: total >= 2 && rank > 0 && b >= 0.66 ? 0.12 + 0.25 * ((b - 0.66) / 0.34) : 0,
  }
}
export function pickItem(rank: number, total: number, rand: () => number): Item {
  const w = itemWeights(rank, total)
  const keys = Object.keys(w) as Item[]
  let u = rand() * keys.reduce((a, k) => a + w[k], 0)
  for (const k of keys) { u -= w[k]; if (u < 0) return k }
  return 'rocket'
}

export type StepEvent =
  | { type: 'spin'; by: HazardKind | 'banana'; bananaId?: string; blocked?: boolean } // blocked = 도장으로 막고 바나나만 치움
  | { type: 'slip'; by: HazardKind }
  | { type: 'slow'; by: HazardKind | 'hurdle'; bananaId?: string } // bananaId = 밟은 허들(치운다)
  | { type: 'pad' }
  | { type: 'shortcut' } // ⚡ 지름길에 들어섰다
  | { type: 'box'; id: number }
  | { type: 'block' } // 🛡️ 결재 도장으로 막음
  | { type: 'finish' }

// 한 스텝(dt ms). t = 레이스 시각(ms, 출발=0). 출발 전(t<0)엔 서 있는다.
// opts.road = 커브·갈림길(없으면 직선), opts.gone = 누군가 이미 먹은 상자 id(모두 같이 씀)
export type StepOpts = { road?: Road; gone?: ReadonlySet<number> }
export function kartStep(k: Kart, steer: -1 | 0 | 1, t: number, dt: number, track: Thing[], bananas: Banana[], rank: number, total: number, rand: () => number, opts: StepOpts = {}): { k: Kart; events: StepEvent[] } {
  const road = opts.road ?? STRAIGHT
  const gone = opts.gone
  let events: StepEvent[] = []
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
  // 커브: 오른쪽으로 굽으면(+) 바깥(도로 위쪽, -y)으로 밀린다
  const push = -curvAt(road, x) * DRIFT * Math.min(1.3, (v / V_MAX) ** 2)
  y = Math.max(ROAD_TOP + KART_HY + 4, Math.min(ROAD_BOT - KART_HY - 4, y + (dy + push) * s))
  // 갈림길: 화단을 넘지 못한다(들어가기 직전 위치로 길이 정해진다)
  const fork = forkAt(road, x + v * s) ?? forkAt(road, x)
  let gain = 1
  let enteredShort = false
  if (fork) {
    const top = k.y < MEDIAN_Y
    if (top) y = Math.min(y, MEDIAN_Y - MEDIAN_HALF - KART_HY)
    else y = Math.max(y, MEDIAN_Y + MEDIAN_HALF + KART_HY)
    if (fork.short && (top ? 0 : 1) === fork.risky && x >= fork.x0) {
      gain = SHORTCUT_GAIN
      enteredShort = x < fork.x0 + v * s // 들어선 첫 스텝
    }
  }
  x = x + v * s * gain
  let next: Kart = { ...k, x, y, v }
  const events0: StepEvent[] = enteredShort ? [{ type: 'shortcut' }] : []
  events = events.concat(events0)
  // 아이템 룰렛 끝
  if (rolling && t >= rollUntil) { item = rolling; rolling = null; next = { ...next, item, rolling, charges: item === 'hurdle' ? HURDLE_SHOTS : 0 } }
  // 🛡️ 도장이 살아 있으면 처음 맞는 한 번(빙글·미끄덩·감속·바나나)을 막고 도장이 사라진다
  const blockHit = () => { if (t < next.shieldUntil) { next = { ...next, shieldUntil: 0 }; events.push({ type: 'block' }); return true } return false }
  // 부딪힘
  for (const th of track) {
    if (th.x < x - 60 || th.x > x + 60) continue
    if (!touches(next, th.mv ? { ...th, y: thingY(th, t) } : th)) continue
    if (th.kind === 'box') {
      // 이미 누가 먹은 상자는 없다. 아이템이 있으면 그냥 지나간다(상자는 뒷사람 몫으로 남는다)
      if (gone?.has(th.id) || next.item || next.rolling) continue
      next = { ...next, rolling: pickItem(rank, total, rand), rollUntil: t + ROLL_MS }
      events.push({ type: 'box', id: th.id })
      continue
    }
    if (next.hitIds.includes(th.id)) continue
    next = { ...next, hitIds: [...next.hitIds, th.id] }
    const fx = HAZ[th.kind].fx
    if (fx === 'boost') { next = { ...next, boostUntil: Math.max(next.boostUntil, t + PAD_BOOST_MS) }; events.push({ type: 'pad' }) }
    else if (off) continue
    else if (blockHit()) continue
    else if (fx === 'spin') { next = { ...next, spinUntil: t + SPIN_MS, v: next.v * 0.3, boostUntil: 0 }; events.push({ type: 'spin', by: th.kind }) }
    else if (fx === 'slip') { next = { ...next, slipUntil: t + SLIP_MS, slipDir: rand() < 0.5 ? -1 : 1, v: next.v * 0.6 }; events.push({ type: 'slip', by: th.kind }) }
    else if (fx === 'slow') { next = { ...next, v: next.v * SLOW_KEEP, boostUntil: 0 }; events.push({ type: 'slow', by: th.kind }) }
  }
  if (!disabled(next, t)) {
    for (const b of bananas) {
      if (b.kind === 'hurdle') {
        // 🏃 허들 — 가로로 넓고 앞뒤로 얇다. 밟으면 덜컹 감속(빙글 없음), 허들은 치워진다
        if (Math.abs(next.x - b.x) >= KART_HX + 6 || Math.abs(next.y - b.y) >= KART_HY + HURDLE_R * 0.8) continue
        if (blockHit()) { events.push({ type: 'spin', by: 'banana', bananaId: b.id, blocked: true }); break }
        next = { ...next, v: next.v * SLOW_KEEP, boostUntil: 0 }; events.push({ type: 'slow', by: 'hurdle', bananaId: b.id }); break
      }
      if (!touches(next, { ...b, r: 11 })) continue
      if (blockHit()) { events.push({ type: 'spin', by: 'banana', bananaId: b.id, blocked: true }); break } // 바나나는 치워진다
      next = { ...next, spinUntil: t + SPIN_MS, v: next.v * 0.3, boostUntil: 0 }; events.push({ type: 'spin', by: 'banana', bananaId: b.id }); break
    }
  }
  if (next.x >= lenOf(road) && next.finishedAt === null) { next = { ...next, finishedAt: t }; events.push({ type: 'finish' }) }
  return { k: next, events }
}

// 아이템 쓰기 — 🚀는 바로, 🍌는 뒤에 떨굼, 📧는 대상 고르기(바로 앞사람, 내가 1등이면 바로 뒷사람)
// 🛡️는 바로 SHIELD_MS 동안 도장, 🏃는 허들 한 개(남은 발수가 있으면 아이템 유지), 📢는 1등 멈춤(대상은 RaceArena가 noticeTarget으로)
export function fireItem(k: Kart, t: number): { k: Kart; used: Item | null } {
  if (!k.item || disabled(k, t) || k.finishedAt !== null) return { k, used: null }
  const used = k.item
  let next: Kart = { ...k, item: null }
  if (used === 'rocket') next = { ...next, boostUntil: Math.max(next.boostUntil, t + ROCKET_MS), v: Math.max(next.v, V_BOOST - 40) }
  else if (used === 'shield') next = { ...next, shieldUntil: t + SHIELD_MS }
  else if (used === 'hurdle') { const left = Math.max(0, k.charges - 1); next = { ...next, charges: left, item: left > 0 ? 'hurdle' : null } }
  return { k: next, used }
}

// 📢 전체 공지 대상 = 아직 달리는 사람 중 1등(나 빼고). 내가 1등이면 2등 — 없으면 null
// 2026-11-05: 내가 (달리는 사람 중) 1등이면 대상 없음 — 예전엔 2등이 맞아서 '뒷사람 공격'이 됐다
export function noticeTarget(me: string, racers: { id: string; x: number; done: boolean }[]): string | null {
  const mine = racers.find(r => r.id === me)
  if (!mine) return null
  const ahead = racers.filter(r => r.id !== me && !r.done && r.x > mine.x).sort((a, b) => b.x - a.x)
  return ahead[0]?.id ?? null
}

export function bananaDrop(k: Kart): { x: number; y: number } {
  return { x: k.x - KART_HX - 16, y: k.y }
}

export function mailTarget(me: string, racers: { id: string; x: number; done: boolean }[]): string | null {
  const mine = racers.find(r => r.id === me)
  if (!mine) return null
  const live = racers.filter(r => r.id !== me && !r.done)
  const ahead = live.filter(r => r.x > mine.x).sort((a, b) => a.x - b.x)
  return ahead[0]?.id ?? null // 앞사람이 없으면(1등) 못 쓴다 — 아이템은 그대로 들고 있음(2026-11-05, 예전엔 뒷사람에게 갔다)
}

// 메일·공지 맞기 — 🛡️ 도장이 있으면 막는다(blocked). ms = 멈추는 시간(공지는 더 길다)
export function hitByMail(k: Kart, t: number, ms = STUN_MS): { k: Kart; blocked: boolean } {
  if (t < k.shieldUntil) return { k: { ...k, shieldUntil: 0 }, blocked: true }
  return { k: { ...k, stunUntil: t + ms, v: k.v * 0.25, boostUntil: 0 }, blocked: false }
}
export const stunKart = (k: Kart, t: number, ms = STUN_MS): Kart => hitByMail(k, t, ms).k

// 순위: 완주한 사람(빠른 순) → 달리는 중(앞선 순)
export function ranking<T extends { x: number; finishedAt: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return b.x - a.x
  })
}

// CPU 조향: 앞 260px 안 장애물·바나나를 피해서, 상자·발판 쪽으로. 가끔(실수) 늦게 반응.
export type CpuMem = { target: number; nextThink: number; useAt: number; skill: number }
export function newCpu(rand: () => number): CpuMem {
  return { target: Math.floor(rand() * 4), nextThink: 0, useAt: 0, skill: 0.7 + rand() * 0.25 }
}
export function cpuSteer(k: Kart, mem: CpuMem, t: number, track: Thing[], bananas: Banana[], rand: () => number, opts: StepOpts = {}): { steer: -1 | 0 | 1; use: boolean } {
  const road = opts.road ?? STRAIGHT
  if (t >= mem.nextThink) {
    mem.nextThink = t + 180 + rand() * 200
    const look = 140 + mem.skill * 160
    const danger = [0, 0, 0, 0]
    const bonus = [0, 0, 0, 0]
    const near = (y: number) => LANE_Y.reduce((b, ly, i) => (Math.abs(ly - y) < Math.abs(LANE_Y[b] - y) ? i : b), 0)
    for (const th of track) {
      if (th.x < k.x || th.x > k.x + look) continue
      if (th.kind === 'box') { if (!k.item && !opts.gone?.has(th.id)) bonus[near(th.y)] += 0.5; continue }
      const fx = HAZ[th.kind].fx
      // 움직이는 건 도착할 즈음 위치(대략)로 본다
      const li = near(thingY(th, t + ((th.x - k.x) / Math.max(200, k.v)) * 1000))
      if (fx === 'spin' || fx === 'slip') danger[li] += 3
      else if (fx === 'slow') danger[li] += 2
      else if (fx === 'boost') bonus[li] += 1.5
    }
    for (const b of bananas) if (b.x > k.x && b.x < k.x + look) danger[near(b.y)] += b.kind === 'hurdle' ? 2 : 3
    // ⚡ 지름길이 다가오면 솜씨 좋은 CPU일수록 그쪽으로(입구 600px 전부터)
    const ahead = road.forks.find(fk => fk.short && k.x < fk.x0 && fk.x0 - k.x < 600)
    if (ahead) for (const i of ahead.risky === 0 ? [0, 1] : [2, 3]) bonus[i] += (mem.skill - 0.6) * 12
    const cur = near(k.y)
    // 갈림길 안에선 내 쪽 두 차선만 고른다
    const inFork = forkAt(road, k.x)
    const allowed = inFork ? (k.y < MEDIAN_Y ? [0, 1] : [2, 3]) : [0, 1, 2, 3]
    const score = (i: number) => danger[i] * 2 - bonus[i] + Math.abs(i - cur) * 0.6 + (i === mem.target ? -0.3 : 0)
    if (!allowed.includes(mem.target)) mem.target = allowed.reduce((b, i) => (Math.abs(i - cur) < Math.abs(b - cur) ? i : b), allowed[0])
    if (rand() < mem.skill) mem.target = allowed.reduce((b, i) => (score(i) < score(b) ? i : b), mem.target)
  }
  const ty = LANE_Y[mem.target]
  const steer: -1 | 0 | 1 = Math.abs(ty - k.y) < 6 ? 0 : ty < k.y ? -1 : 1 // 커브에 밀려도 6px 넘으면 다시 잡는다(조향이 밀림보다 세다)
  let use = false
  if (k.item) {
    if (!mem.useAt) mem.useAt = t + 500 + rand() * 2500
    if (t >= mem.useAt) { use = true; mem.useAt = 0 }
  }
  return { steer, use }
}

// ── 💥 범퍼카식 충돌(2026-11-05) ──
// 진짜 물리(질량·운동량)는 한 곳이 모든 차를 계산해야 해서 조작이 늦어진다. 대신 "내 화면에서 부딪히면 내 차만 반응"한다.
//   상대 차는 상대 PC(CPU면 방장 PC)가 같은 규칙으로 자기 쪽을 처리한다 — 통신 추가 없음.
//   옆으로 닿음 = 서로 반대쪽으로 튕김(겹친 만큼 반씩 + 처음 닿을 때 조금 더) / 뒤에서 받음 = 뒤차만 앞차 속도로 줄어듦(앞차는 그대로)
//   🚀 부스터 차가 박으면 맞은 쪽이 빙글 / 🛡️ 도장 차는 안 밀리고(상대가 두 배로 튕김) 부스터에 박혀도 안 돈다
//   출발 직후 BUMP_GRACE_MS 동안은 통과(한꺼번에 출발하면 뒤엉키니까). 빙글 도는 차·완주한 차는 부딪히지 않는다(호출하는 쪽이 뺀다)
// loose = 판정 크기 배율. 다른 사람 차는 예측 위치라 30px쯤 어긋날 수 있어 작게(0.8) 잡는다 — "안 닿았는데 부딪힘" 억울함 줄이기
export const BUMP_GRACE_MS = 2500
export const BUMP_CD_MS = 500
export const BUMP_KNOCK = 12 // 처음 옆으로 닿을 때 더 튕겨 나가는 거리(px)
export const REMOTE_LOOSE = 0.8
export type BumpOther = { x: number; y: number; v: number; boost: boolean; heavy: boolean; loose?: number }
export type BumpKind = 'side' | 'rear' | 'ram' | 'held'
export function bump(k: Kart, others: BumpOther[], t: number, road: Road = STRAIGHT): { k: Kart; ev: BumpKind | null } {
  if (t < BUMP_GRACE_MS || k.finishedAt !== null || t < k.spinUntil) return { k, ev: null }
  const heavy = t < k.shieldUntil
  const boosting = t < k.boostUntil
  const fresh = t >= k.bumpUntil
  let { x, y, v } = k
  let ev: BumpKind | null = null
  let spin = false
  for (const o of others) {
    const f = o.loose ?? 1
    const dx = o.x - x, dy = o.y - y
    const ox = 2 * KART_HX * f - Math.abs(dx), oy = 2 * KART_HY * f - Math.abs(dy)
    if (ox <= 0 || oy <= 0) continue
    // 🚀 부스터 차가 뒤·옆에서 박음(상대가 나보다 뒤거나 나란히)
    if (o.boost && !boosting && dx <= KART_HX * 0.5) {
      if (heavy) { if (fresh) ev = 'held'; continue }
      if (fresh) { spin = true; ev = 'ram'; break }
    }
    // 겹친 정도를 차 크기로 나눠 짧은 쪽 축으로 판정: 옆으로 닿음 / 앞뒤로 닿음
    if (oy / (2 * KART_HY) < ox / (2 * KART_HX)) {
      if (heavy) { if (fresh && !ev) ev = 'held'; continue }
      const dir = dy > 0 ? -1 : 1 // 상대가 아래면 나는 위로
      y += dir * (oy * (o.heavy ? 1 : 0.5) + (fresh ? BUMP_KNOCK * (o.heavy ? 2 : 1) : 0))
      if (fresh) { v *= 0.95; ev = ev ?? 'side' }
    } else if (dx > 0) {
      // 내가 뒤차 — 앞차를 뚫고 지나가지 않게 멈추고 속도를 잃는다(부스터 중이면 내가 박는 쪽이라 안 줄어듦, 상대가 도장이면 줄어듦)
      x = Math.min(x, o.x - 2 * KART_HX * f)
      if (!boosting || o.heavy) { v = Math.min(v, o.v * 0.9); if (fresh) ev = ev ?? 'rear' }
    }
    // dx < 0: 내가 앞차 — 그대로(뒤차 PC가 처리)
  }
  if (spin) return { k: { ...k, spinUntil: t + SPIN_MS, v: k.v * 0.35, boostUntil: 0, bumpUntil: t + SPIN_MS + BUMP_CD_MS }, ev }
  // 도로 밖·갈림길 화단을 넘지 않게
  y = Math.max(ROAD_TOP + KART_HY + 4, Math.min(ROAD_BOT - KART_HY - 4, y))
  if (forkAt(road, x)) y = k.y < MEDIAN_Y ? Math.min(y, MEDIAN_Y - MEDIAN_HALF - KART_HY) : Math.max(y, MEDIAN_Y + MEDIAN_HALF + KART_HY)
  if (x === k.x && y === k.y && v === k.v && !ev) return { k, ev: null }
  return { k: { ...k, x, y, v, ...(ev && fresh ? { bumpUntil: t + BUMP_CD_MS } : {}) }, ev: fresh ? ev : null }
}
