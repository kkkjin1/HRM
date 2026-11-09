// 운동장 💥 결재 포격전 — 지형(맵). 2026-11-09 v2: 높이 한 줄(heightmap) → 2D 칸 지도(땅/빈칸).
// 그래서 지하 터널·동굴·떠 있는 섬·다리·아치·오버행·벙커가 가능하다. 판마다 seed로 맵 하나가 정해진다(누구 PC에서 계산해도 같음).
// 포격 장르의 흔한 지형 아이디어를 우리 식으로 조합 — 특정 게임의 맵을 옮기지 않음.
// 모든 맵은 좌우 대칭(가운데가 아닌 지형은 반대편에도 똑같이) → 어느 팀도 유리하지 않다.
// 좌표: u = 맵 왼쪽 0 ~ 오른쪽 1 비율, y = 위에서부터 px(맵 높이 WH). 땅 표면 기본 높이는 y≈250.
// scenery(배경): 없으면 컨셉 배경. sea 바다(아래 물) · sky 하늘(구름) · space 우주(저중력 0.7, 바람 없음).
// under: 요새를 땅 위가 아니라 "아래층(터널·동굴 바닥)"에 놓음 — 'all' 모두, 'some' 팀마다 두 번째 사람(2:2·3:3).

export const CELL = 1 // 칸 크기(px) — 2026-11-09 2px→1px(땅 경계가 더 또렷하게)
export const WH = 440 // 맵 높이(px) — 화면엔 줄여서 세로가 꽉 차게

export type MapOp =
  | ['surf', number, number] // 땅 표면 기본 높이 y, 울퉁불퉁 정도(1 = 보통)
  | ['empty'] // 땅 없이 시작(섬·소행성 맵)
  | ['bump', number, number, number] // 표면 언덕(+)/움푹(-): u, 폭 wu, 높이 h
  | ['mesa', number, number, number] // 표면 고원
  | ['spike', number, number, number] // 표면 뾰족 봉우리
  | ['wave', number, number] // 표면 물결: 물결 수, 높이
  | ['terrace', number] // 표면 계단(높이 단위 px)
  | ['gap', number, number] // 바닥까지 뚫린 낭떠러지: u, 반폭 wu
  | ['cave', number, number, number, number] // 빈 공간(타원) 파기: u, y, 반지름 rx, ry
  | ['rock', number, number, number, number] // 땅(타원) 붙이기 — 떠 있는 섬·오버행
  | ['slab', number, number, number, number] // 땅 판(사각): u0 ~ u1, y, 두께 — 다리·지붕
  | ['tunnel', number, number, number, number] // 굽이치는 굴: u0 ~ u1, 가운데 y, 높이
  | ['shaft', number, number, number, number] // 세로 굴: u, y0 ~ y1, 반폭 px
  | ['pillars', number, number] // 요새 자리 기둥만 남기고 전부 낭떠러지: 기둥 반폭 px, 가운데 작은 기둥 수
  | ['spawnIsle', number, number] // 요새마다 떠 있는 섬: 반지름 rx, 두께 ry
  | ['spawnBunker', number, number] // 요새마다 땅속 방(지붕 있음) + 가운데 쪽 출구: 깊이, 방 반폭
  | ['holes', number, number] // 땅속에 구멍 여러 개(치즈): 개수, 크기
  | ['floaters', number, number] // 하늘에 떠 있는 바위 여러 개: 개수, 크기
  | ['window', number, number, number, number] // 하늘이 보이는 구멍(타원) 뚫기 — 아치 등(굴처럼 어둡게 칠하지 않음)
  | ['spawnShelf', number, number, number] // 요새마다 높이 매달린 선반: 높이 y, 반폭 px, 두께
  | ['spawnTower', number, number] // 빌딩 스카이라인(옥상에서 시작): 기준 옥상 y, 높이 차이
  | ['posts', number[], number, number, number] // 기둥(다리 교각·비계): 자리 u 목록(좌우 대칭), 위 y, 아래 y, 반폭 px — 요새 자리(0.13·0.14·0.22·0.25·0.31·0.37) 피할 것
