// 운동장 💥 결재 포격전 — 순수 로직(차례제 포물선 포격, 1:1 / 2:2 / 3:3).
// 방장(host) PC가 판정한다: 차례인 사람이 각도·힘·무기를 보내면(fire) host가 resolveShot()으로 결과(구덩이·피해·다음 차례)를 계산해
// 방송하고, 모두 같은 궤적을 그리고 나서 결과 상태로 넘어간다. 지형은 seed + 구덩이(·흙더미) 목록으로 누구나 똑같이 다시 만든다.
// 화면은 components/playground/FortArena.tsx, 방 모집은 lib/useFortRooms.ts, 전적·꾸미기·필살기 저장은 lib/useFortProfile.ts.
//
// 무기(2026-11-05 v2): 기본탄(무제한) + 10종 중 각자 랜덤 4개(판마다, seed+id로 정해짐) + 개인 필살기 1개(한 판 1번).
// 필살기(v3): 7종 (🛡 방어막은 2026-11-05 삭제 · 키 'swap'은 2026-11-05 자리바꾸기 → 💥 연쇄 폭발로 효과 교체 — DB 키는 그대로)
// 필살기(v3): 각각 한 사람에게만 귀속 — 🎁 필살기 상자로 남은 것 중 랜덤 1개를 받으면 영구히 그 사람 것(supabase fort_specials). CPU는 없음.

import { CELL, SCENERY, WH, buildMap, cloneGrid, isSolid, mapOfSeed, paintEllipse, type Grid } from '@/lib/fortMaps'

export const FORT_PROTO = 9 // 규칙(무기·지형·물리)을 바꾸면 올린다 — 버전 다르면 같은 방에 못 들어감
export type FortMode = '1v1' | '2v2' | '3v3'
export const MODE_LABEL: Record<FortMode, string> = { '1v1': '1:1', '2v2': '2:2', '3v3': '3:3' }
export const teamSizeOf = (mode: FortMode) => (mode === '1v1' ? 1 : mode === '2v2' ? 2 : 3)
export type Team = 'A' | 'B'
export type WeaponKey = 'clip' | 'mail' | 'reject' | 'bomb' | 'coffee' | 'drill' | 'roll' | 'double' | 'wall' | 'laser' | 'warp'
export type SpecialKey = 'rain' | 'bolt' | 'homing' | 'quake' | 'freeze' | 'swap' | 'vortex'
export type ArmKey = WeaponKey | SpecialKey
export type SkinKey = 'desk' | 'cabinet' | 'water' | 'plant' | 'copier' | 'server'
export type FortTheme = 'office' | 'workshop' | 'road'

export const TEAM_COLOR: Record<Team, string> = { A: '#2563EB', B: '#E11D48' }
export const TEAM_NAME: Record<Team, string> = { A: '파랑팀', B: '빨강팀' }

// 규칙(컨셉과 무관). uses -1 = 무제한. tag = 무기 칸 한 줄 특성, help = 자세히
export type ArmSpec = { dmg: number; r: number; uses: number; tag: string; help: string; push?: number; heal?: number; graze?: number; crater?: number }
// graze = 폭발에 안 맞아도 근처(GRAZE_R 안) 상대에게 주는 스침 피해 · crater = 파이는 구덩이 크기(기본 r)
export const WEAPONS: Record<ArmKey, ArmSpec> = {
  clip: { dmg: 50, r: 30, uses: -1, tag: '기본 · 50', help: '기본탄 — 무제한' },
  mail: { dmg: 22, r: 20, uses: 2, tag: '3갈래 · 22×3', help: '가장 높이 올라간 순간 3갈래로 갈라짐' },
  reject: { dmg: 12, r: 22, uses: 2, push: 95, tag: '밀어내기 · 12', help: '맞은 근처를 멀리 밀어냄 — 화면 밖으로 밀리면 탈락' },
  bomb: { dmg: 60, r: 44, uses: 1, tag: '큰 폭발 · 60', help: '크게 터지고 땅도 크게 파임' },
  coffee: { dmg: 0, r: 0, uses: 1, heal: 30, tag: '회복 +30', help: '쏘지 않고 내 체력 +30 (차례 사용)' },
  drill: { dmg: 35, r: 22, uses: 2, tag: '땅 뚫기 · 35', help: '땅에 박히면 70px 파고들어가서 터짐 — 언덕 뒤 상대용' },
  roll: { dmg: 40, r: 26, uses: 2, tag: '굴러가기 · 40', help: '떨어진 뒤 비탈 따라 굴러가다 상대에 닿거나 멈추면 터짐' },
  double: { dmg: 28, r: 24, uses: 1, tag: '2연발 · 28×2', help: '같은 각도·힘으로 두 발 연속' },
  wall: { dmg: 0, r: 34, uses: 2, tag: '흙벽 쌓기', help: '떨어진 곳에 흙더미를 쌓음 — 내 앞을 막거나 상대 길을 막기(피해 없음)' },
  laser: { dmg: 32, r: 22, uses: 2, tag: '바람 무시 · 32', help: '바람 영향을 받지 않음' },
  warp: { dmg: 0, r: 0, uses: 1, tag: '순간이동 + 한 발', help: '떨어진 자리로 내 요새가 옮겨가고, 같은 차례에 한 발 더 쏨' },
  // 필살기(2026-11-05 강화: 평균 효과가 기본탄의 약 2배 또는 확실한 한 방이 되도록)
  rain: { dmg: 30, r: 24, uses: 1, graze: 12, crater: 34, tag: '필살 · 낙하 30+20×7', help: '떨어진 곳 위에서 7발이 넓게 쏟아짐(30 + 20×7) — 빗나가도 근처면 스침 12' },
  bolt: { dmg: 70, r: 18, uses: 1, graze: 25, crater: 26, tag: '필살 · 관통 70', help: '바람·중력 무시, 땅을 뚫고 일직선 — 선 위 상대 70, 선 근처 상대도 감전 25' },
  homing: { dmg: 60, r: 32, uses: 1, graze: 18, crater: 50, tag: '필살 · 유도 60', help: '내려오기 시작하면 가장 가까운 상대 쪽으로 강하게 휨 — 빗나가도 근처면 18' },
  quake: { dmg: 40, r: 42, uses: 1, crater: 50, tag: '필살 · 지진 40+15', help: '조준 없이 가장 가까운 상대 발밑을 깊게 꺼뜨림(40) + 나머지 상대도 모두 흔들려 15' },
  // 키 'freeze'는 DB(fort_specials) 호환 때문에 그대로 — 2026-11-09 얼리기 → 🐹 두더지로 효과 교체(사용자 "얼리기는 바꾸거나 삭제")
  freeze: { dmg: 45, r: 32, uses: 1, graze: 15, crater: 46, tag: '필살 · 두더지 45', help: '떨어진 곳에서 가장 가까운 상대 쪽으로 땅속을 파고들어가(최대 300px) 발밑에서 크게 터짐 — 굴·벙커 속 상대도' },
  swap: { dmg: 35, r: 28, uses: 1, graze: 14, crater: 36, tag: '필살 · 연쇄 35+12×6', help: '떨어지면 터지면서 작은 폭탄 6개가 사방으로 튀어 하나씩 또 터짐(35 + 12×6)' },
  vortex: { dmg: 40, r: 30, uses: 1, graze: 15, crater: 42, tag: '필살 · 소용돌이 40', help: '떨어진 곳으로 240px 안 상대를 끌어당긴 뒤 터짐(우리 팀은 안 끌려옴)' },
}
export const POOL: WeaponKey[] = ['mail', 'reject', 'bomb', 'coffee', 'drill', 'roll', 'double', 'wall', 'laser', 'warp']
export const WEAPON_ORDER: WeaponKey[] = ['clip', ...POOL]
export const SPECIAL_ORDER: SpecialKey[] = ['rain', 'homing', 'bolt', 'quake', 'freeze', 'swap', 'vortex']
export const KIT_SIZE = 4
export const isSpecial = (k: ArmKey): k is SpecialKey => (SPECIAL_ORDER as string[]).includes(k)
const NO_SHOT: ArmKey[] = ['coffee', 'quake'] // 쏘지 않는 것(차례만 씀)
export const firesShot = (k: ArmKey) => !NO_SHOT.includes(k)


