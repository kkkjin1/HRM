// 🏎 퇴근 레이싱 — 차종.
// 2026-11-24 사용자: "스포츠카를 사는 재미가 없다" → 10종 사다리. 작고 투박한 차에서 시작해 점점 크고 고급스러워지고, 성능도 자연스럽게 같이 오른다.
//   카트 → 모닝빵 → 아방이 → 개나타 → 싼타썰매 → 그랜절 → 스무디 → 벤또 → 고르쉐 → 아르기닌 (실제 차 이름을 비튼 이름, 로고는 안 씀)
//   차마다 성격은 조금씩 남긴다(싼타썰매 = 무겁고 장애물에 강함, 스무디 = 가속, 아르기닌 = 제일 빠르지만 커브에서 밀림).
//   이전(2026-11-10~): 6종이 서로 비기게 맞춤 → 산 차는 산 값을 🪙로 돌려주고 모두 카트로 초기화(supabase/race_car_lineup_v2.sql).
// 차종 = 차고에서 고르는 차체(CarLook.body). 외형 + 주행 성능(spec) + 운전석 승차감(ride)이 같이 바뀐다.
// 판정 크기(KART_HX·KART_HY)는 모두 같다(외형만 크다).
// 가격은 SQL race_part_price와 같게. 규칙 숫자를 바꾸면 lib/race.ts RACE_PROTO를 올린다(다른 화면과 성능이 달라지면 순위가 엉킨다).

import { ACCEL, SLOW_KEEP, STEER, V_BOOST, V_MAX } from '@/lib/race'

export type CarBody = 'kart' | 'mini' | 'compact' | 'sedan' | 'suv' | 'grand' | 'coupe' | 'lux' | 'sport' | 'super'
export const CAR_BODIES: CarBody[] = ['kart', 'mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super']
// 차 등급(0 = 카트 ~ 9 = 아르기닌) — 실내 꾸미기 옵션이 몇 번째 차부터 뜨는지(lib/raceInterior.ts minTier)
export const carTier = (b: CarBody | null | undefined) => Math.max(0, CAR_BODIES.indexOf(b ?? 'kart'))

// 주행 성능 — kartStep(opts.spec)·bump(mass)가 쓴다
//   drift = 커브에서 바깥으로 밀리는 배율 · slip/spin = 미끄덩·빙글 시간 배율 · slowKeep = 감속 장애물(웅덩이·턱·허들)에 남는 속도 비율
//   mass = 부딪힐 때 무게(무거우면 덜 밀리고 상대를 더 민다)
export type CarSpec = { vMax: number; accel: number; steer: number; boost: number; drift: number; slip: number; spin: number; slowKeep: number; mass: number }
// 운전석 승차감 — 화면만(판정 무관)
//   camH = 눈높이 · dashTop = 대시보드 윗선(화면 비율) · roof = 앞유리 위 지붕 두께(px) · focal = 시야(작을수록 넓게) · fovKick = 최고속에서 시야가 넓어지는 정도
//   trim = 실내 등급 0~9 = 차 등급(차마다 다른 내장 — components/playground/raceCockpit.ts drawTrimDash)
//   pillar = 앞유리 기둥 위쪽 폭(px, 비쌀수록 얇다)
//   시야는 묶음끼리 같다(A 카트·모닝빵·아방이 / B 개나타·싼타썰매·그랜절 / C 스무디·벤또 / D 고르쉐·아르기닌) — 위 묶음일수록 앞이 넓다
//   buzz = 노면 잔진동(px, 속도에 비례) · sway/swayMs = 출렁임(px, 주기) · lines = 속도선 세기(0~1) · hitShake = 부딪힘 흔들림 배율
// 승차감(2026-11-24 개편) — 등급 × 모양
//   등급: 저급(카트·모닝빵·아방이) = 덜덜 떨리고 턱마다 쿵 / 중급(개나타·싼타썰매·스무디) = 적당히 / 고급(그랜절·벤또·고르쉐·아르기닌) = 매끈
//   모양: 세단 = 낮고 단단, 좌우 기울기 적음 / SUV(싼타썰매·아르기닌) = 높고 크게 천천히 출렁 + 좌우로 기우뚱 / 스포츠 = 단단, 속도 붙으면 떨림
//   buzz = 잔떨림 · bump = 노면 턱(쿵) · sway·swayMs = 느린 출렁 · roll = 좌우 기울기 배수
export type RideClass = 'low' | 'mid' | 'high'
export type RideShape = 'open' | 'sedan' | 'suv' | 'sport'
export type CarRide = { trim: number; pillar: number; camH: number; dashTop: number; roof: number; focal: number; fovKick: number; buzz: number; bump: number; sway: number; swayMs: number; roll: number; lines: number; hitShake: number; cls: RideClass; shape: RideShape }
export type CarInfo = {
  key: CarBody; name: string; emoji: string; price: number; needs?: CarBody
  spec: CarSpec; ride: CarRide
  bars: { speed: number; accel: number; handling: number; grip: number; weight: number } // 1~5(차고 표시용)
  traits: string // 한 줄 특성
  feel: string // 승차감 한 줄
}

