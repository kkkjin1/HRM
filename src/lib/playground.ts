// 오늘의 운동장 — 순수 로직(옆에서 본 무대 지형·이동·장애물 흐름·충돌).
// 화면(PlaygroundWidget)과 난이도 시뮬레이터(playground.test.ts)가 같이 쓴다.
//
// 무대(가로 W, 왼→오): [🏢 야근 사무실 0~MTN_L] [⛰ 퇴근산 MTN_L~MTN_R, 정상 PEAK_X] [🏠 칼퇴 집 MTN_R~W]
// 매일 모두 사무실에서 시작. 산 왼쪽 비탈을 오르며 굴러오는 장애물을 Space로 피하고 정상을 넘으면 칼퇴.
// 장애물은 "서버 시각 + 날짜" 로 정해지는 공용 흐름이라 모두가 같은 장애물을 본다.
// 걸리면 사무실 쪽 기슭으로 굴러떨어지고 하루 기회(FALL_LIMIT)가 하나 줄어든다.
// 퇴근길(무대+게임)은 요일마다 바뀐다(modeOf): 월·주말 퇴근산 산사태 / 화 사무실 복도 탈출 / 수 업무 탄막 피하기 / 목 옥상 양궁 / 금 단체 줄넘기.
// 무대 가로 구역은 모두 같다: 출발(사무실 0~MTN_L) → 도전 구간(MTN_L~PEAK_X, PEAK_X가 결승선) → 도착 쪽(PEAK_X~W). 높이만 무대마다 다르다(terrainOf).

export const W = 1080
export const H = 320
export const GY = 286 // 평지 땅 높이(화면 y)
export const MTN_L = 200
export const PEAK_X = 610 // 사무실 쪽 비탈이 길고(오래 오른다) 집 쪽은 짧다
export const MTN_R = 870
export const PEAK_H = 200
export const EDGE = 14
export const DEPTH_MAX = 26 // 평지에서 ↑↓로 앞뒤로 움직이는 폭

export const WALK_SPEED = 150 // 평지 px/초
export const CLIMB_SPEED = 46 // 사무실 쪽 비탈 오르기(가로 px/초)
export const DESCEND_SPEED = 120 // 비탈 내려가기
export const DEPTH_SPEED = 80
export const JUMP_V = 430 // px/초
export const GRAVITY = 1500 // px/초²  → 체공 약 0.57초, 최고 약 62px
export const PLAYER_W = 18
export const PLAYER_H = 30
export const FALL_LIMIT = 5 // 하루에 굴러떨어질 수 있는 횟수
export const SWING_REACH = 54
export const SWING_DEPTH = 20
export const KNOCKBACK = 50
export const SWING_COOLDOWN_MS = 600
export const GRAB_REACH = 26 // 산에서 바로 앞사람을 붙잡을 수 있는 거리
export const BOMB_COOLDOWN_MS = 10_000
export const MESSAGE_MAX = 30

export type Side = 'night' | 'off'

// 무대 높이: 퇴근산(산사태) = 산 / 나머지(복도·주차장·옥상·광장·빙판) = 평지
export function terrainOf(mode: Mode): 'mountain' | 'flat' {
  return mode === 'landslide' ? 'mountain' : 'flat'
}
export function slopeHeight(x: number, mode: Mode = 'landslide') {
  const terrain = terrainOf(mode)
  if (terrain === 'flat' || x <= MTN_L || x >= MTN_R) return 0
  return x <= PEAK_X ? PEAK_H * (x - MTN_L) / (PEAK_X - MTN_L) : PEAK_H * (MTN_R - x) / (MTN_R - PEAK_X)
}
export function surfaceY(x: number, mode: Mode = 'landslide') { return GY - slopeHeight(x, mode) }
export const onMountain = (x: number) => x > MTN_L && x < MTN_R
export const onClimbSide = (x: number) => x > MTN_L && x < PEAK_X // 장애물이 굴러오는 쪽 비탈
export const onHomeSlope = (x: number) => x >= PEAK_X && x < MTN_R

