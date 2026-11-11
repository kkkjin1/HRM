// 🏎 퇴근 레이싱 — 차종(2026-11-10 사용자 요청: "세단·SUV·스포츠카·쿠페 등 차종, 속도·특성 다르게 + 슈퍼카는 승차감이 다르게").
// 차종 = 차고에서 고르는 차체(CarLook.body). 외형 + 주행 성능(spec) + 운전석 승차감(ride)이 같이 바뀐다.
// 균형: 최고 속도가 빠를수록 장애물·커브·미끄럼에 약하게 — 한 차종이 늘 이기지 않게(raceCars.test의 CPU 모의 경주로 확인).
// 판정 크기(KART_HX·KART_HY)는 모두 같다(외형만 크다).
// 규칙 숫자를 바꾸면 lib/race.ts RACE_PROTO를 올린다(다른 화면과 성능이 달라지면 순위가 엉킨다).

import { ACCEL, SLOW_KEEP, STEER, V_BOOST, V_MAX } from '@/lib/race'

export type CarBody = 'kart' | 'sedan' | 'suv' | 'coupe' | 'sport' | 'super'
export const CAR_BODIES: CarBody[] = ['kart', 'sedan', 'suv', 'coupe', 'sport', 'super']

// 주행 성능 — kartStep(opts.spec)·bump(mass)가 쓴다
//   drift = 커브에서 바깥으로 밀리는 배율 · slip/spin = 미끄덩·빙글 시간 배율 · slowKeep = 감속 장애물(웅덩이·턱·허들)에 남는 속도 비율
//   mass = 부딪힐 때 무게(무거우면 덜 밀리고 상대를 더 민다)
export type CarSpec = { vMax: number; accel: number; steer: number; boost: number; drift: number; slip: number; spin: number; slowKeep: number; mass: number }
// 운전석 승차감 — 화면만(판정 무관)
//   camH = 눈높이(높을수록 멀리·내려다봄) · dashTop = 대시보드 윗선(화면 비율) · roof = 앞유리 위 지붕 두께(px, 낮은 차일수록 두껍게 = 시야가 좁고 낮다) · focal = 시야(작을수록 넓게) · fovKick = 최고속에서 시야가 넓어지는 정도
//   trim = 실내 등급 0~5(차마다 다른 내장 — 0 카트 맨 플라스틱 · 1 세단 원목·아날로그 시계 · 2 SUV 고무 질감·리벳·나침반
//          · 3 쿠페 피아노 블랙·두 색 무드등·크로노 시계 · 4 스포츠 카본·회전계·버킷 시트 · 5 슈퍼 금장·퀼팅·변속 표시등·HUD)
//   pillar = 앞유리 기둥 위쪽 폭(px, 비쌀수록 얇다)
//   2026-11-11 사용자: 카트-세단 / SUV-쿠페 / 스포츠카-슈퍼카는 짝끼리 각도·앞유리 크기 같게, 실내 장식으로만 고급스러움 차이 → VIEW_A/B/C 공유
//   2026-11-11 사용자: "비싼 차(얻기 어려운 차)일수록 운전 중 화면이 넓어지고 내장재도 그럴싸하게" → 지붕·기둥 얇게, 대시보드 아래로, 시야 넓게
//   buzz = 노면 잔진동(px, 속도에 비례) · sway/swayMs = 출렁임(px, 주기) · lines = 속도선 세기(0~1) · hitShake = 부딪힘 흔들림 배율
export type CarRide = { trim: 0 | 1 | 2 | 3 | 4 | 5; pillar: number; camH: number; dashTop: number; roof: number; focal: number; fovKick: number; buzz: number; sway: number; swayMs: number; lines: number; hitShake: number }
export type CarInfo = {
  key: CarBody; name: string; emoji: string; price: number; needs?: CarBody
  spec: CarSpec; ride: CarRide
  bars: { speed: number; accel: number; handling: number; grip: number; weight: number } // 1~5(차고 표시용)
  traits: string // 한 줄 특성
  feel: string // 승차감 한 줄
}

// 짝마다 같은 운전석 시야(각도·앞유리 크기)
const VIEW_A = { pillar: 88, camH: 50, dashTop: 0.63, roof: 20, focal: 340, fovKick: 0 } // 카트·세단
const VIEW_B = { pillar: 68, camH: 62, dashTop: 0.665, roof: 11, focal: 325, fovKick: 15 } // SUV·쿠페
const VIEW_C = { pillar: 46, camH: 38, dashTop: 0.7, roof: 5, focal: 305, fovKick: 45 } // 스포츠카·슈퍼카

const KART_SPEC: CarSpec = { vMax: V_MAX, accel: ACCEL, steer: STEER, boost: V_BOOST, drift: 1, slip: 1, spin: 1, slowKeep: SLOW_KEEP, mass: 1 }

