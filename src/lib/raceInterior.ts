// 🏎 퇴근 레이싱 — 운전석 실내 꾸미기.
// 2026-11-24 개편(사용자: "구단 10개 변주 때문에 대시보드·룸미러에 큰 특색이 없다 → 구단은 로고로, 차마다 시각적 차별화"):
//   · 구단 = 선호 구단(차고) 하나 — 핸들 가운데 로고·소품 색으로 자동. 부위마다 구단 고르기 없앰.
//   · 차마다 실내 3종(TRIMS) — 1번은 무료, 2·3번은 🪙. 바탕색·핸들색·포인트색·대시 질감·화면·핸들 모양·거울 테·무드등이 다르다.
//     싼 차는 구리게, 그랜절부터는 무료 1번도 '오?' 하게(무드등·크롬), 고르쉐·아르기닌에서 빵(raceCockpit.ts drawTierExtras).
//   · 소품(PROPS) = 지붕 장식·인형·손 — 모든 차 공통, 무료/🪙/🎲뽑기.
// 저장: race_garage.interior = { trims: {차: 0|1|2}, charm, doll, hands } · interior_owned = 'trim:차:번호' / '소품:종류' · interior_gifts = 새로 받은 것
//   쓰기는 서버 함수만(supabase/race_interior_v2.sql) — 가격·종류를 바꾸면 SQL도(raceInterior.test.ts가 맞는지 본다).
// 그림은 components/playground/raceCockpit.ts(drawCockpit + skin).

import { teamOf, type TeamKey } from '@/lib/baseballGear'
import { CAR_BODIES, type CarBody } from '@/lib/raceCars'

// ── 그림용(raceCockpit.ts가 쓰는 납작한 모양) ──
export type SlotKey = 'wheel' | 'dash' | 'screen' | 'charm' | 'frame' | 'doll' | 'hands'
export type Pick = { v: string; team: TeamKey | null }
export type Equip = Record<SlotKey, Pick>
export type Interior = { team: TeamKey | null } & Record<SlotKey, string>
// 실내 3종이 정하는 색(대시 바탕·기둥·핸들·포인트·무드등). amb 'rainbow' = 색이 계속 바뀜
// lvl = 실내 3종 중 몇 번(0 무료 · 1 · 2) — 경기 중 연출 크기
export type Skin = { base: string; pillar?: string; wheelC: string; accent: string; amb?: string; lvl?: number }
export type CabinView = { eq: Equip; skin: Skin }

// ── 차마다 실내 3종 ──
type Wheel = 'toy' | 'race' | 'bus'
type Dash = 'smooth' | 'stitch' | 'carbon' | 'wood'
type Screen = 'basic' | 'led' | 'tv' | 'cheer'
type Frame = 'basic' | 'chrome' | 'stripe' | 'neon' | 'gold'
export type Trim = { name: string; e: string; base: string; pillar?: string; wheelC: string; accent: string; dash: Dash; screen: Screen; wheel: Wheel; frame: Frame; amb?: string }
const t = (name: string, e: string, base: string, wheelC: string, accent: string, dash: Dash, screen: Screen, wheel: Wheel, frame: Frame, amb?: string, pillar?: string): Trim =>
  ({ name, e, base, wheelC, accent, dash, screen, wheel, frame, ...(amb ? { amb } : {}), ...(pillar ? { pillar } : {}) })