// ── 컨셉(판마다 바뀜) — 배경·지형·요새·던지는 것이 한 세트. 규칙(피해·반경·개수)은 무기마다 같고 이름·그림만 다르다.
// 요새 꾸미기(SkinKey)는 6단계 그대로, 컨셉마다 다른 물건으로 그린다(회사 책상 = 워크샵 돗자리 = 도로 경차 …).
type Look = { name: string; emoji: string }
export const THEMES: Record<FortTheme, {
  name: string; emoji: string; wind: string; place: (seed: number) => string
  weapons: Record<ArmKey, Look>
  skins: Record<SkinKey, string>
}> = {
  office: {
    name: '사무실', emoji: '🏢', wind: '에어컨 바람', place: () => '본사 3층 사무실',
    weapons: {
      clip: { name: '클립 뭉치', emoji: '📎' }, mail: { name: '메일 폭탄', emoji: '📧' }, reject: { name: '반려 서류', emoji: '📑' },
      bomb: { name: '야근 폭탄', emoji: '💣' }, coffee: { name: '아아 한 잔', emoji: '☕' }, drill: { name: '만년필', emoji: '🖊️' },
      roll: { name: '휴지 롤', emoji: '🧻' }, double: { name: '압정 2연발', emoji: '📌' }, wall: { name: '택배 상자 쌓기', emoji: '📦' },
      laser: { name: '레이저 포인터', emoji: '🔦' }, warp: { name: '엘리베이터 호출', emoji: '🛗' },
      rain: { name: '서류 폭우', emoji: '📄' }, bolt: { name: '결재 번개', emoji: '⚡' },
      homing: { name: '사장님 지시탄', emoji: '🎯' }, quake: { name: '조직개편', emoji: '🌋' },
      freeze: { name: '결재 두더지', emoji: '🐹' }, swap: { name: '결재 폭탄 돌리기', emoji: '🧨' }, vortex: { name: '회의 소집', emoji: '🌀' },
    },
    skins: { desk: '기본 책상', cabinet: '서류 캐비닛', water: '정수기', plant: '화분 책상', copier: '복합기', server: '서버랙' },
  },
  workshop: {
    name: '워크샵', emoji: '🏕️', wind: '산바람', place: seed => (['가평 펜션', '양평 캠핑장', '춘천 강변'] as const)[seed % 3],
    weapons: {
      clip: { name: '김밥 한 줄', emoji: '🍙' }, mail: { name: '케이크 폭탄', emoji: '🎂' }, reject: { name: '족구공', emoji: '🏐' },
      bomb: { name: '수박', emoji: '🍉' }, coffee: { name: '이온음료', emoji: '🥤' }, drill: { name: '어묵 꼬치', emoji: '🍢' },
      roll: { name: '통나무', emoji: '🪵' }, double: { name: '옥수수 2연발', emoji: '🌽' }, wall: { name: '돌탑 쌓기', emoji: '🪨' },
      laser: { name: '다트', emoji: '🎯' }, warp: { name: '셔틀버스', emoji: '🚌' },
      rain: { name: '불꽃놀이', emoji: '🎆' }, bolt: { name: '천둥', emoji: '⚡' },
      homing: { name: '벌떼', emoji: '🐝' }, quake: { name: '산사태', emoji: '🌋' },
      freeze: { name: '두더지 굴', emoji: '🐹' }, swap: { name: '팝콘 터뜨리기', emoji: '🍿' }, vortex: { name: '캠프파이어 집합', emoji: '🌀' },
    },
    skins: { desk: '돗자리', cabinet: '아이스박스', water: '텐트', plant: '캠핑 의자', copier: '바베큐 그릴', server: '캠핑카' },
  },
  road: {
    name: '도로', emoji: '🚦', wind: '빌딩 바람', place: seed => (['강남대로', '판교 테크노밸리', '테헤란로'] as const)[seed % 3],
    weapons: {
      clip: { name: '타이어', emoji: '🛞' }, mail: { name: '라바콘 3개', emoji: '🚧' }, reject: { name: '킥보드', emoji: '🛴' },
      bomb: { name: '공사 벽돌', emoji: '🧱' }, coffee: { name: '편의점 커피', emoji: '🧋' }, drill: { name: '착암기', emoji: '🔩' },
      roll: { name: '드럼통', emoji: '🛢️' }, double: { name: '캔 2연발', emoji: '🥫' }, wall: { name: '공사 가림막', emoji: '🏗️' },
      laser: { name: '과속 카메라', emoji: '📸' }, warp: { name: '택시 호출', emoji: '🚕' },
      rain: { name: '소나기', emoji: '🌧️' }, bolt: { name: '고압선', emoji: '⚡' },
      homing: { name: '배달 오토바이', emoji: '🛵' }, quake: { name: '싱크홀', emoji: '🕳️' },
      freeze: { name: '싱크홀', emoji: '🕳️' }, swap: { name: '연쇄 추돌', emoji: '💥' }, vortex: { name: '회전교차로', emoji: '🌀' },
    },
    skins: { desk: '경차', cabinet: '택시', water: '버스 정류장', plant: '푸드트럭', copier: '광역버스', server: '스포츠카' },
  },
}
export const THEME_ORDER: FortTheme[] = ['office', 'workshop', 'road']
export const themeOfSeed = (seed: number): FortTheme => THEME_ORDER[Math.floor(seed / 2) % 3]
export const weaponLook = (theme: FortTheme, w: ArmKey) => THEMES[theme].weapons[w]