export type Scenery = 'sea' | 'sky' | 'space'
export type FortMap = { key: string; name: string; emoji: string; ops: MapOp[]; scenery?: Scenery; under?: 'all' | 'some'; tag?: string }
export const SCENERY: Record<Scenery, { name: string; grav: number; wind: boolean }> = {
  sea: { name: '바다', grav: 1, wind: true },
  sky: { name: '하늘', grav: 1, wind: true },
  space: { name: '우주', grav: 0.7, wind: false },
}

export const FORT_MAPS: FortMap[] = [
  // ── 땅 위 ──
  { key: 'hill', name: '언덕', emoji: '⛰', ops: [['surf', 250, 1], ['bump', 0.5, 0.12, 80]] },
  { key: 'valley', name: '골짜기', emoji: '🏞', ops: [['surf', 230, 1], ['bump', 0.5, 0.16, -90]] },
  { key: 'twin', name: '쌍봉', emoji: '🐫', ops: [['surf', 255, 0.8], ['bump', 0.37, 0.05, 95]] },
  { key: 'wall', name: '장벽', emoji: '🧱', ops: [['surf', 255, 0.8], ['bump', 0.5, 0.035, 140]] },
  { key: 'pyramid', name: '피라미드', emoji: '🔺', ops: [['surf', 260, 0.5], ['spike', 0.5, 0.17, 150], ['terrace', 16]] },
  { key: 'saw', name: '톱니', emoji: '🪚', ops: [['surf', 255, 0.6], ['spike', 0.4, 0.025, 85], ['spike', 0.45, 0.02, 65], ['spike', 0.5, 0.025, 100]] },
  { key: 'faults', name: '단층', emoji: '🧗', ops: [['surf', 245, 1.5], ['terrace', 30]] },
  { key: 'dunes', name: '모래언덕', emoji: '🏜', ops: [['surf', 250, 0.4], ['wave', 6, 32]] },
  // ── 땅속(터널·동굴·벙커) ──
  { key: 'subway', name: '지하 터널', emoji: '🚇', tag: '모두 지하에서 시작', under: 'all', ops: [['surf', 150, 0.5], ['tunnel', 0.02, 0.98, 330, 140], ['shaft', 0.5, 150, 300, 26], ['shaft', 0.3, 150, 300, 14]] },
  { key: 'twofloor', name: '2층 터널', emoji: '🚧', tag: '위층·아래층', under: 'some', ops: [['surf', 185, 0.5], ['tunnel', 0.03, 0.97, 352, 120], ['shaft', 0.42, 185, 330, 18]] },
  { key: 'cavern', name: '대동굴', emoji: '🦇', tag: '천장이 막혀 있음', under: 'all', ops: [['surf', 110, 0.4], ['cave', 0.5, 290, 0.42, 95], ['cave', 0.2, 300, 0.12, 70], ['rock', 0.5, 200, 0.05, 40]] },
  { key: 'bunker', name: '벙커', emoji: '🪖', tag: '지붕 있는 방에서 시작', under: 'all', ops: [['surf', 230, 0.7], ['spawnBunker', 76, 70], ['bump', 0.5, 0.1, 50]] },
  { key: 'mine', name: '광산', emoji: '⛏', tag: '굴이 얽힘', under: 'some', ops: [['surf', 175, 0.7], ['tunnel', 0.02, 0.98, 275, 96], ['tunnel', 0.1, 0.9, 395, 56], ['shaft', 0.3, 175, 395, 14], ['shaft', 0.5, 260, 395, 14]] },
  { key: 'cheese', name: '치즈', emoji: '🧀', tag: '땅속이 구멍투성이', ops: [['surf', 210, 0.8], ['holes', 14, 34]] },
  { key: 'arch', name: '아치', emoji: '🌈', ops: [['surf', 260, 0.6], ['bump', 0.5, 0.15, 150], ['window', 0.5, 220, 0.06, 55]] },
  { key: 'lavatube', name: '용암 동굴', emoji: '🌋', tag: '화산 속 빈 방', ops: [['surf', 260, 0.6], ['spike', 0.5, 0.15, 170], ['cave', 0.5, 250, 0.045, 60], ['tunnel', 0.3, 0.7, 330, 40]] },
  { key: 'ramparts', name: '성벽', emoji: '🏰', tag: '벽에 구멍', ops: [['surf', 255, 0.5], ['mesa', 0.38, 0.02, 120], ['cave', 0.38, 200, 0.03, 16]] },
  // ── 공중(섬·다리·오버행) ──
  { key: 'skyisles', name: '하늘섬', emoji: '☁️', scenery: 'sky', ops: [['empty'], ['spawnIsle', 80, 34], ['rock', 0.5, 220, 0.06, 18], ['rock', 0.36, 320, 0.035, 14]] },
  { key: 'bridge', name: '구름다리', emoji: '🌉', scenery: 'sky', ops: [['surf', 250, 0.5], ['gap', 0.5, 0.13], ['slab', 0.36, 0.64, 252, 8]] },
  { key: 'overhang', name: '오버행', emoji: '🪨', tag: '머리 위 바위', ops: [['surf', 265, 0.7], ['rock', 0.42, 150, 0.08, 22], ['rock', 0.5, 120, 0.04, 16]] },
  { key: 'decks', name: '선반', emoji: '📚', tag: '층층이 판', ops: [['surf', 300, 0.4], ['slab', 0.3, 0.45, 220, 10], ['slab', 0.44, 0.56, 150, 10]] },
  { key: 'abyss', name: '대협곡', emoji: '🕳', scenery: 'sky', ops: [['surf', 240, 0.8], ['gap', 0.5, 0.11], ['rock', 0.5, 200, 0.03, 14]] },
  { key: 'pillars', name: '기둥', emoji: '🏛', scenery: 'sky', tag: '사방이 낭떠러지', ops: [['surf', 240, 0.6], ['pillars', 34, 2]] },
  // ── 바다 ──
  { key: 'islands', name: '세 섬', emoji: '🏝', scenery: 'sea', ops: [['surf', 270, 0.6], ['gap', 0.42, 0.03], ['bump', 0.5, 0.04, 50]] },
  { key: 'seastacks', name: '갯바위', emoji: '🗿', scenery: 'sea', tag: '사방이 바다', ops: [['surf', 250, 0.8], ['pillars', 40, 1]] },
  { key: 'seacave', name: '해식 동굴', emoji: '🐚', scenery: 'sea', tag: '바다 밑 굴', under: 'some', ops: [['surf', 230, 0.6], ['tunnel', 0.05, 0.95, 345, 58], ['gap', 0.5, 0.03]] },
  { key: 'reef', name: '산호초', emoji: '🐠', scenery: 'sea', ops: [['surf', 270, 0.5], ['wave', 7, 18], ['cave', 0.44, 320, 0.05, 40], ['gap', 0.5, 0.025]] },
  // ── 우주 ──
  { key: 'asteroids', name: '소행성대', emoji: '☄️', scenery: 'space', ops: [['empty'], ['spawnIsle', 64, 40], ['floaters', 7, 34]] },
  { key: 'moon', name: '달 표면', emoji: '🌕', scenery: 'space', ops: [['surf', 260, 0.5], ['bump', 0.4, 0.03, -50], ['bump', 0.5, 0.05, -70], ['holes', 6, 26]] },
  { key: 'station', name: '우주 정거장', emoji: '🛰', scenery: 'space', tag: '떠 있는 갑판', ops: [['empty'], ['spawnIsle', 70, 16], ['slab', 0.32, 0.68, 260, 10], ['slab', 0.42, 0.58, 170, 8], ['rock', 0.5, 260, 0.03, 30]] },
  { key: 'mars', name: '붉은 행성', emoji: '🪐', scenery: 'space', ops: [['surf', 255, 0.8], ['wave', 4, 30], ['spike', 0.5, 0.08, 90], ['cave', 0.5, 310, 0.08, 34]] },
  // ── 높은 데서 시작(2026-11-09 사용자 요청: 그네 선반·잠수교 같은 맵) ──
  { key: 'swings', name: '그네 선반', emoji: '🎠', scenery: 'sky', tag: '높이 매달린 선반에서 시작', ops: [['surf', 380, 0.4], ['gap', 0.5, 0.08], ['spawnShelf', 150, 46, 10], ['rock', 0.5, 210, 0.035, 10]] },
  { key: 'jamsu', name: '잠수교', emoji: '🌉', scenery: 'sea', tag: '2층 다리의 아래층에서 시작', under: 'all', ops: [['empty'], ['slab', 0, 1, 205, 14], ['slab', 0, 1, 330, 10], ['posts', [0.05, 0.44], 212, 440, 10]] },
  { key: 'scaffold', name: '공사장 비계', emoji: '🏗', tag: '층층이 발판', under: 'some', ops: [['surf', 390, 0.3], ['slab', 0.02, 0.46, 300, 8], ['slab', 0.08, 0.4, 200, 8], ['slab', 0.42, 0.58, 250, 8], ['posts', [0.185, 0.44], 200, 390, 4]] },
  { key: 'rooftops', name: '빌딩 옥상', emoji: '🏙', tag: '옥상에서 시작', ops: [['surf', 400, 0.2], ['spawnTower', 250, 90]] },
]