export const VIEW_A = { pillar: 88, camH: 50, dashTop: 0.63, roof: 20, focal: 340, fovKick: 0 }
export const VIEW_B = { pillar: 68, camH: 60, dashTop: 0.665, roof: 11, focal: 325, fovKick: 15 }
export const VIEW_C = { pillar: 56, camH: 46, dashTop: 0.685, roof: 8, focal: 315, fovKick: 30 }
export const VIEW_D = { pillar: 46, camH: 38, dashTop: 0.7, roof: 5, focal: 305, fovKick: 45 }

const KART_SPEC: CarSpec = { vMax: V_MAX, accel: ACCEL, steer: STEER, boost: V_BOOST, drift: 1, slip: 1, spin: 1, slowKeep: SLOW_KEEP, mass: 1 }

// 성능 막대(1~5) — 숫자에서 계산(차고 표시용)
function barsOf(s: CarSpec): CarInfo['bars'] {
  const b = (v: number, lo: number, hi: number) => Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4)))
  return {
    speed: b(s.vMax, V_MAX, 456), accel: b(s.accel, ACCEL, 295),
    handling: b(s.steer / s.drift, 220, 300), grip: b((2 - s.slip - s.spin) / 2 + s.slowKeep, 0.45, 1.25), weight: b(s.mass, 0.95, 1.8),
  }
}
type Def = Omit<CarInfo, 'bars' | 'key'>
const def = (key: CarBody, d: Def): CarInfo => ({ key, ...d, bars: barsOf(d.spec) })