// 요새 꾸미기 — 잠금 조건(전적)
export const SKINS: Record<SkinKey, { name: string; emoji: string; need: { games?: number; wins?: number } }> = {
  desk: { name: '기본 책상', emoji: '🖥️', need: {} },
  cabinet: { name: '서류 캐비닛', emoji: '🗄️', need: {} },
  water: { name: '정수기', emoji: '🚰', need: { games: 1 } },
  plant: { name: '화분 책상', emoji: '🪴', need: { games: 5 } },
  copier: { name: '복합기', emoji: '🖨️', need: { wins: 3 } },
  server: { name: '서버랙', emoji: '🗃️', need: { wins: 10 } },
}
export const SKIN_ORDER: SkinKey[] = ['desk', 'cabinet', 'water', 'plant', 'copier', 'server']
const needOk = (n: { games?: number; wins?: number }, rec: { games: number; wins: number } | null) => (n.games ?? 0) <= (rec?.games ?? 0) && (n.wins ?? 0) <= (rec?.wins ?? 0)
const needText = (n: { games?: number; wins?: number }) => (n.wins ? `${n.wins}승` : n.games ? `${n.games}판` : '')
export const skinUnlocked = (skin: SkinKey, rec: { games: number; wins: number } | null) => needOk(SKINS[skin].need, rec)
export const skinNeedText = (skin: SkinKey) => needText(SKINS[skin].need)

// ── 숫자 ─────────────────────────────────────────
// 맵 크기(2026-11-09 v2 넓힘): 화면엔 세로를 맞춰 줄이고(WH 440 → 화면 320) 카메라가 좌우로 따라감
export const WORLD_W: Record<FortMode, number> = { '1v1': 1600, '2v2': 1900, '3v3': 2200 }
export const worldW = (mode: FortMode) => WORLD_W[mode]
export { CELL, WH }
export const MAX_HP = 100
export const BODY_H = 18 // 요새 높이
export const HIT_R = 14 // 요새 맞는 반경(몸 가운데 기준)
export const GRAV = 260
export const V_MIN = 90
export const V_MAX = 580
export const WIND_ACC = 70 // 바람 1.0일 때 가로 가속(px/s²)
export const TURN_MS = 25000
export const START_DELAY_MS = 5000 // 첫 차례 시간은 시작 연출(약 4.8초)이 끝난 뒤부터
export const AFTER_SHOT_MS = 900 // 터지고 나서 다음 차례까지 쉬는 시간
export const FUEL = 140 // 한 차례에 움직일 수 있는 거리(px)
export const MOVE_SPEED = 45
export const ELEV_SPEED = 40 // 각도 바꾸는 속도(도/초)
export const CHARGE_MS = 1600 // Space 꾹 → 힘 0→100%
export const TURNS_PER_TANK = 20 // 넘으면 남은 체력 합으로 판정
// 차례 제한: 탱크당 20번(1:1 40 · 2:2 80 · 3:3 120) — 2026-11-09 사용자 "1탱크당 15~20회 정도로 끝나게"
export const maxTurnsOf = (mode: FortMode) => teamSizeOf(mode) * 2 * TURNS_PER_TANK
export const ELEV_MIN = -30 // 아래로도 조준 가능(⚡ 일직선으로 낮은 상대 노리기 등)
const DT = 1 / 120
const SAMPLE_EVERY = 2 // 궤적 점은 2스텝(약 16ms)마다
const DOUBLE_GAP_MS = 380
const DRILL_LEN = 70
const ROLL_MAX = 170
const ROLL_SPEED = 220
const HOMING_ACC = 600
const BOLT_SPEED = 900
const BOLT_REACH = 8 // ⚡ 맞는 판정을 몸보다 이만큼 넓게
const VORTEX_R = 240
const VORTEX_PULL = 0.85
const CHAIN_VX = [-170, -110, -50, 50, 110, 170] // 💥 연쇄 폭발 — 튀어 나가는 작은 폭탄 6개의 가로 속도(2026-11-09 4→6개로 강화)
const MOLE_REACH = 300 // 🐹 두더지가 땅속으로 파고드는 최대 거리
const GRAZE_R = 80 // 스침 피해: 폭발 범위 밖으로 이만큼까지
const QUAKE_TREMOR = 15 // 🌋 지진 — 가장 가까운 상대 말고 나머지 상대 모두
const BOLT_GRAZE_R = 55 // ⚡ 선에서 이만큼 안이면 감전

// ── 타입 ─────────────────────────────────────────
export type FortPlayer = {
  id: string; team: Team; cpu: boolean; skin: SkinKey
  x: number; y: number; hp: number; alive: boolean; facing: 1 | -1; elev: number
  kit: WeaponKey[] // 이번 판에 받은 랜덤 무기(기본탄 제외)
  special: SpecialKey | null // 고유 필살기(없으면 null — CPU·아직 상자 안 연 사람)
  ammo: Partial<Record<ArmKey, number>> // 없는 키 = 0
  frozen: boolean // ❄️ 얼림 — 다음 차례 한 번 건너뜀
  out: 'hp' | 'pushed' | 'fell' | null // 탈락 이유
}
export type Crater = { x: number; y: number; r: number; fill?: 1 } // fill = 흙더미(쌓기)
export type FortState = {
  v: number; seed: number; mode: FortMode; theme: FortTheme; players: FortPlayer[]; order: string[]
  active: string; turnNo: number; wind: number; craters: Crater[]
  turnEndsAt: number // 서버 시각(ms)
  winner: Team | 'draw' | null; last: string | null
  frozenSkip?: string[] // 이번에 얼어서 차례를 건너뛴 사람(화면 안내용)
}
export type Shot = { id: string; x: number; y: number; facing: 1 | -1; elev: number; power: number; weapon: ArmKey }
export type TrailPt = { t: number; x: number; y: number }
export type Blast = { x: number; y: number; r: number; t: number; weapon: ArmKey }
export type HitFx = { id: string; dmg: number; t: number } // dmg < 0 = 회복
// craterTimes[i] = 이번 발로 새로 생긴 구덩이 i가 그려지는 시각(애니메이션용)
export type Move = { id: string; from: number; to: number; fromY: number; toY: number; t0: number; t1: number; spin?: 1 } // 판정 중 요새가 끌려가는 모습(화면용)
export type ShotResult = { trails: { emoji: string; pts: TrailPt[] }[]; blasts: Blast[]; hits: HitFx[]; craterTimes: number[]; endMs: number; moves?: Move[] }
export type RosterEntry = { id: string; team: Team; cpu: boolean; skin: SkinKey; special: SpecialKey | null }

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
function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
export function windFor(seed: number, turnNo: number) {
  const sc = mapOfSeed(seed).scenery
  if (sc && !SCENERY[sc].wind) return 0 // 🌌 우주는 바람 없음
  const r = mulberry32((seed ^ Math.imul(turnNo + 1, 2654435761)) >>> 0)
  r()
  return Math.round((r() * 2 - 1) * 10) / 10
}
// 이번 판 내 무기 4개 — seed와 id로 정해져 누구 PC에서 계산해도 같다
export function kitFor(seed: number, id: string): WeaponKey[] {
  const r = mulberry32((seed ^ hashStr(id)) >>> 0)
  const pool = [...POOL]
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return pool.slice(0, KIT_SIZE).sort((a, b) => POOL.indexOf(a) - POOL.indexOf(b))
}