export const TRIMS: Record<CarBody, [Trim, Trim, Trim]> = {
  kart: [t('맨 플라스틱', '🔩', '#3F444C', '#6B7280', '#9CA3AF', 'smooth', 'basic', 'toy', 'basic'),
    t('스티커 범벅', '🏷️', '#3A3F47', '#F59E0B', '#FDE047', 'smooth', 'cheer', 'toy', 'stripe'),
    t('동네 레이서', '🏁', '#1F2328', '#DC2626', '#EF4444', 'carbon', 'led', 'race', 'stripe')],
  mini: [t('빵집 베이지', '🍞', '#6B5B45', '#C8A97E', '#F3D9A4', 'smooth', 'basic', 'toy', 'basic'),
    t('민트 캔디', '🍬', '#2F5D57', '#5EEAD4', '#99F6E4', 'stitch', 'basic', 'toy', 'basic'),
    t('딸기 우유', '🍓', '#7A3B4E', '#F9A8D4', '#FBCFE8', 'stitch', 'tv', 'toy', 'stripe')],
  compact: [t('회사 차', '💼', '#24282F', '#374151', '#94A3B8', 'smooth', 'basic', 'toy', 'basic'),
    t('튜닝 블루', '🔵', '#1E2A44', '#2563EB', '#60A5FA', 'stitch', 'led', 'race', 'chrome'),
    t('스트리트 레드', '🔴', '#2A1414', '#B91C1C', '#F87171', 'carbon', 'led', 'race', 'stripe')],
  sedan: [t('크림 가죽', '🥛', '#5B4636', '#3B2F26', '#F1E4C8', 'wood', 'basic', 'toy', 'chrome'),
    t('네이비 수트', '👔', '#1E2A3F', '#1E293B', '#CBD5E1', 'stitch', 'basic', 'toy', 'chrome'),
    t('와인 레드', '🍷', '#4A1622', '#5B1A24', '#FCA5A5', 'wood', 'basic', 'toy', 'chrome')],
  suv: [t('아웃도어 그레이', '🏕️', '#2A2F36', '#374151', '#F97316', 'smooth', 'basic', 'bus', 'basic'),
    t('사막 샌드', '🏜️', '#6B5A3E', '#7C5A2E', '#FCD34D', 'stitch', 'tv', 'bus', 'chrome'),
    t('눈썰매 화이트', '❄️', '#CBD5E1', '#1E293B', '#38BDF8', 'stitch', 'tv', 'bus', 'chrome', '#7DD3FC')],
  // ── 여기부터 무료 1번도 무드등·크롬('오?') ──
  grand: [t('브라운 우드', '🪵', '#4A2A18', '#3A2418', '#FBBF24', 'wood', 'basic', 'toy', 'chrome', '#FBBF24'),
    t('블랙 애쉬', '🖤', '#18181B', '#0A0A0A', '#E5E7EB', 'wood', 'basic', 'toy', 'chrome', '#F8FAFC'),
    t('화이트 나파', '🤍', '#D6CCBA', '#EDE6D8', '#A16207', 'stitch', 'basic', 'toy', 'gold', '#FDE68A', '#8B7355')],
  coupe: [t('피아노 블랙', '🎹', '#101114', '#111318', '#22D3EE', 'carbon', 'led', 'race', 'chrome', '#22D3EE'),
    t('에스프레소', '☕', '#2B1A12', '#3F2A1E', '#F59E0B', 'stitch', 'led', 'race', 'chrome', '#F59E0B'),
    t('아이스 블루', '🧊', '#1B2A3A', '#E0F2FE', '#38BDF8', 'carbon', 'led', 'race', 'neon', '#38BDF8')],
  lux: [t('블랙 나이트', '🌙', '#15171C', '#0B0B0E', '#CBD5E1', 'stitch', 'basic', 'toy', 'chrome', 'rainbow'),
    t('마카다미아', '🌰', '#CDBA9A', '#8B6F4E', '#F5E6C8', 'wood', 'basic', 'toy', 'gold', '#FBBF24', '#5B4636'),
    t('딥 버건디', '🍒', '#3A0F1A', '#5B1222', '#FDA4AF', 'stitch', 'basic', 'toy', 'chrome', '#FB7185')],
  // ── 빵 ──
  sport: [t('카본 레이스', '🔥', '#1A1C21', '#111318', '#EF4444', 'carbon', 'led', 'race', 'neon', '#EF4444'),
    t('분필 그레이', '⚪', '#4B5058', '#E5E7EB', '#F97316', 'carbon', 'led', 'race', 'neon', '#F97316'),
    t('보르도 레드', '🩸', '#4A1018', '#7F1D1D', '#FCA5A5', 'stitch', 'led', 'race', 'gold', '#F43F5E')],
  super: [t('크림 퀼팅', '👑', '#E9DDC4', '#3A2A1A', '#D4A017', 'stitch', 'led', 'race', 'gold', '#FACC15', '#1A1410'),
    t('블랙 골드', '🖤', '#0A0A0A', '#111111', '#FACC15', 'carbon', 'led', 'race', 'gold', '#FACC15'),
    t('네온 그린', '🐍', '#0B1A0F', '#15803D', '#4ADE80', 'carbon', 'led', 'race', 'neon', '#22C55E')],
}
// 2·3번 값(차 등급이 오를수록 비싸게) — SQL race_interior2_price와 같게
const P1 = [3, 4, 6, 8, 10, 12, 15, 18, 22, 28]
export const trimPrice = (body: CarBody, i: number) => (i <= 0 ? 0 : i === 1 ? P1[CAR_BODIES.indexOf(body)] : Math.round(P1[CAR_BODIES.indexOf(body)] * 1.8))
export const trimKey = (body: CarBody, i: number) => `trim:${body}:${i}`