export function mulberry(a: number) {
  let s = a >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const mapOfSeed = (seed: number): FortMap => FORT_MAPS[Math.floor(mulberry((seed ^ 0x9e3779b9) >>> 0)() * FORT_MAPS.length)]

// ── 칸 지도 ──────────────────────────────────────
// bg = 원래 땅속이던 칸(1) — 파여서 비면 굴 벽처럼 어둡게 그림. 하늘·낭떠러지·섬 사이 같은 바깥 공간은 0(하늘이 보임)
export type Grid = { w: number; h: number; cols: number; rows: number; solid: Uint8Array; bg: Uint8Array; grav: number }
export const newGrid = (w: number, grav = 1): Grid => {
  const cols = Math.ceil(w / CELL), rows = Math.ceil(WH / CELL)
  return { w, h: WH, cols, rows, solid: new Uint8Array(cols * rows), bg: new Uint8Array(cols * rows), grav }
}
export const cloneGrid = (g: Grid): Grid => ({ ...g, solid: g.solid.slice() }) // bg는 판 내내 그대로라 같이 씀
export function isSolid(g: Grid, x: number, y: number) {
  if (x < 0 || x >= g.w || y < 0 || y >= g.h) return false
  return g.solid[((y / CELL) | 0) * g.cols + ((x / CELL) | 0)] === 1
}
export function paintEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, v: 0 | 1) {
  const c0 = Math.max(0, Math.floor((cx - rx) / CELL)), c1 = Math.min(g.cols - 1, Math.ceil((cx + rx) / CELL))
  const r0 = Math.max(0, Math.floor((cy - ry) / CELL)), r1 = Math.min(g.rows - 1, Math.ceil((cy + ry) / CELL))
  for (let r = r0; r <= r1; r++) {
    const dy = (r * CELL + CELL / 2 - cy) / ry
    for (let c = c0; c <= c1; c++) {
      const dx = (c * CELL + CELL / 2 - cx) / rx
      if (dx * dx + dy * dy <= 1) g.solid[r * g.cols + c] = v
    }
  }
}
export function paintRect(g: Grid, x0: number, y0: number, x1: number, y1: number, v: 0 | 1) {
  const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(g.cols - 1, Math.ceil(x1 / CELL) - 1)
  const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(g.rows - 1, Math.ceil(y1 / CELL) - 1)
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g.solid[r * g.cols + c] = v
}
// x 위치에서 위에서부터 첫 땅(y) — 없으면 null
export function topAt(g: Grid, x: number): number | null {
  const c = Math.floor(x / CELL)
  if (c < 0 || c >= g.cols) return null
  for (let r = 0; r < g.rows; r++) if (g.solid[r * g.cols + c]) return r * CELL
  return null
}
// 첫 땅 덩어리 밑의 빈 곳을 지나 다음 땅(아래층 바닥) — 없으면 null
export function underAt(g: Grid, x: number): number | null {
  const c = Math.floor(x / CELL)
  if (c < 0 || c >= g.cols) return null
  let r = 0
  while (r < g.rows && !g.solid[r * g.cols + c]) r++
  while (r < g.rows && g.solid[r * g.cols + c]) r++
  const gapTop = r
  while (r < g.rows && !g.solid[r * g.cols + c]) r++
  return r < g.rows && (r - gapTop) * CELL >= 24 ? r * CELL : null // 빈 곳이 24px 이상이어야 "층"
}