// 오늘 기록이 없는 사람의 기본 자리 — 사무실 평지에 명단 순서대로
export function spawnOf(index: number): { x: number; z: number } {
  // 이름표가 겹치지 않게 가로 간격 + 홀짝으로 앞뒤 엇갈림
  const cols = 4
  return { x: 34 + (index % cols) * 40 + (Math.floor(index / cols) % 2) * 20, z: (index % 2) * 18 + (Math.floor(index / cols) % 2) * 6 }
}

// 평지에서 휘두르기 대상 — 바라보는 쪽, 같은 평지, 앞뒤(z) 가까운 사람
export function swingTargets(me: { x: number; z: number }, facing: 1 | -1, others: { id: string; x: number; z: number }[]) {
  return others.filter(o => {
    if (onMountain(o.x)) return false
    const dx = (o.x - me.x) * facing
    return dx >= -6 && dx <= SWING_REACH && Math.abs(o.z - me.z) <= SWING_DEPTH
  }).map(o => o.id)
}

// 산(사무실 쪽 비탈)에서 붙잡을 수 있는 앞사람 — 나는 땅에 서 있고, 상대는 내 바로 앞(정상 쪽) GRAB_REACH 안,
// 굴러떨어지는 중이 아니고 높이 뛰어 있지 않을 때. 여럿이면 가장 가까운 사람.
export function grabTarget(me: { x: number; jy: number }, others: { id: string; x: number; jy: number; tumbling: boolean }[]) {
  if (!onClimbSide(me.x) || me.jy > 0) return null
  let best: { id: string; d: number } | null = null
  for (const o of others) {
    const d = o.x - me.x
    if (!onClimbSide(o.x) || o.tumbling || o.jy > 10 || d <= 2 || d > GRAB_REACH) continue
    if (!best || d < best.d) best = { id: o.id, d }
  }
  return best?.id ?? null
}

// 평지에서 밀려날 때 비탈로 넘어가지 않게
export function clampFlat(x: number, side: Side) {
  return side === 'night' ? Math.min(MTN_L - 4, Math.max(EDGE, x)) : Math.min(W - EDGE, Math.max(MTN_R + 4, x))
}

// ── 장애물 흐름(서류 산사태) ──────────────────────────────────────────
// WAVE_MS마다 한 묶음. 묶음 안의 출발 시각·종류·속도는 (날짜, 묶음 번호)로 정해져 모두 같다.
// 장애물은 정상에서 출발해 사무실 쪽 비탈을 따라 내려오고 기슭에서 사라진다.

export type ObstacleKind = 'doc' | 'pile' | 'boss' | 'ping' | 'bomb'
export type Obstacle = { id: string; kind: ObstacleKind; start: number; speed: number; w: number; bottom: number; top: number; label: string }
export type LiveObstacle = Obstacle & { x: number }

export const WAVE_MS = 3200
const KINDS: Record<ObstacleKind, { w: number; bottom: number; top: number; labels: string[]; speed: [number, number] }> = {
  doc: { w: 20, bottom: 0, top: 22, labels: ['📄', '📎', '☕'], speed: [170, 240] },
  pile: { w: 32, bottom: 0, top: 32, labels: ['📚', '🗂️'], speed: [130, 175] },
  boss: { w: 22, bottom: 0, top: 50, labels: ['🧑‍💼', '📞'], speed: [110, 140] },
  ping: { w: 26, bottom: 34, top: 56, labels: ['💬', '📧', '🔔'], speed: [230, 300] },
  bomb: { w: 24, bottom: 0, top: 26, labels: ['💣'], speed: [260, 260] },
}

export function obstacleShape(kind: ObstacleKind) { return KINDS[kind] }

function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 모드별 장애물 양: [최소 개수, 추가 최대 개수, 최소 간격 ms, 속도 배율]
const DENSITY: Record<Mode, [number, number, number, number]> = {
  landslide: [1, 2, 650, 1],
  rope: [0, 0, 0, 1],
  dodge: [0, 0, 0, 1],
  archery: [0, 0, 0, 1],
  patrol: [0, 0, 0, 1], // 화요일은 산사태 없이 부장님 순찰만(완전히 다른 게임)
  curling: [0, 0, 0, 1],
}