// ── 소품(모든 차 공통) ──
export type PropSlot = 'charm' | 'doll' | 'hands'
export type Get = 'free' | 'shop' | 'random'
export type PropVariant = { key: string; name: string; e: string; get: Get; price?: number }
export const PROPS: { key: PropSlot; name: string; icon: string; variants: PropVariant[] }[] = [
  { key: 'charm', name: '지붕 장식', icon: '🎐', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'pennant', name: '응원 깃발', e: '🚩', get: 'shop', price: 5 }, { key: 'ball', name: '야구공', e: '⚾', get: 'shop', price: 5 }, { key: 'star', name: '별', e: '⭐', get: 'random' } ] },
  { key: 'doll', name: '인형', icon: '🧸', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'dog', name: '강아지', e: '🐶', get: 'shop', price: 10 }, { key: 'penguin', name: '펭귄', e: '🐧', get: 'random' }, { key: 'duck', name: '오리', e: '🦆', get: 'random' } ] },
  { key: 'hands', name: '손', icon: '✋', variants: [
    { key: 'glove', name: '운전 장갑', e: '🧤', get: 'free' }, { key: 'mitten', name: '벙어리장갑', e: '🧶', get: 'shop', price: 5 }, { key: 'mitt', name: '야구 글러브', e: '🥎', get: 'random' } ] },
]
export const INTERIOR_DRAW_PRICE = 10 // 🎲 소품 뽑기 한 번(아직 없는 상점·뽑기 소품 중 하나)
export const propKey = (s: PropSlot, v: string) => `${s}:${v}`
export const propOf = (s: PropSlot, v: string) => PROPS.find(p => p.key === s)!.variants.find(x => x.key === v)

// ── 저장 모양 ──
export type Cabin = { trims: Partial<Record<CarBody, number>>; charm: string; doll: string; hands: string }
export const BASIC_CABIN: Cabin = { trims: {}, charm: 'none', doll: 'none', hands: 'glove' }
type InteriorRow = { team?: string | null; interior?: unknown; interior_owned?: string[] | null; interior_gifts?: string[] | null } | null | undefined