// 맵 만들기 — spawnXs = 요새 자리 x들(왼쪽 팀 먼저). 돌려주는 spawnYs = 각 요새 발 높이.
export function buildMap(map: FortMap, seed: number, w: number, spawnXs: number[], underIdx: boolean[]): { grid: Grid; spawnYs: number[] } {
  const g = newGrid(w, map.scenery ? SCENERY[map.scenery].grav : 1)
  const r = mulberry(seed)
  const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28
  const f1 = 0.006 + r() * 0.004, f2 = 0.014 + r() * 0.008, f3 = 0.03 + r() * 0.02
  const k = 0.8 + r() * 0.4 // 지형 크기 흔들기(판마다)
  const mid = w / 2
  const mir = (u: number) => (Math.abs(u - 0.5) < 1e-6 ? [u] : [u, 1 - u]) // 좌우 대칭
  // 1) 표면 높이(대칭 잡음) + 표면 모양
  const surf = map.ops.find(o => o[0] === 'surf') as ['surf', number, number] | undefined
  const ys = new Float64Array(g.cols)
  for (let c = 0; c < g.cols; c++) {
    const x = c * CELL + CELL / 2
    const d = Math.abs(x - mid) // 대칭
    const nz = surf ? surf[2] : 0
    let y = (surf ? surf[1] : WH + 10) + nz * (26 * Math.sin(d * f1 + p1) + 14 * Math.sin(d * f2 + p2) + 5 * Math.sin(d * f3 + p3))
    const u = x / w
    for (const o of map.ops) {
      if (o[0] === 'wave') y -= o[2] * k * Math.cos((u - 0.5) * o[1] * 2 * Math.PI)
      else if (o[0] === 'bump' || o[0] === 'mesa' || o[0] === 'spike') {
        for (const cu of mir(o[1])) {
          const dd = (u - cu) / o[2]
          y -= o[3] * k * (o[0] === 'bump' ? Math.exp(-(dd * dd)) : o[0] === 'mesa' ? Math.exp(-(dd ** 6)) : Math.max(0, 1 - Math.abs(dd)))
        }
      }
    }
    const ter = map.ops.find(o => o[0] === 'terrace') as ['terrace', number] | undefined
    if (ter) y = Math.round(y / ter[1]) * ter[1]
    ys[c] = surf ? Math.max(60, Math.min(WH - 40, y)) : WH + 10
  }
  for (let c = 0; c < g.cols; c++) for (let rr = Math.max(0, Math.floor(ys[c] / CELL)); rr < g.rows; rr++) g.solid[rr * g.cols + c] = 1
  g.bg.set(g.solid) // 원래 땅속
  const clearBg = (x0: number, y0: number, x1: number, y1: number) => {
    for (let r = Math.max(0, Math.floor(y0 / CELL)); r < Math.min(g.rows, Math.ceil(y1 / CELL)); r++) for (let c = Math.max(0, Math.floor(x0 / CELL)); c < Math.min(g.cols, Math.ceil(x1 / CELL)); c++) g.bg[r * g.cols + c] = 0
  }
  // 2) 붙이기·파기
  const R = mulberry((seed ^ 0x2545f491) >>> 0)
  for (const o of map.ops) {
    switch (o[0]) {
      case 'gap': for (const cu of mir(o[1])) { paintRect(g, (cu - o[2]) * w, 0, (cu + o[2]) * w, WH, 0); clearBg((cu - o[2]) * w, 0, (cu + o[2]) * w, WH) } break
      case 'window': for (const cu of mir(o[1])) {
        paintEllipse(g, cu * w, o[2], o[3] * w, o[4], 0)
        const save = g.solid
        g.solid = g.bg; paintEllipse(g, cu * w, o[2], o[3] * w, o[4], 0); g.solid = save
      } break
      case 'posts': for (const u0 of o[1]) for (const cu of mir(u0)) paintRect(g, cu * w - o[4], o[2], cu * w + o[4], o[3], 1); break
      case 'cave': for (const cu of mir(o[1])) paintEllipse(g, cu * w, o[2], o[3] * w, o[4], 0); break
      case 'rock': for (const cu of mir(o[1])) paintEllipse(g, cu * w, o[2], o[3] * w, o[4], 1); break
      case 'slab': paintRect(g, o[1] * w, o[3] - o[4] / 2, o[2] * w, o[3] + o[4] / 2, 1); if (o[1] < 0.5 && o[2] < 0.5) paintRect(g, (1 - o[2]) * w, o[3] - o[4] / 2, (1 - o[1]) * w, o[3] + o[4] / 2, 1); break
      case 'tunnel': {
        // 굽이치는 굴: 동그라미를 이어 판다(대칭으로)
        const [, u0, u1, cy, hh] = o
        const ph = R() * 6.28
        for (let x = u0 * w; x <= u1 * w; x += 6) {
          const d = Math.abs(x - mid)
          const yy = cy + 14 * Math.sin(d * 0.012 + ph)
          paintEllipse(g, x, yy, 16, hh / 2, 0)
          paintEllipse(g, w - x, yy, 16, hh / 2, 0)
        }
        break
      }
      case 'shaft': for (const cu of mir(o[1])) paintRect(g, cu * w - o[4], o[2] - 4, cu * w + o[4], o[3], 0); break
      case 'holes': {
        for (let i = 0; i < o[1] / 2; i++) {
          const u = 0.04 + R() * 0.44, top = topAt(g, u * w) ?? 250
          const y = top + 40 + R() * (WH - top - 70)
          const rr = o[2] * (0.6 + R() * 0.7)
          for (const cu of mir(u)) paintEllipse(g, cu * w, y, rr * 1.3, rr, 0)
        }
        break
      }
      case 'floaters': {
        for (let i = 0; i < o[1] / 2; i++) {
          const u = 0.36 + R() * 0.14, y = 150 + R() * 200, rr = o[2] * (0.6 + R() * 0.7)
          for (const cu of mir(u)) paintEllipse(g, cu * w, y, rr * 1.2, rr * 0.8, 1)
        }
        break
      }
      default: break
    }
  }
  // 3) 요새 자리별 지형(기둥·섬·벙커)
  const pil = map.ops.find(o => o[0] === 'pillars') as ['pillars', number, number] | undefined
  if (pil) {
    const keep = new Uint8Array(g.cols)
    for (const sx of spawnXs) for (let c = Math.floor((sx - pil[1]) / CELL); c <= Math.ceil((sx + pil[1]) / CELL); c++) if (c >= 0 && c < g.cols) keep[c] = 1
    for (let i = 0; i < pil[2]; i++) {
      const u = 0.4 + (0.2 * (i + 0.5)) / pil[2]
      for (let c = Math.floor((u * w - 16) / CELL); c <= Math.ceil((u * w + 16) / CELL); c++) if (c >= 0 && c < g.cols) keep[c] = 1
    }
    for (let c = 0; c < g.cols; c++) if (!keep[c]) for (let rr = 0; rr < g.rows; rr++) { g.solid[rr * g.cols + c] = 0; g.bg[rr * g.cols + c] = 0 }
    g.bg.fill(0) // 기둥 맵은 굴 벽 없음 — 기둥이 파이면 뒤의 바다·하늘이 그대로 보여 뚫린 게 분명히 보이게(2026-11-09: 짙은 회색이라 파인 줄 모름)
  }
  const isle = map.ops.find(o => o[0] === 'spawnIsle') as ['spawnIsle', number, number] | undefined
  if (isle) for (const sx of spawnXs) paintEllipse(g, sx, 270, isle[1], isle[2], 1)
  const shelf = map.ops.find(o => o[0] === 'spawnShelf') as ['spawnShelf', number, number, number] | undefined
  if (shelf) for (const sx of spawnXs) paintRect(g, sx - shelf[2], shelf[1], sx + shelf[2], shelf[1] + shelf[3], 1)
  const tower = map.ops.find(o => o[0] === 'spawnTower') as ['spawnTower', number, number] | undefined
  if (tower) {
    // 틈 없이 붙은 빌딩 스카이라인(폭 70~120px, 옥상 높이 들쭉날쭉, 좌우 대칭) — 따로 솟은 기둥처럼 보이지 않게(2026-11-09)
    const RT = mulberry((seed ^ 0x7f4a7c15) >>> 0)
    let x = 0
    while (x < mid) {
      const bw = 70 + RT() * 50
      const top = tower[1] - RT() * tower[2] + (RT() < 0.25 ? 50 : 0) // 가끔 낮은 건물
      paintRect(g, x, top, Math.min(mid, x + bw), WH, 1)
      paintRect(g, w - Math.min(mid, x + bw), top, w - x, WH, 1)
      x += bw
    }
    // 요새 자리 건물은 옥상을 평평하게 넓혀 둠(양옆 40px)
    for (const sx of spawnXs) {
      const top = topAt(g, sx) ?? tower[1]
      paintRect(g, sx - 40, 0, sx + 40, top, 0)
      paintRect(g, sx - 40, top, sx + 40, WH, 1)
    }
  }
  const bunker = map.ops.find(o => o[0] === 'spawnBunker') as ['spawnBunker', number, number] | undefined
  if (bunker) {
    for (const sx of spawnXs) {
      const top = topAt(g, sx) ?? 230
      const fy = top + bunker[1]
      paintRect(g, sx - bunker[2], fy - 60, sx + bunker[2], fy, 0) // 방
      const dir = sx < mid ? 1 : -1 // 가운데 쪽으로 넓은 출구(비스듬히 위로) + 지붕의 채광창
      for (let i = 0; i < 30; i++) paintEllipse(g, sx + dir * (bunker[2] * 0.6 + i * 4), fy - 30 - i * 2.4, 22, 28, 0)
      paintRect(g, sx + dir * bunker[2] * 0.2 - 12, fy - bunker[1] - 10, sx + dir * bunker[2] * 0.2 + 12, fy - 50, 0)
    }
  }
  // 4) 요새 자리: 서 있을 바닥 + 머리 위 빈 곳
  const spawnYs = spawnXs.map((sx, i) => {
    let y = (underIdx[i] ? underAt(g, sx) : null) ?? topAt(g, sx) ?? 270
    if (y > WH - 24) y = WH - 60 // 바닥이 없거나 너무 낮으면 받침을 만들어 줌
    paintRect(g, sx - 20, y - 36, sx + 20, y, 0)
    paintRect(g, sx - 22, y, sx + 22, y + 14, 1)
    return y
  })
  return { grid: g, spawnYs }
}