export const CARS: Record<CarBody, CarInfo> = {
  kart: def('kart', {
    name: '카트', emoji: '🛺', price: 0, spec: KART_SPEC,
    ride: { trim: 0, ...VIEW_A, buzz: 1.5, bump: 3.6, sway: 0, swayMs: 1000, roll: 0, lines: 0, hitShake: 1.1, cls: 'low', shape: 'open' },
    traits: '기본 차 — 지붕도 없는 맨 카트', feel: '🪨 저급 · 맨 플라스틱 · 덜덜덜 + 턱마다 쿵',
  }),
  mini: def('mini', {
    name: '모닝빵', emoji: '🍞', price: 10,
    spec: { vMax: 432, accel: 245, steer: 236, boost: 662, drift: 0.96, slip: 0.95, spin: 0.95, slowKeep: 0.47, mass: 0.95 },
    ride: { trim: 1, ...VIEW_A, buzz: 1.2, bump: 3.0, sway: 0.7, swayMs: 1100, roll: 1.2, lines: 0, hitShake: 1.1, cls: 'low', shape: 'sedan' },
    traits: '빵처럼 동글동글한 첫 차 — 핸들이 가볍고 경쾌해요', feel: '🪨 저급 · 체크무늬 천 · 통통 튀는 승차감',
  }),
  compact: def('compact', {
    name: '아방이', emoji: '🚗', price: 18,
    spec: { vMax: 435, accel: 248, steer: 237, boost: 666, drift: 0.92, slip: 0.9, spin: 0.92, slowKeep: 0.5, mass: 1.05 },
    ride: { trim: 2, ...VIEW_A, buzz: 0.9, bump: 2.4, sway: 0.8, swayMs: 1300, roll: 1, lines: 0, hitShake: 1, cls: 'low', shape: 'sedan' },
    traits: '각진 준중형 세단 — 트렁크 립까지, 다 조금씩 좋아졌어요', feel: '🪨 저급 · 검정 우레탄 · 덜컹거리지만 조금 나아짐',
  }),
  sedan: def('sedan', {
    name: '개나타', emoji: '🚘', price: 25,
    spec: { vMax: 438, accel: 250, steer: 234, boost: 670, drift: 0.85, slip: 0.75, spin: 0.9, slowKeep: 0.55, mass: 1.2 },
    ride: { trim: 3, ...VIEW_B, buzz: 0.3, bump: 1.1, sway: 1.0, swayMs: 1800, roll: 0.8, lines: 0, hitShake: 0.7, cls: 'mid', shape: 'sedan' },
    traits: '중형 세단 — 미끄럼에서 금방 다시 잡혀요', feel: '🚘 중급 세단 · 크림 가죽·원목 · 낮고 단단, 턱이 부드러워짐',
  }),
  suv: def('suv', {
    name: '싼타썰매', emoji: '🛷', price: 32,
    spec: { vMax: 439, accel: 244, steer: 222, boost: 672, drift: 0.8, slip: 0.75, spin: 0.82, slowKeep: 0.85, mass: 1.8 },
    ride: { trim: 4, ...VIEW_B, buzz: 0.45, bump: 1.3, sway: 3.4, swayMs: 2400, roll: 2.8, lines: 0, hitShake: 0.5, cls: 'mid', shape: 'suv' },
    traits: '웅덩이·모래·턱을 그냥 넘고, 부딪히면 상대가 튕겨 나가요', feel: '🚙 중급 SUV · 고무 대시·나침반 · 높은 눈으로 크게 출렁·기우뚱',
  }),
  grand: def('grand', {
    name: '그랜절', emoji: '🙇', price: 40,
    spec: { vMax: 442, accel: 256, steer: 236, boost: 676, drift: 0.8, slip: 0.66, spin: 0.85, slowKeep: 0.6, mass: 1.35 },
    ride: { trim: 5, ...VIEW_B, buzz: 0.08, bump: 0.3, sway: 1.7, swayMs: 2300, roll: 1.1, lines: 0, hitShake: 0.45, cls: 'high', shape: 'sedan' },
    traits: '큰 고급 세단 — 조용하고 묵직하게 잘 나가요', feel: '☁️ 고급 세단 · 나파 가죽·무드등 · 구름처럼 둥실',
  }),
  coupe: def('coupe', {
    name: '스무디', emoji: '🥤', price: 50,
    spec: { vMax: 444, accel: 286, steer: 250, boost: 682, drift: 0.9, slip: 0.85, spin: 0.82, slowKeep: 0.5, mass: 1.0 },
    ride: { trim: 6, ...VIEW_C, buzz: 0.6, bump: 0.9, sway: 0.4, swayMs: 1300, roll: 0.4, lines: 0.3, hitShake: 0.9, cls: 'mid', shape: 'sport' },
    traits: '크롬·검정 유광 지붕 독일 쿠페 — 가속·핸들링이 훌쩍 좋아져요', feel: '🏁 중급 스포츠 · 피아노 블랙·크로노 · 단단하고 통통',
  }),
  lux: def('lux', {
    name: '벤또', emoji: '🍱', price: 65,
    spec: { vMax: 447, accel: 270, steer: 244, boost: 690, drift: 0.76, slip: 0.6, spin: 0.78, slowKeep: 0.62, mass: 1.4 },
    ride: { trim: 7, ...VIEW_C, buzz: 0.03, bump: 0.12, sway: 1.1, swayMs: 2400, roll: 0.8, lines: 0.1, hitShake: 0.4, cls: 'high', shape: 'sedan' },
    traits: '최고급 세단 — 빠르고 흔들림 없이 안정적', feel: '☁️ 고급 세단 · 64색 무드등 · 흔들림이 거의 없음',
  }),
  sport: def('sport', {
    name: '고르쉐', emoji: '🏎️', price: 85,
    spec: { vMax: 451, accel: 282, steer: 250, boost: 697, drift: 0.95, slip: 0.85, spin: 0.8, slowKeep: 0.5, mass: 1.0 },
    ride: { trim: 8, ...VIEW_D, buzz: 1, bump: 0.45, sway: 0, swayMs: 1000, roll: 0, lines: 0.6, hitShake: 1.2, cls: 'high', shape: 'sport' },
    traits: '최고급 4도어 스포츠 세단 — 낮고 길고, 빠르고 잘 꺾여요', feel: '🏁 고급 스포츠 · 알칸타라·카본 · 단단, 속도 붙으면 떨림',
  }),
  super: def('super', {
    name: '아르기닌', emoji: '🐂', price: 120,
    spec: { vMax: 456, accel: 295, steer: 246, boost: 712, drift: 1.05, slip: 0.9, spin: 0.8, slowKeep: 0.48, mass: 1.0 },
    ride: { trim: 9, ...VIEW_D, buzz: 1.6, bump: 0.25, sway: 1.5, swayMs: 2600, roll: 2.2, lines: 1, hitShake: 1.5, cls: 'high', shape: 'suv' },
    traits: '금장 슈퍼 SUV — 최고 속도·가속 1등, 커브에서만 살짝 밀려요', feel: '👑 고급 SUV · 금장·HUD · 매끈하게 출렁 + 최고속에서 떨림',
  }),
}