export const ownsTrim = (row: InteriorRow, body: CarBody, i: number) => i === 0 || !!row?.interior_owned?.includes(trimKey(body, i))
export function ownsProp(row: InteriorRow, s: PropSlot, v: string) {
  const pv = propOf(s, v)
  if (!pv) return false
  return pv.get === 'free' || !!row?.interior_owned?.includes(propKey(s, v))
}
// 저장된 것 → 가진 것만(없으면 무료)
export function cabinOf(row: InteriorRow): Cabin {
  const raw = (row?.interior && typeof row.interior === 'object' ? row.interior : {}) as { trims?: Record<string, unknown>; charm?: unknown; doll?: unknown; hands?: unknown }
  const trims: Cabin['trims'] = {}
  for (const b of CAR_BODIES) {
    const i = raw.trims?.[b]
    if (typeof i === 'number' && i >= 0 && i <= 2 && ownsTrim(row, b, i)) trims[b] = i
  }
  const prop = (s: PropSlot) => { const v = raw[s]; return typeof v === 'string' && ownsProp(row, s, v) ? v : PROPS.find(p => p.key === s)!.variants[0].key }
  return { trims, charm: prop('charm'), doll: prop('doll'), hands: prop('hands') }
}
// 그릴 것 — 차 + 실내 3종 중 고른 것 + 소품, 구단 = 선호 구단(로고·소품 색)
export function viewOf(cabin: Cabin, body: CarBody, team: TeamKey | null): CabinView {
  const lvl = cabin.trims[body] ?? 0
  const tr = TRIMS[body][lvl]
  const pick = (v: string): Pick => ({ v, team })
  return {
    eq: { wheel: pick(tr.wheel), dash: pick(tr.dash), screen: pick(tr.screen), frame: pick(tr.frame), charm: pick(cabin.charm), doll: pick(cabin.doll), hands: pick(cabin.hands) },
    skin: { base: tr.base, wheelC: tr.wheelC, accent: tr.accent, lvl, ...(tr.amb ? { amb: tr.amb } : {}), ...(tr.pillar ? { pillar: tr.pillar } : {}) },
  }
}
export const cabinViewOf = (row: InteriorRow, body: CarBody) => viewOf(cabinOf(row), body, teamOf(row?.team ?? null)?.key ?? null)
export const BASIC_VIEW: CabinView = viewOf(BASIC_CABIN, 'kart', null)
// 뒷유리로 남에게 보이는 실내(2026-11-24) — 무드등 색 + 뒷선반 인형. 레이스에선 다들 내 차를 뒤에서 본다
export type RearCabin = { amb: string | null; glow: string | null; doll: string | null }
export function rearOf(v: CabinView): RearCabin {
  const d = v.eq.doll.v
  return { amb: v.skin.amb ?? null, glow: (v.skin.lvl ?? 0) > 0 ? v.skin.accent : null, doll: d === 'dog' ? '🐶' : d === 'penguin' ? '🐧' : d === 'duck' ? '🦆' : null }
}

// 구단 → 색. main = 몸 색, accent = 포인트(어두우면 흰색), dash = 대시보드
export type Pal = { main: string; accent: string; dash: string; word: string }
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))))
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(c => c.toString(16).padStart(2, '0')).join('')
}
export function palOf(team: TeamKey | null): Pal {
  const tm = teamOf(team)
  if (!tm) return { main: '#334155', accent: '#F59E0B', dash: '#1E293B', word: 'HRM' }
  const main = tm.primary === '#000000' ? '#1A1A1A' : tm.primary
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 }
  const accent = lum(tm.secondary) > 70 ? tm.secondary : lum(main) > 70 ? main : '#F8FAFC'
  return { main, accent, dash: shade(main, -0.4), word: tm.wordmark }
}

export function interiorErrorText(msg: string) {
  if (msg.includes('NOT_ENOUGH_COINS')) return '🪙 코인이 모자라요'
  if (msg.includes('ALREADY_OWNED')) return '이미 가진 거예요'
  if (msg.includes('NOT_FOR_SALE')) return '상점에선 못 사요 — 🎲 뽑기·선물로만'
  if (msg.includes('ALL_OWNED')) return '소품을 전부 모았어요 🎉'
  if (msg.includes('NOT_ADMIN')) return '관리자만 선물할 수 있어요'
  if (msg.includes('race_interior2')) return '실내 저장 함수가 아직 없어요(race_interior_v2.sql 실행 필요)'
  return msg
}