const waveCache = new Map<string, Obstacle[]>()
export function waveOf(day: string, k: number, mode: Mode = 'landslide'): Obstacle[] {
  const key = mode === 'landslide' ? `${day}#${k}` : `${day}#${mode}#${k}`
  const hit = waveCache.get(key)
  if (hit) return hit
  const rnd = mulberry32(hashStr(key))
  const [base, extra, gapMs, speedMul] = DENSITY[mode]
  const n = base + Math.floor(rnd() * (extra + 1))
  const times: number[] = []
  for (let i = 0; i < n; i++) times.push(rnd() * WAVE_MS)
  times.sort((a, b) => a - b)
  // 너무 붙은 건 살짝 밀어서 "절대 못 피하는" 겹침을 줄인다
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1] + gapMs)
  const out: Obstacle[] = times.map((t, i) => {
    const r = rnd()
    const kind: ObstacleKind = r < 0.34 ? 'doc' : r < 0.54 ? 'pile' : r < 0.74 ? 'boss' : 'ping'
    const s = KINDS[kind]
    const speed = (s.speed[0] + rnd() * (s.speed[1] - s.speed[0])) * speedMul
    return { id: `${k}-${i}`, kind, start: k * WAVE_MS + t, speed, w: s.w, bottom: s.bottom, top: s.top, label: s.labels[Math.floor(rnd() * s.labels.length)] }
  })
  if (waveCache.size > 200) waveCache.clear()
  waveCache.set(key, out)
  return out
}

export function bombObstacle(id: string, start: number): Obstacle {
  const s = KINDS.bomb
  return { id: `b-${id}`, kind: 'bomb', start, speed: s.speed[0], w: s.w, bottom: s.bottom, top: s.top, label: '💣' }
}

// t = 서버 시각(ms, 하루 안에서 쓰는 절대값이면 됨) 에 비탈 위에 있는 장애물들
export function liveObstacles(day: string, t: number, extra: Obstacle[] = [], mode: Mode = 'landslide'): LiveObstacle[] {
  const k = Math.floor(t / WAVE_MS)
  const out: LiveObstacle[] = []
  // 긴 비탈을 다 내려오는 데 WAVE_MS보다 오래 걸려서 두 묶음 전까지 본다
  for (const o of [...waveOf(day, k - 2, mode), ...waveOf(day, k - 1, mode), ...waveOf(day, k, mode), ...extra]) {
    if (t < o.start) continue
    const x = PEAK_X - ((t - o.start) / 1000) * o.speed
    if (x < MTN_L - o.w) continue
    out.push({ ...o, x })
  }
  return out
}

// 플레이어(x, 비탈 위 높이 jy)가 장애물과 부딪혔는지 — 높이는 "그 자리 지면 기준"
export function hitBy(px: number, jy: number, obstacles: LiveObstacle[]): LiveObstacle | null {
  if (!onClimbSide(px)) return null
  for (const o of obstacles) {
    if (Math.abs(o.x - px) > (o.w + PLAYER_W) / 2) continue
    if (jy < o.top && jy + PLAYER_H > o.bottom) return o
  }
  return null
}

// ── 요일별 산 넘기 방식 ──────────────────────────────────────────────