export const CARS: Record<CarBody, CarInfo> = {
  kart: {
    key: 'kart', name: '카트', emoji: '🛺', price: 0,
    spec: KART_SPEC,
    ride: { trim: 0, ...VIEW_A, buzz: 1.3, sway: 0, swayMs: 1000, lines: 0, hitShake: 1 },
    bars: { speed: 3, accel: 3, handling: 4, grip: 3, weight: 2 },
    traits: '기본 차 — 무난한 균형',
    feel: '맨 플라스틱 실내 · 두꺼운 기둥 · 낮고 가볍게 덜덜덜',
  },
  sedan: {
    key: 'sedan', name: '세단', emoji: '🚗', price: 20,
    spec: { vMax: 438, accel: 240, steer: 225, boost: V_BOOST, drift: 0.8, slip: 0.65, spin: 0.9, slowKeep: 0.55, mass: 1.2 },
    ride: { trim: 1, ...VIEW_A, buzz: 0.15, sway: 1.2, swayMs: 1700, lines: 0, hitShake: 0.55 },
    bars: { speed: 3, accel: 2, handling: 3, grip: 5, weight: 3 },
    traits: '미끄럼·커브에 강한 안정형 — 기름·빙판에서 금방 다시 잡혀요',
    feel: '원목 장식·아날로그 시계·크롬 테 · 구름 위처럼 부드럽게',
  },
  suv: {
    key: 'suv', name: 'SUV', emoji: '🚙', price: 25,
    spec: { vMax: 432, accel: 232, steer: 210, boost: 660, drift: 0.75, slip: 0.75, spin: 0.8, slowKeep: 0.85, mass: 1.8 },
    ride: { trim: 2, ...VIEW_B, buzz: 0.4, sway: 3.2, swayMs: 2300, lines: 0, hitShake: 0.5 },
    bars: { speed: 2, accel: 2, handling: 2, grip: 4, weight: 5 },
    traits: '웅덩이·모래·과속방지턱을 그냥 넘고, 부딪히면 상대가 튕겨 나가요',
    feel: '고무 질감 대시·은색 리벳·나침반 · 넓은 앞유리로 출렁출렁',
  },
  coupe: {
    key: 'coupe', name: '쿠페', emoji: '🚘', price: 25,
    spec: { vMax: 436, accel: 280, steer: 245, boost: 670, drift: 1, slip: 1.05, spin: 0.85, slowKeep: 0.42, mass: 0.95 },
    ride: { trim: 3, ...VIEW_B, buzz: 0.7, sway: 0.5, swayMs: 1400, lines: 0.3, hitShake: 1 },
    bars: { speed: 3, accel: 5, handling: 5, grip: 3, weight: 2 },
    traits: '가속·핸들링 최고 — 빙글 돈 뒤에도 금방 다시 달려요',
    feel: '피아노 블랙·두 색 무드등·크로노 시계 · 경쾌한 핸들',
  },
  sport: {
    key: 'sport', name: '스포츠카', emoji: '🏎️', price: 30,
    spec: { vMax: 443, accel: 255, steer: 236, boost: 685, drift: 1.25, slip: 1.25, spin: 1.05, slowKeep: 0.38, mass: 0.95 },
    ride: { trim: 4, ...VIEW_C, buzz: 1, sway: 0, swayMs: 1000, lines: 0.6, hitShake: 1.3 },
    bars: { speed: 4, accel: 4, handling: 4, grip: 2, weight: 2 },
    traits: '빠르고 잘 나가지만 미끄럼·감속 장애물에 조금 약해요',
    feel: '파노라마 앞유리 · 카본·빨간 박음질·회전계·버킷 시트 + 속도선',
  },
  super: {
    key: 'super', name: '슈퍼카', emoji: '🚀', price: 60, needs: 'sport',
    spec: { vMax: 452, accel: 262, steer: 205, boost: 705, drift: 1.6, slip: 1.6, spin: 1.25, slowKeep: 0.3, mass: 0.9 },
    ride: { trim: 5, ...VIEW_C, buzz: 2, sway: 0, swayMs: 1000, lines: 1, hitShake: 1.8 },
    bars: { speed: 5, accel: 5, handling: 2, grip: 1, weight: 1 },
    traits: '최고 속도 1등 — 대신 핸들이 무겁고 커브에서 밀리며, 부딪히면 크게 손해',
    feel: '파노라마 앞유리 · 금장·다이아 퀼팅·변속 표시등·HUD · 최고속에서 떨려요',
  },
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
  const y = bz * (Math.sin(wall / 17) * 0.6 + Math.sin(wall / 29 + 1.3) * 0.4) + r.sway * s * Math.sin((wall / r.swayMs) * Math.PI * 2)
  const x = bz * 0.5 * Math.sin(wall / 23 + 0.7)
  const roll = r.sway * s * 0.004 * Math.sin((wall / r.swayMs) * Math.PI * 2 + 1.2)
  return { x, y, roll }
}