export const carInfo = (b: CarBody | null | undefined): CarInfo => CARS[b ?? 'kart'] ?? CARS.kart
export const specOf = (b: CarBody | null | undefined): CarSpec => carInfo(b).spec
export const rideOf = (b: CarBody | null | undefined): CarRide => carInfo(b).ride
export const isCarBody = (v: unknown): v is CarBody => typeof v === 'string' && (CAR_BODIES as string[]).includes(v)

// 운전석 화면 흔들림(px) — wall = 화면 시각(ms), speed01 = 속도/최고속도(0~1+)
// buzz는 빠른 잔진동(속도에 비례), sway는 느린 출렁임(SUV·세단). 슈퍼카는 최고속 근처에서만 크게 떨린다.
export function rideOffset(r: CarRide, wall: number, speed01: number): { x: number; y: number; roll: number } {
  const s = Math.max(0, Math.min(1.3, speed01))
  const hi = r.lines >= 1 ? Math.max(0, (s - 0.75) / 0.35) : s // 슈퍼카: 속도가 붙어야 떨림
  const bz = r.buzz * hi
  // 노면 턱 — 0.65초 칸마다 절반쯤 '쿵'(정해진 무작위라 다 같이 같은 모양) · 저급일수록 크다
  const SLOT = 650, slot = Math.floor(wall / SLOT)
  const hash = Math.abs(Math.sin(slot * 12.9898) * 43758.5453) % 1
  const u = (wall - slot * SLOT) / 260
  const jolt = hash < 0.55 && u < 1 ? r.bump * Math.min(1, s * 1.2) * Math.sin(u * Math.PI * 3) * (1 - u) : 0
  const wave = Math.sin((wall / r.swayMs) * Math.PI * 2)
  const y = bz * (Math.sin(wall / 17) * 0.6 + Math.sin(wall / 29 + 1.3) * 0.4) + r.sway * s * wave + jolt
  const x = bz * 0.5 * Math.sin(wall / 23 + 0.7) + jolt * 0.25 * (hash < 0.27 ? -1 : 1)
  const roll = r.sway * s * 0.004 * r.roll * Math.sin((wall / r.swayMs) * Math.PI * 2 + 1.2) + jolt * 0.0015
  return { x, y, roll }
}