export type Mode = 'landslide' | 'patrol' | 'dodge' | 'archery' | 'rope' | 'curling'
// name = 게임, place = 무대, goal = 칼퇴 알림 문구("OO {goal} 칼퇴!"), go = 출발 안내
export const MODES: Record<Mode, { name: string; emoji: string; place: string; goal: string; go: string; help: string }> = {
  landslide: { name: '서류 산사태', emoji: '📄', place: '⛰ 퇴근산', goal: '퇴근산을 넘어', go: '→ 퇴근산 오르기', help: '굴러오는 장애물을 Space로 뛰어넘으며 정상까지 · 머리 높이 💬는 뛰면 맞음' },
  patrol: { name: '부장님 몰래 탈출', emoji: '👀', place: '🏢 사무실 복도', goal: '부장님 몰래 탈출해', go: '→ 살금살금 출입문으로', help: '부장님이 돌아보면(👀) 멈추기 — 그때 움직이거나 뛰면 걸림 · "흠?"이 신호, 가끔 페이크' },
  dodge: { name: '업무 탄막 피하기', emoji: '🔫', place: '🅿️ 회사 주차장', goal: '업무 탄막을 뚫고', go: '→ 주차장으로 들어가기', help: '주차장 안에서 20초 버티면 칼퇴 · 낮게 날아오는 건 Space로 뛰어넘고, 머리 높이로 오는 건 뛰지 말기, 위에서 떨어지는 건(그림자) ←→로 피하기' },
  curling: { name: '퇴근 컬링', emoji: '🥌', place: '🧊 회사 앞 빙판', goal: '컬링 스톤을 하우스에 넣고', go: '→ 투구 자리로', help: '투구 자리에서 Space = 힘 고정 → 스톤 출발 · 미끄러지는 동안 ←→ 번갈아 연타 = 스위핑(덜 멈춰서 더 멀리) · 하우스 가운데일수록 고득점, 3투 합계 20점 이상 칼퇴' },
  archery: { name: '옥상 양궁', emoji: '🏹', place: '🏙 회사 옥상', goal: '양궁 과녁을 뚫고', go: '→ 사대(발사 자리)로', help: '사대에서 Space 한 번 = 각도 고정, 한 번 더 = 힘 고정 → 발사 · 바람(깃발)과 위아래로 움직이는 과녁을 읽어 3발 합계 24점 이상이면 칼퇴' },
  rope: { name: '단체 줄넘기', emoji: '🪢', place: '🎆 회사 앞 광장', goal: '단체 줄넘기 성공으로', go: '→ 줄 안으로 들어가기', help: '줄 안에 들어간 사람 모두가 줄이 바닥에 닿을 때 떠 있어야 1회 · 한 명이라도 걸리면 0부터 · 목표 횟수를 채우면 참여자 전원 칼퇴 🎆 (기회 차감 없음)' },
}
export const MODE_ORDER: Mode[] = ['landslide', 'patrol', 'dodge', 'archery', 'rope', 'curling']

// 날짜(YYYY-MM-DD, KST) → 그날의 퇴근길. 월·토·일 = 산사태 (컬링은 후보로만 남겨 둠)
export function modeOf(day: string): Mode {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
  return wd === 2 ? 'patrol' : wd === 3 ? 'dodge' : wd === 4 ? 'archery' : wd === 5 ? 'rope' : 'landslide'
}

// 화 — 사무실 복도 탈출(무궁화 꽃이 피었습니다). 주기마다: 딴 데 봄 → "흠?"(경고) → 돌아봄. 4번에 1번은 경고만 하고 안 돌아보는 페이크.
export const PATROL_CYCLE_MS = 5000
export const PATROL_WARN_MS = 380
export const PATROL_GRACE_MS = 120 // 돌아본 직후 이만큼은 봐준다(반응 시간)
export type BossLook = 'away' | 'warn' | 'look'
export function bossLook(day: string, t: number): BossLook {
  const k = Math.floor(t / PATROL_CYCLE_MS)
  const rnd = mulberry32(hashStr(`${day}#boss#${k}`))
  const away = 1700 + rnd() * 1900
  const fake = rnd() < 0.25
  const local = t - k * PATROL_CYCLE_MS
  if (local < away) return 'away'
  if (local < away + PATROL_WARN_MS) return 'warn'
  return fake ? 'away' : 'look'
}
// 걸리는 판정용 — 돌아본 지 PATROL_GRACE_MS가 지났을 때만
export const bossCatching = (day: string, t: number) => bossLook(day, t) === 'look' && bossLook(day, t - PATROL_GRACE_MS) === 'look'