// ── 지형 ─────────────────────────────────────────
// 2D 칸 지도(땅/빈칸, 칸 CELL px). 맵 모양은 lib/fortMaps.ts. 맨 아래(WH)보다 밑으로 떨어지면 탈락.
export type Terrain = Grid
export function spawnXs(mode: FortMode): Record<Team, number[]> {
  const w = WORLD_W[mode]
  const f = mode === '1v1' ? [0.22] : mode === '2v2' ? [0.14, 0.31] : [0.13, 0.25, 0.37]
  return { A: f.map(u => w * u), B: f.map(u => w * (1 - u)) }
}
const baseCache = new Map<string, { grid: Grid; spawnYs: number[] }>()
function baseOf(seed: number, mode: FortMode) {
  const key = `${seed}:${mode}`
  let b = baseCache.get(key)
  if (!b) {
    const map = mapOfSeed(seed)
    const sp = spawnXs(mode)
    const under = [...sp.A.map((_, i) => i), ...sp.B.map((_, i) => i)].map(i => map.under === 'all' || (map.under === 'some' && i === 1))
    b = buildMap(map, seed, WORLD_W[mode], [...sp.A, ...sp.B], under)
    if (baseCache.size > 12) baseCache.delete(baseCache.keys().next().value as string)
    baseCache.set(key, b)
  }
  return b
}
export function baseTerrain(seed: number, mode: FortMode): Terrain { return cloneGrid(baseOf(seed, mode).grid) }
// 요새 자리 발 높이(spawnXs의 A..., B... 순서)
export const spawnYsOf = (seed: number, mode: FortMode) => baseOf(seed, mode).spawnYs
export function applyCrater(t: Terrain, c: Crater) {
  if (c.fill) paintEllipse(t, c.x, c.y + c.r * 0.15, c.r, c.r * 0.85, 1) // 흙더미: 떨어진 자리에 반쯤 솟게
  else paintEllipse(t, c.x, c.y, c.r, c.r, 0)
}
export { FORT_MAPS, SCENERY, mapOfSeed, isSolid, type FortMap, type Scenery } from '@/lib/fortMaps'
export function terrainOf(seed: number, mode: FortMode, craters: Crater[]) {
  const t = baseTerrain(seed, mode)
  for (const c of craters) applyCrater(t, c)
  return t
}
// (x, y) 근처에서 발 디딜 곳 — 몸이 땅에 묻혀 있으면 위로(최대 up px), 떠 있으면 아래로 떨어짐. 바닥이 없으면 null(추락)
export function footAt(t: Terrain, x: number, y: number, up = 60): number | null {
  if (x < 0 || x >= t.w) return null
  const y0 = Math.floor(y / CELL) * CELL
  let fy = y0
  if (isSolid(t, x, fy - 1)) {
    let k = 0
    while (k < up && isSolid(t, x, fy - 1)) { fy -= CELL; k += CELL }
    return isSolid(t, x, fy - 1) ? y0 : fy
  }
  while (fy < t.h && !isSolid(t, x, fy)) fy += CELL
  return fy >= t.h ? null : fy
}

// 차례인 사람이 ←→로 움직일 때 — 1px 갈 때 2px까지는 올라서고(가파른 벽은 못 넘음), 내리막·턱은 떨어져 내려감.
// 바닥 없는 낭떠러지로는 안 걸어 들어감. 머리가 낄 만큼 낮은 굴도 못 지나감. 맵 끝 10px 안으로는 못 감.
const CLIMB = 2 // 1px 옆으로 갈 때 올라설 수 있는 높이(px)
export function moveAlong(t: Terrain, x: number, y: number, dir: -1 | 1, dist: number): { x: number; y: number } {
  let cx = x, cy = y
  const steps = Math.floor(dist)
  for (let k = 0; k < steps; k++) {
    const nx = cx + dir
    if (nx < 10 || nx > t.w - 10) break
    let ny: number | null
    if (!isSolid(t, nx, cy - 1)) ny = footAt(t, nx, cy, 0)
    else {
      ny = null
      for (let k = CELL; k <= CLIMB; k += CELL) if (!isSolid(t, nx, cy - 1 - k)) { ny = cy - k; break }
    }
    if (ny === null) break
    if (isSolid(t, nx, ny - BODY_H)) break
    cx = nx; cy = ny
  }
  return { x: cx, y: cy }
}

// ── 새 판 ────────────────────────────────────────
export function newFortState(seed: number, mode: FortMode, roster: RosterEntry[], now: number, theme: FortTheme = themeOfSeed(seed)): FortState {
  const sp = spawnXs(mode)
  const spY = spawnYsOf(seed, mode)
  const used: Record<Team, number> = { A: 0, B: 0 }
  const players: FortPlayer[] = roster.map(p => {
    const slot = used[p.team]++ % sp[p.team].length
    const x = sp[p.team][slot]
    const y = spY[(p.team === 'A' ? 0 : sp.A.length) + slot]
    const kit = kitFor(seed, p.id)
    const ammo: Partial<Record<ArmKey, number>> = { clip: -1 }
    if (p.special) ammo[p.special] = 1
    for (const k of kit) ammo[k] = WEAPONS[k].uses
    return {
      id: p.id, team: p.team, cpu: p.cpu, skin: p.skin, x, y, hp: MAX_HP, alive: true, facing: p.team === 'A' ? 1 : -1, elev: 45,
      kit, special: p.special ?? null, ammo, frozen: false, out: null,
    }
  })
  // 차례: 사람 먼저, 🤖 CPU는 맨 뒤(2026-11-09 사용자 요청). 각 묶음 안에서는 팀 번갈아(A B A B), 누가 먼저인지는 seed로
  const firstTeam: Team = seed % 2 === 0 ? 'A' : 'B'
  const weave = (list: FortPlayer[], start: Team) => {
    const f = list.filter(p => p.team === start), o = list.filter(p => p.team !== start)
    const out: string[] = []
    for (let i = 0; i < Math.max(f.length, o.length); i++) {
      if (f[i]) out.push(f[i].id)
      if (o[i]) out.push(o[i].id)
    }
    return out
  }
  const humans = weave(players.filter(p => !p.cpu), firstTeam)
  // CPU 묶음은 마지막 사람의 반대 팀부터 — 한 팀이 연달아 쏘는 걸 줄임(나 → CPU(상대) → CPU(우리) …)
  const lastHuman = players.find(p => p.id === humans[humans.length - 1])
  const cpuStart: Team = lastHuman ? (lastHuman.team === 'A' ? 'B' : 'A') : firstTeam
  const order: string[] = [...humans, ...weave(players.filter(p => p.cpu), cpuStart)]
  return {
    v: FORT_PROTO, seed, mode, theme, players, order, active: order[0], turnNo: 0, wind: windFor(seed, 0), craters: [],
    turnEndsAt: now + START_DELAY_MS + TURN_MS, winner: null, last: null,
  }
}
export const ammoOf = (p: FortPlayer, k: ArmKey) => p.ammo[k] ?? 0
export const armsOf = (p: FortPlayer): ArmKey[] => (p.special ? ['clip', ...p.kit, p.special] : ['clip', ...p.kit]) // 화면 무기 칸 순서(1~6)

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