// 퇴근 컬링(후보). 투구 자리(HACK)에서 Space = 차오르내리는 힘 고정 → 스톤이 오른쪽으로 미끄러진다.
// 마찰로 점점 느려지는데, 미끄러지는 동안 ←→를 번갈아 연타하면 스위핑(마찰 줄어듦) → 더 멀리 간다.
// 멈춘 자리가 하우스 가운데(HOUSE_X)에 가까울수록 고득점. 호그라인(HOG_X) 못 넘거나 백라인(BACK_X) 넘으면 0점.
export const HACK_X = MTN_L + 26
export const HACK_BOX = 22
export const STONE_X0 = HACK_X + 16
export const HOG_X = MTN_L + 170
export const HOUSE_X = PEAK_X - 50
export const HOUSE_R = 46
export const BACK_X = HOUSE_X + HOUSE_R + 14
export const STONE_VMAX = 320
export const CURL_FRICTION = 70 // px/초² (그냥 미끄러질 때)
export const SWEEP_FRICTION = 30 // 스위핑 중
export const SWEEP_WINDOW_MS = 400 // 이 시간 안에 번갈아 2번 이상 누르면 스위핑 중
export const CURL_STONES = 3
export const CURL_PASS = 20
export const CURL_POWER_MS = 1300
export const atHack = (x: number) => Math.abs(x - HACK_X) <= HACK_BOX
export const curlPowerAt = (t: number) => 0.3 + 0.7 * sweep(t, CURL_POWER_MS)
export function curlScore(x: number) {
  if (x < HOG_X || x > BACK_X) return 0
  const d = Math.abs(x - HOUSE_X)
  return d < 6 ? 10 : d < 15 ? 8 : d < 26 ? 6 : d < 36 ? 4 : d < HOUSE_R ? 2 : 0
}
// 스톤 한 프레임: 스위핑 중이면 마찰이 작다. 멈추면 v = 0
export function stoneStep(st: { x: number; v: number }, sweeping: boolean, dt: number) {
  const v = Math.max(0, st.v - (sweeping ? SWEEP_FRICTION : CURL_FRICTION) * dt)
  return { x: st.x + ((st.v + v) / 2) * dt, v }
}

// ── 금 — 단체 줄넘기 ───────────────────────────────────────────────
// 줄은 ROPE_PERIOD_MS마다 바닥을 친다(서버 시각, 모두 같음). 그 순간 앞뒤 ROPE_HALF_MS 동안 ROPE_CLEAR보다 높이 떠 있어야 통과.
// 줄 안(ROPE_L~ROPE_R)에 있던 사람 전원이 통과해야 1회, 한 명이라도 걸리면 0부터. 참여 인원이 많을수록 목표 횟수는 적다.
export const ROPE_PERIOD_MS = 780 // 빨라짐(900 → 780)
export const ROPE_HALF_MS = 90 // 줄이 바닥에 머무는 시간이 길어져서 더 오래 떠 있어야 함(70 → 90)
export const ROPE_CLEAR = 16 // 더 높이 떠야 함(12 → 16)
export const ROPE_L = MTN_L + 130
export const ROPE_R = PEAK_X - 70
export const inRope = (x: number) => x >= ROPE_L && x <= ROPE_R
export const ropeNeed = (n: number) => (n >= 3 ? 9 : n === 2 ? 12 : 16)
// 가장 가까운 "줄이 바닥에 닿는" 박자와 그로부터의 오프셋(ms)
export function ropeBeat(t: number) {
  const k = Math.round(t / ROPE_PERIOD_MS)
  return { k, off: t - k * ROPE_PERIOD_MS }
}
// 줄 그림용 각도(0 = 바닥, π = 머리 위)
export const ropeAngle = (t: number) => ((((t % ROPE_PERIOD_MS) + ROPE_PERIOD_MS) % ROPE_PERIOD_MS) / ROPE_PERIOD_MS) * Math.PI * 2