// 다음 차례로(살아 있는 사람만). 판이 끝났으면 winner만 채운다. 차례가 돌아온 사람의 방어막은 꺼진다.
export function advanceTurn(s0: FortState, endsAt: number): FortState {
  const s = { ...s0 }
  const w = winnerOf(s)
  if (w) { s.winner = w; return s }
  const maxT = maxTurnsOf(s.mode)
  if (s.turnNo + 1 >= maxT) { s.winner = hpWinner(s); s.last = `⏱ ${maxT}차례 끝 — 남은 체력으로 판정`; return s }
  const idx = s.order.indexOf(s.active)
  const skipped: string[] = []
  for (let k = 1; k <= s.order.length * 2; k++) {
    const id = s.order[(idx + k) % s.order.length]
    const p = s.players.find(q => q.id === id)
    if (!p?.alive) continue
    if (p.frozen) { skipped.push(id); s.players = s.players.map(q => (q.id === id ? { ...q, frozen: false } : q)); continue } // ❄️ 한 번 쉼
    s.active = id
    break
  }
  if (skipped.length) s.frozenSkip = skipped
  else delete s.frozenSkip
  s.turnNo = s.turnNo + 1
  s.wind = windFor(s.seed, s.turnNo)
  s.turnEndsAt = endsAt
  return s
}

// 같은 사람이 한 번 더(🛗 순간이동 뒤 한 발) — 차례 번호만 올려 조준·이동을 새로 받는다. 바람은 그대로
export function bonusTurn(s0: FortState, endsAt: number): FortState {
  const s = { ...s0, turnNo: s0.turnNo + 1, turnEndsAt: endsAt }
  delete s.frozenSkip
  return s
}

// ── 포탄 날리기 ──────────────────────────────────
type FlyOpts = { wind: number; grav?: boolean; ground?: boolean; splitAtApex?: boolean; homing?: { x: number } | null; record?: boolean; maxMs?: number }
type FlyEnd = {
  pts: TrailPt[]
  end: { x: number; y: number; t: number; vx: number; vy: number; tank: boolean } | null
  split: { x: number; y: number; vx: number; vy: number; t: number } | null
}
const bodyY = (p: FortPlayer) => p.y - BODY_H / 2
function fly(t: Terrain, players: FortPlayer[], shooter: string, x0: number, y0: number, vx0: number, vy0: number, t0: number, o: FlyOpts): FlyEnd {
  const record = o.record !== false
  const grav = o.grav !== false
  const ground = o.ground !== false
  let x = x0, y = y0, vx = vx0, vy = vy0, tm = t0
  const pts: TrailPt[] = record ? [{ t: tm, x, y }] : []
  for (let step = 1; step < 14 / DT; step++) {
    const pvy = vy
    if (grav) { vx += o.wind * WIND_ACC * DT; vy += GRAV * t.grav * DT }
    // 🎯 내려올 때 목표 x로 꺾임 — 지나치지 않게 거리·속도를 같이 봄(PD)
    if (o.homing && vy > 0) vx += Math.max(-HOMING_ACC, Math.min(HOMING_ACC, (o.homing.x - x) * 6 - vx * 2.2)) * DT
    const ox = x, oy = y
    x += vx * DT
    y += vy * DT
    tm += DT * 1000
    if (ground) {
      // 한 스텝에 최대 5px쯤 움직이니 얇은 판도 놓치지 않게 잘게 나눠 땅에 닿았는지 본다
      const n = Math.max(1, Math.ceil(Math.hypot(x - ox, y - oy) / 1.6))
      for (let i = 1; i <= n; i++) {
        const px = ox + ((x - ox) * i) / n, py = oy + ((y - oy) * i) / n
        if (isSolid(t, px, py)) { if (record) pts.push({ t: tm, x: px, y: py }); return { pts, end: { x: px, y: py, t: tm, vx, vy, tank: false }, split: null } }
      }
    }
    if (record && step % SAMPLE_EVERY === 0) pts.push({ t: tm, x, y })
    if (x < -60 || x > t.w + 60 || y > t.h + 30 || (!grav && y < -60)) return { pts, end: null, split: null }
    if (o.splitAtApex && pvy < 0 && vy >= 0) return { pts, end: null, split: { x, y, vx, vy, t: tm } }
    if (o.maxMs !== undefined && tm - t0 > o.maxMs) return { pts, end: null, split: null }
    // 요새에 직접 맞음(쏜 사람은 처음 0.15초 동안 제외 — 활에서 바로 맞지 않게)
    for (const p of players) {
      if (!p.alive || (p.id === shooter && tm - t0 < 150)) continue
      if ((x - p.x) ** 2 + (y - bodyY(p)) ** 2 <= HIT_R * HIT_R) { if (record) pts.push({ t: tm, x, y }); return { pts, end: { x, y, t: tm, vx, vy, tank: true }, split: null } }
    }
  }
  return { pts, end: null, split: null }
}
export function muzzle(p: { x: number; y: number; facing: 1 | -1; elev: number }) {
  const a = (p.elev * Math.PI) / 180
  return { x: p.x + p.facing * 14 * Math.cos(a), y: p.y - BODY_H + 2 - 14 * Math.sin(a) }
}
function launch(p: { x: number; y: number; facing: 1 | -1; elev: number }, power: number, speed?: number) {
  const m = muzzle(p)
  const a = (p.elev * Math.PI) / 180
  const v = speed ?? V_MIN + Math.max(0, Math.min(1, power)) * (V_MAX - V_MIN)
  return { ...m, vx: p.facing * v * Math.cos(a), vy: -v * Math.sin(a) }
}
const nearestFoe = (players: FortPlayer[], me: FortPlayer, x: number) =>
  players.filter(p => p.alive && p.team !== me.team).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0] ?? null
// 첫 발의 날아가는 방식(CPU 조준도 같은 걸 씀)
function flyOpts(arm: ArmKey, wind: number, players: FortPlayer[], me: FortPlayer, record = true): FlyOpts {
  if (arm === 'laser') return { wind: 0, record }
  if (arm === 'bolt') return { wind: 0, grav: false, ground: false, record }
  if (arm === 'mail') return { wind, splitAtApex: true, record }
  if (arm === 'homing') { const f = nearestFoe(players, me, me.x); return { wind, homing: f ? { x: f.x } : null, record } }
  return { wind, record }
}

// 🎯 조준 보조: 쏘기 전에 처음 ms 동안 날아갈 길(바람 반영) — 너무 어렵지 않게(2026-11-09)
export function previewPath(t: Terrain, s: FortState, shot: Shot, ms = 450): TrailPt[] {
  const me = s.players.find(p => p.id === shot.id)
  if (!me || !firesShot(shot.weapon) || shot.weapon === 'bolt') return []
  const l = launch({ x: shot.x, y: shot.y, facing: shot.facing, elev: shot.elev }, shot.power)
  const o = { ...flyOpts(shot.weapon === 'mail' ? 'clip' : shot.weapon, s.wind, s.players, me), splitAtApex: false, homing: null, maxMs: ms }
  return fly(t, s.players, me.id, l.x, l.y, l.vx, l.vy, 0, o).pts
}

// 한 발의 결과: 궤적·폭발·피해 + 다음 상태(차례 넘김 포함). now = 서버 시각(다음 차례 마감 계산용)
export function resolveShot(s0: FortState, shot: Shot, now: number): { result: ShotResult; next: FortState } {
  const t = terrainOf(s0.seed, s0.mode, s0.craters)
  const players = s0.players.map(p => ({ ...p, ammo: { ...p.ammo } }))
  const me = players.find(p => p.id === shot.id)
  const result: ShotResult = { trails: [], blasts: [], hits: [], craterTimes: [], endMs: 600 }
  if (!me || !me.alive) return { result, next: advanceTurn(s0, now + TURN_MS) }
  // 움직인 자리·방향 반영(차례 동안 움직일 수 있는 거리 안에서만)
  const nx = Math.max(10, Math.min(t.w - 10, shot.x))
  const ny = Math.abs(nx - me.x) <= FUEL + 1 && Number.isFinite(shot.y) ? footAt(t, nx, shot.y, 4) : null
  if (ny !== null) { me.x = nx; me.y = ny }
  me.facing = shot.facing
  me.elev = Math.max(ELEV_MIN, Math.min(90, shot.elev))
  let arm: ArmKey = shot.weapon
  if (ammoOf(me, arm) === 0) arm = 'clip'
  if (ammoOf(me, arm) > 0) me.ammo[arm] = ammoOf(me, arm) - 1
  const spec = WEAPONS[arm]
  const look = weaponLook(s0.theme ?? 'office', arm)
  const craters = [...s0.craters]
  const hpBefore = new Map(players.map(p => [p.id, p.hp]))
  let last = ''
  let landed = 0

  const addCrater = (c: Crater, tm: number) => {
    const cr: Crater = { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, r: c.r, ...(c.fill ? { fill: 1 as const } : {}) }
    craters.push(cr)
    applyCrater(t, cr)
    result.craterTimes.push(tm)
  }
  // 폭발 한 번: 구덩이 → 피해(방어막이면 절반) → 밀어내기
  const blast = (x: number, y: number, s: ArmSpec, tm: number, kind: ArmKey) => {
    landed++
    const cr = s.crater ?? s.r
    result.blasts.push({ x, y, r: Math.max(s.r, cr), t: tm, weapon: kind })
    addCrater({ x, y, r: cr }, tm)
    for (const p of players) {
      if (!p.alive) continue
      const d = Math.hypot(p.x - x, bodyY(p) - y)
      if (d < s.r + HIT_R) {
        const f = 1 - d / (s.r + HIT_R)
        const dmg = Math.round(s.dmg * (0.5 + 0.5 * f))
        if (dmg > 0) { p.hp = Math.max(0, p.hp - dmg); result.hits.push({ id: p.id, dmg, t: tm }) }
      } else if (s.graze && p.team !== me.team && d < s.r + HIT_R + GRAZE_R) {
        const dmg = s.graze // 빗나가도 근처면 스침 피해
        p.hp = Math.max(0, p.hp - dmg); result.hits.push({ id: p.id, dmg, t: tm + 60 })
      }
      if (s.push && d < s.r + 50) {
        const dir = p.x === x ? (p.id === me.id ? -me.facing : me.facing) : Math.sign(p.x - x)
        p.x += dir * s.push * (1 - d / (s.r + 50))
        if (p.x < 0 || p.x > t.w) { p.alive = false; p.out = 'pushed'; p.hp = 0 }
      }
    }
  }
  const trail = (pts: TrailPt[], emoji = look.emoji) => { if (pts.length) result.trails.push({ emoji, pts }) }

  if (arm === 'coffee') {
    const heal = Math.min(MAX_HP - me.hp, spec.heal ?? 0)
    me.hp += heal
    if (heal > 0) result.hits.push({ id: me.id, dmg: -heal, t: 200 })
    result.endMs = 700
    last = `${look.emoji} ${look.name} — 체력 +${heal}`
  } else if (arm === 'quake') {
    const foe = nearestFoe(players, me, me.x)
    if (foe) blast(foe.x, foe.y + 8, spec, 350, 'quake')
    for (const p of players) {
      if (!p.alive || p.team === me.team || p === foe) continue
      const dmg = QUAKE_TREMOR
      p.hp = Math.max(0, p.hp - dmg); result.hits.push({ id: p.id, dmg, t: 550 })
      landed++
      result.blasts.push({ x: p.x, y: p.y + 6, r: 24, t: 550, weapon: 'quake' })
      addCrater({ x: p.x, y: p.y + 6, r: 20 }, 550)
    }
    result.endMs = 900
  } else {
    const fire = (t0: number) => {
      const l = arm === 'bolt' ? launch(me, 1, BOLT_SPEED) : launch(me, shot.power)
      const f = fly(t, players, me.id, l.x, l.y, l.vx, l.vy, t0, flyOpts(arm, s0.wind, players, me))
      trail(f.pts)
      return f
    }
    if (arm === 'bolt') {
      // ⚡ 일직선 관통 — 땅·바람·중력 무시, 선 위의 상대를 모두 맞힘(우리 팀은 통과)
      const l = launch(me, 1, BOLT_SPEED)
      const n = Math.hypot(l.vx, l.vy) || 1
      const ux = l.vx / n, uy = l.vy / n
      const pts: TrailPt[] = []
      const hitIds = new Set<string>()
      const near = new Set<string>() // 감전(선 근처를 지난 상대)
      let x = l.x, y = l.y, tm = 0
      for (let d = 0; d < 1600; d += 4) {
        x = l.x + ux * d; y = l.y + uy * d; tm = (d / BOLT_SPEED) * 1000
        if (d % 8 === 0) pts.push({ t: tm, x, y })
        if (x < -20 || x > t.w + 20 || y < -40 || y > t.h + 20) break
        for (const p of players) {
          if (!p.alive || p.team === me.team || hitIds.has(p.id)) continue
          const dd = Math.hypot(x - p.x, y - bodyY(p))
          if (dd <= HIT_R + BOLT_REACH) { hitIds.add(p.id); blast(p.x, bodyY(p), { ...spec, graze: 0 }, tm, arm) }
          else if (dd < BOLT_GRAZE_R) near.add(p.id)
        }
      }
      for (const id of near) {
        if (hitIds.has(id)) continue
        const p = players.find(q => q.id === id)!
        const dmg = spec.graze ?? 0
        p.hp = Math.max(0, p.hp - dmg); result.hits.push({ id, dmg, t: tm })
        landed++
      }
      pts.push({ t: tm, x, y })
      trail(pts)
    }
    const first: FlyEnd = arm === 'bolt' ? { pts: [], end: null, split: null } : fire(0)
    if (arm === 'mail' && first.split) {
      for (const dvx of [-55, 0, 55]) {
        const c = fly(t, players, '', first.split.x, first.split.y, first.split.vx + dvx, first.split.vy, first.split.t, { wind: s0.wind })
        trail(c.pts)
        if (c.end) blast(c.end.x, c.end.y, spec, c.end.t, arm)
      }
    } else if (first.end) {
      const e = first.end
      if (arm === 'wall') { landed++; result.blasts.push({ x: e.x, y: e.y, r: spec.r, t: e.t, weapon: arm }); addCrater({ x: e.x, y: e.y, r: spec.r, fill: 1 }, e.t) }
      else if (arm === 'warp') {
        landed++
        result.blasts.push({ x: e.x, y: e.y, r: 18, t: e.t, weapon: arm })
        const wx = Math.max(10, Math.min(t.w - 10, e.x))
        const wy = footAt(t, wx, e.y - 3)
        if (wy !== null) { me.x = wx; me.y = wy }
      } else if (arm === 'drill' && !e.tank) {
        // 박힌 방향으로 파고들어가 끝에서 터짐
        const n = Math.hypot(e.vx, e.vy) || 1
        const ux = e.vx / n, uy = Math.max(0.35, e.vy / n)
        const k = Math.hypot(ux, uy)
        const pts: TrailPt[] = []
        let x = e.x, y = e.y, tm = e.t
        for (let d = 10; d <= DRILL_LEN; d += 10) {
          x = e.x + (ux / k) * d; y = e.y + (uy / k) * d; tm = e.t + d * 4
          pts.push({ t: tm, x, y })
          addCrater({ x, y, r: 9 }, tm)
        }
        trail(pts)
        blast(x, y, spec, tm + 60, arm)
      } else if (arm === 'roll' && !e.tank) {
        // 비탈 따라 굴러감 — 오르막이 가파르거나·구덩이·상대에 닿거나·거리 끝이면 터짐
        const dir: 1 | -1 = Math.abs(e.vx) > 20 ? (e.vx > 0 ? 1 : -1) : me.facing
        const pts: TrailPt[] = []
        let x = e.x, y = footAt(t, e.x, e.y) ?? e.y, tm = e.t
        let out = false
        for (let d = 0; d < ROLL_MAX; d += 2) {
          const nx2 = x + dir * 2
          if (nx2 < 0 || nx2 > t.w) { out = true; break }
          const st = moveAlong(t, x, y, dir, 2)
          if (st.x === x) break // 가파른 오르막·벽·낭떠러지 끝
          x = st.x; y = st.y; tm += (2 / ROLL_SPEED) * 1000
          pts.push({ t: tm, x, y: y - 6 })
          if (players.some(p => p.alive && p.id !== me.id && Math.abs(p.x - x) < HIT_R + 2)) break
        }
        trail(pts)
        if (!out) blast(x, y - 4, spec, tm + 40, arm)
      } else if (arm === 'vortex') {
        // 근처 요새를 떨어진 곳 쪽으로 끌어당긴 뒤 터짐
        for (const p of players) {
          if (!p.alive || p.team === me.team) continue // 우리 팀은 안 끌려옴
          const dx = e.x - p.x
          if (Math.abs(dx) < VORTEX_R && Math.abs(e.y - p.y) < VORTEX_R) {
            const from = p.x, fromY = p.y
            p.x = Math.max(4, Math.min(t.w - 4, p.x + dx * VORTEX_PULL))
            p.y = footAt(t, p.x, p.y + (e.y - p.y) * VORTEX_PULL - 20) ?? p.y
            ;(result.moves ??= []).push({ id: p.id, from, to: p.x, fromY, toY: p.y, t0: e.t + 80, t1: e.t + 620, spin: 1 })
          }
        }
        blast(e.x, e.y, spec, e.t + 650, arm) // 빨려 들어온 뒤 터짐
      } else if (arm === 'freeze' && !e.tank) {
        // 🐹 두더지: 떨어진 곳에서 가장 가까운 상대 발밑 쪽으로 땅속을 파고들어 가(굴을 남김) 끝에서 크게 터짐
        const foe = nearestFoe(players, me, e.x)
        const tx = foe ? foe.x : e.x + me.facing * MOLE_REACH, ty = foe ? foe.y + 12 : e.y + 30
        const d = Math.hypot(tx - e.x, ty - e.y)
        const k = d > MOLE_REACH ? MOLE_REACH / d : 1
        const ex = e.x + (tx - e.x) * k, ey = e.y + (ty - e.y) * k
        const pts: TrailPt[] = []
        const n = Math.max(1, Math.ceil((d * k) / 12))
        let tm = e.t
        for (let i = 1; i <= n; i++) {
          const f = i / n
          const x = e.x + (ex - e.x) * f, y = e.y + (ey - e.y) * f + Math.sin(f * Math.PI * 3) * 8
          tm = e.t + i * 45
          pts.push({ t: tm, x, y })
          addCrater({ x, y, r: 9 }, tm)
        }
        trail(pts)
        blast(ex, ey, spec, tm + 80, arm)
      } else if (arm === 'swap') {
        // 💥 연쇄 폭발: 첫 폭발 → 작은 폭탄 6개가 사방으로 튀어 하나씩 터짐
        blast(e.x, e.y, spec, e.t, arm)
        const bit: ArmSpec = { ...spec, dmg: 12, r: 22, graze: 0, crater: 24 }
        CHAIN_VX.forEach((vx, i) => {
          const c = fly(t, players, '', e.x, e.y - 12, vx, -190 - (i % 2) * 40, e.t + 120 + i * 60, { wind: 0 })
          trail(c.pts)
          if (c.end) blast(c.end.x, c.end.y, bit, c.end.t, arm)
        })
      } else {
        blast(e.x, e.y, spec, e.t, arm)
        // (얼리기는 2026-11-09 두더지로 바뀜 — 아래 'freeze' 분기)
      }
      if (arm === 'rain') {
        // 떨어진 곳 위에서 7발 낙하
        const drop: ArmSpec = { ...spec, dmg: 20, r: 22, graze: 0, crater: 28 }
        for (let i = 0; i < 7; i++) {
          const x0 = e.x + (i - 3) * 38
          const c = fly(t, players, '', x0, -10, 0, 140, e.t + 250 + i * 110, { wind: 0 })
          trail(c.pts)
          if (c.end) blast(c.end.x, c.end.y, drop, c.end.t, arm)
        }
      }
    }
    if (arm === 'double') {
      const second = fire(DOUBLE_GAP_MS)
      if (second.end) blast(second.end.x, second.end.y, spec, second.end.t, arm)
    }
    const lastT = Math.max(0, ...result.blasts.map(b => b.t), ...result.trails.map(tr => tr.pts.at(-1)?.t ?? 0))
    result.endMs = lastT + 350
  }
  if (arm !== 'coffee') {
    const total = players.filter(p => p.id !== me.id).reduce((a, p) => a + Math.max(0, (hpBefore.get(p.id) ?? 0) - p.hp), 0)
    last = landed === 0 ? `${look.emoji} 날아가 버렸다…`
      : arm === 'wall' ? `${look.emoji} ${look.name} — 흙벽이 생겼다`
      : arm === 'warp' ? `${look.emoji} ${look.name} — 자리 이동!`
      : arm === 'bolt' && total > 0 ? `${look.emoji} ${look.name} 관통! -${total}`
      : total > 0 ? `${look.emoji} ${look.name} 명중! -${total}` : `${look.emoji} 빗나감`
  }
  // 땅이 꺼진 곳은 아래로 떨어진다(바닥까지 뚫렸으면 탈락), 흙더미 위면 올라선다
  for (const p of players) {
    if (!p.alive) continue
    const fy = footAt(t, p.x, p.y)
    if (fy === null) { p.alive = false; p.out = 'fell'; p.hp = 0 }
    else { p.y = fy; if (p.hp <= 0) { p.alive = false; p.out = 'hp' } }
  }
  const mid: FortState = { ...s0, players, craters, last }
  const endsAt = now + result.endMs + AFTER_SHOT_MS + TURN_MS
  if (arm === 'warp' && me.alive && landed > 0 && !winnerOf(mid)) return { result, next: bonusTurn({ ...mid, last: `${look.emoji} ${look.name} — 자리 이동! 한 발 더` }, endsAt) }
  return { result, next: advanceTurn(mid, endsAt) }
}