// ── 수 — 업무 탄막 피하기 ────────────────────────────────────────
// 주차장(ARENA) 안에서 DODGE_SURVIVE_MS 버티면 칼퇴. 탄막은 서버 시각·날짜 시드라 모두 같은 탄을 피한다.
// low = 땅 쪽으로 날아옴(뛰어넘기) / high = 머리 높이(뛰면 맞음, 서 있으면 지나감) / drop = 위에서 떨어짐(그림자 보고 옆으로 피하기)
export const DODGE_SURVIVE_MS = 20000
export const ARENA_L = MTN_L + 4
export const ARENA_R = PEAK_X - 46
export const SHOOTER_X = PEAK_X - 24
export const DODGE_WAVE_MS = 2000
export const DROP_FROM = 230 // 떨어지기 시작하는 높이(땅에서 px)
export const SHOT_SPEED = 280
export type ShotKind = 'low' | 'high' | 'drop'
export type Shot = { id: string; kind: ShotKind; start: number; speed: number; x0: number; fall: number; w: number; label: string }
export type LiveShot = Shot & { x: number; bottom: number; top: number }
const SHOT_BAND: Record<'low' | 'high', [number, number]> = { low: [0, 16], high: [34, 50] }

const dodgeCache = new Map<string, Shot[]>()
export function dodgeWave(day: string, k: number): Shot[] {
  const key = `${day}#dodge#${k}`
  const hit = dodgeCache.get(key)
  if (hit) return hit
  const rnd = mulberry32(hashStr(key))
  const out: Shot[] = []
  // 옆에서 날아오는 탄 1~2발. 속도는 모두 같고(SHOT_SPEED) 출발 간격이 묶음 안팎 모두 600ms 이상이라
  // 낮은 탄·높은 탄이 거의 동시에 와서 절대 못 피하는 일은 없다(체공 약 0.57초)
  const nShots = 1 + Math.floor(rnd() * 2)
  let t = rnd() * 400
  for (let i = 0; i < nShots; i++) {
    const kind: ShotKind = rnd() < 0.55 ? 'low' : 'high'
    out.push({ id: `${k}-s${i}`, kind, start: k * DODGE_WAVE_MS + t, speed: SHOT_SPEED, x0: SHOOTER_X, fall: 0, w: 20, label: kind === 'low' ? (rnd() < 0.5 ? '📄' : '📎') : (rnd() < 0.5 ? '📧' : '💬') })
    t += 600 + rnd() * 300
  }
  // 위에서 떨어지는 것 0~2개
  const nDrops = Math.floor(rnd() * 3)
  for (let i = 0; i < nDrops; i++) {
    out.push({ id: `${k}-d${i}`, kind: 'drop', start: k * DODGE_WAVE_MS + rnd() * DODGE_WAVE_MS, speed: 0, x0: ARENA_L + 20 + rnd() * (ARENA_R - ARENA_L - 40), fall: 1100 + rnd() * 500, w: 22, label: rnd() < 0.5 ? '🗂️' : '☕' })
  }
  if (dodgeCache.size > 200) dodgeCache.clear()
  dodgeCache.set(key, out)
  return out
}

// t에 화면에 있는 탄들 — x와 땅에서의 높이 범위(bottom~top)
export function liveShots(day: string, t: number): LiveShot[] {
  const k = Math.floor(t / DODGE_WAVE_MS)
  const out: LiveShot[] = []
  for (const s of [...dodgeWave(day, k - 2), ...dodgeWave(day, k - 1), ...dodgeWave(day, k)]) {
    if (t < s.start) continue
    if (s.kind === 'drop') {
      const p = (t - s.start) / s.fall
      if (p > 1) continue
      const bottom = DROP_FROM * (1 - p)
      out.push({ ...s, x: s.x0, bottom, top: bottom + s.w })
    } else {
      const x = s.x0 - ((t - s.start) / 1000) * s.speed
      if (x < ARENA_L - 40) continue
      const [bottom, top] = SHOT_BAND[s.kind]
      out.push({ ...s, x, bottom, top })
    }
  }
  return out
}

// 떨어지기 전 그림자(경고) — 출발 후 아직 안 떨어진 drop의 x
export function dropShadows(day: string, t: number) {
  return liveShots(day, t).filter(s => s.kind === 'drop').map(s => ({ id: s.id, x: s.x, p: 1 - s.bottom / DROP_FROM }))
}