// 시간 초과 — 쏘지 않고 넘김(움직인 자리는 반영)
export function skipTurn(s0: FortState, lastAim: { x: number; y: number; facing: 1 | -1; elev: number } | null, now: number): FortState {
  const t = terrainOf(s0.seed, s0.mode, s0.craters)
  const players = s0.players.map(p => {
    if (p.id !== s0.active || !lastAim) return p
    const nx = Math.max(10, Math.min(t.w - 10, lastAim.x))
    const ny = Math.abs(nx - p.x) <= FUEL + 1 && Number.isFinite(lastAim.y) ? footAt(t, nx, lastAim.y, 4) : null
    return { ...p, x: ny !== null ? nx : p.x, y: ny ?? p.y, facing: lastAim.facing, elev: lastAim.elev }
  })
  return advanceTurn({ ...s0, players, last: '⌛ 시간 초과 — 차례 넘김' }, now + TURN_MS)
}

// 남은 사람이 나가면 CPU가 대신 — 방장이 계속 진행
export function toCpu(s: FortState, id: string): FortState {
  return { ...s, players: s.players.map(p => (p.id === id ? { ...p, cpu: true } : p)) }
}

// ── 🤖 CPU ───────────────────────────────────────
// 가진 무기 중 상황에 맞는 걸 고르고, 가까운 적을 노려 각도·힘을 훑어 가장 가까이 떨어지는 조합을 고른 뒤 약간 흔든다.
export function cpuPlan(s: FortState, id: string, rng: () => number): Shot {
  const t = terrainOf(s.seed, s.mode, s.craters)
  const me = s.players.find(p => p.id === id)!
  const target = nearestFoe(s.players, me, me.x)
  if (!target) return { id, x: me.x, y: me.y, facing: me.facing, elev: me.elev, power: 0.5, weapon: 'clip' }
  const facing: 1 | -1 = target.x >= me.x ? 1 : -1
  const has = (k: ArmKey) => ammoOf(me, k) !== 0
  let arm: ArmKey = 'clip'
  if (me.hp <= 50 && has('coffee') && rng() < 0.6) arm = 'coffee'
  else if (has('quake') && rng() < 0.3) arm = 'quake'
  else if (has('reject') && (target.x < 110 || target.x > t.w - 110) && rng() < 0.7) arm = 'reject'
  else {
    const attack = ([...SPECIAL_ORDER, ...POOL] as ArmKey[]).filter(k => has(k) && !['coffee', 'quake', 'wall', 'warp', 'reject', 'drill'].includes(k)) // 땅 뚫기는 조준이 어려워 CPU는 안 씀
    if (attack.length && rng() < 0.45) arm = attack[Math.floor(rng() * attack.length)]
  }
  if (!firesShot(arm)) return { id, x: me.x, y: me.y, facing, elev: me.elev, power: 0, weapon: arm }
  // 상대마다 가장 가까이 떨어뜨릴 수 있는 각도·힘을 찾아, 실제로 맞힐 수 있는(가장 가까이 떨어지는) 상대를 고른다.
  // 벽·천장 너머라 못 맞히는 가까운 상대만 계속 노리지 않게(터널·벙커 맵). 비슷하면 가까운 상대.
  const foes = s.players.filter(p => p.alive && p.team !== me.team).sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))
  let best = { elev: 45, power: 0.6, d: Infinity, facing }
  for (const [fi, foe] of foes.entries()) {
    const fFacing: 1 | -1 = foe.x >= me.x ? 1 : -1
    const tx = foe.x, ty = bodyY(foe)
    if (arm === 'bolt') {
      if (fi > 0) continue
      const m = muzzle({ x: me.x, y: me.y, facing: fFacing, elev: 0 })
      const elev = (Math.atan2(m.y - ty, Math.abs(tx - m.x)) * 180) / Math.PI
      return { id, x: me.x, y: me.y, facing: fFacing, elev: Math.max(ELEV_MIN, Math.min(88, elev + (rng() - 0.5) * 3)), power: 1, weapon: arm }
    }
    // 낮게(굴 안)부터 높게까지 훑는다
    for (let elev = -10; elev <= 80; elev += 5) {
      for (let power = 0.06; power <= 1.0001; power += 0.025) {
        const l = launch({ x: me.x, y: me.y, facing: fFacing, elev }, power)
        const o = flyOpts(arm === 'mail' ? 'clip' : arm, s.wind, s.players, me, false)
        const f = fly(t, s.players, id, l.x, l.y, l.vx, l.vy, 0, o)
        if (!f.end) continue
        if (Math.hypot(f.end.x - me.x, f.end.y - bodyY(me)) < 40) continue // 내 발밑은 피함
        const d = Math.hypot(f.end.x - tx, f.end.y - ty) + fi * 12 // 먼 상대는 조금 덜 선호
        if (d < best.d) best = { elev, power, d, facing: fFacing }
      }
    }
  }
  return {
    id, x: me.x, y: me.y, facing: best.facing,
    elev: Math.max(ELEV_MIN, Math.min(88, best.elev + (rng() - 0.5) * 7)),
    power: Math.max(0.05, Math.min(1, best.power + (rng() - 0.5) * 0.075)),
    weapon: arm,
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