export function shotHit(px: number, jy: number, shots: LiveShot[]): LiveShot | null {
  for (const s of shots) {
    if (Math.abs(s.x - px) > (s.w + PLAYER_W) / 2) continue
    if (jy < s.top && jy + PLAYER_H > s.bottom) return s
  }
  return null
}
export const inArena = (x: number) => x > MTN_L && x <= ARENA_R + 1

// ── 목 — 옥상 양궁 ────────────────────────────────────────────────
// 사대(ARCH_LINE 근처)에서 Space 한 번 = 위아래로 흔들리는 각도 고정, 한 번 더 = 차오르내리는 힘 고정 → 화살 발사.
// 화살은 중력 + 바람(서버 시각 10초마다 바뀜, 모두 같음)을 받아 날아가고, 과녁(위아래로 천천히 움직임)을 지날 때의 높이로 점수.
// 한 판 = 3발, 합계 ARCH_PASS 이상이면 칼퇴, 못 넘으면 굴러떨어짐(기회 -1).
export const ARCH_LINE = MTN_L + 30 // 사대 가운데
export const ARCH_BOX = 26 // 사대 폭의 반
export const TARGET_X = PEAK_X + 150
export const TARGET_R = 36 // 과녁 반지름
export const ARCH_SHOTS = 3
export const ARCH_PASS = 24
export const ARROW_G = 520
export const ARROW_VMAX = 680
export const ANGLE_MIN = 0
export const ANGLE_MAX = 0.6 // 라디안(약 34°)
export const ANGLE_PERIOD_MS = 1400
export const POWER_PERIOD_MS = 1100
export const BOW_H = 40 // 활 높이(땅에서)
export const WIND_MS = 10000
export const atArchLine = (x: number) => Math.abs(x - ARCH_LINE) <= ARCH_BOX

// 바람: -1(맞바람) ~ +1(뒷바람). 10초마다 바뀐다
export function windAt(day: string, t: number) {
  const k = Math.floor(t / WIND_MS)
  return Math.round((mulberry32(hashStr(`${day}#wind#${k}`))() * 2 - 1) * 10) / 10
}
// 과녁 중심 높이(땅에서) — 3.2초 주기로 위아래 ±22px
export const targetH = (t: number) => 72 + 22 * Math.sin((t / 3200) * Math.PI * 2)
// 흔들리는 바늘: 0~1 왕복(삼각파)
export const sweep = (t: number, period: number) => { const u = ((t % period) + period) % period / period; return u < 0.5 ? u * 2 : 2 - u * 2 }
export const angleAt = (t: number) => ANGLE_MIN + (ANGLE_MAX - ANGLE_MIN) * sweep(t, ANGLE_PERIOD_MS)
export const powerAt = (t: number) => 0.35 + 0.65 * sweep(t, POWER_PERIOD_MS)

// 화살 위치(발사 후 s초): x0에서 오른쪽으로, 바람은 가로 가속도로
export function arrowPos(x0: number, angle: number, power: number, wind: number, s: number) {
  const v = power * ARROW_VMAX
  const ax = wind * 60
  return { x: x0 + v * Math.cos(angle) * s + 0.5 * ax * s * s, h: BOW_H + v * Math.sin(angle) * s - 0.5 * ARROW_G * s * s }
}
// 과녁을 지날 때 점수(10/8/6/4/2, 빗나가면 0)와 그때까지 걸린 시간. 과녁 전에 땅에 떨어지면 0
export function arrowScore(x0: number, angle: number, power: number, wind: number, firedAt: number) {
  for (let s = 0; s < 4; s += 1 / 240) {
    const p = arrowPos(x0, angle, power, wind, s)
    if (p.h <= 0) return { score: 0, flight: s, hitH: null as number | null }
    if (p.x >= TARGET_X) {
      const d = Math.abs(p.h - targetH(firedAt + s * 1000))
      const score = d < 7 ? 10 : d < 14 ? 8 : d < 21 ? 6 : d < 28 ? 4 : d < TARGET_R ? 2 : 0
      return { score, flight: s, hitH: p.h }
    }
  }
  return { score: 0, flight: 4, hitH: null }
}
