// 🏎 퇴근 레이싱 — 운전석 실내 꾸미기(2026-11-05). 레이스 중 V키 = 추격 시점 ↔ 운전석 1인칭.
// 아이템 = (부위, 종류, 구단) 한 조합. 부위마다 종류·구단을 따로 고른다(섞어 꾸미기).
//   무료 종류 = 모든 구단 버전을 처음부터 가짐 / 상점 = 🪙로 구단 버전마다 삼 / 뽑기 = 🎲 실내 뽑기·관리자 선물로만.
// 저장: race_garage.interior(장착, jsonb {부위: {v, team}}) · interior_owned(가진 조합 키) · interior_gifts(새로 받은 선물 키)
//   쓰기는 서버 함수만(supabase/add_race_interior.sql) — 종류·가격·뽑기 값을 바꾸면 SQL도 같이(raceInterior.test.ts가 맞는지 본다).
// 그림은 components/playground/raceCockpit.ts.

import { KBO_TEAMS, teamOf, type TeamKey } from '@/lib/baseballGear'

export type SlotKey = 'wheel' | 'dash' | 'screen' | 'charm' | 'frame' | 'doll' | 'hands'
export type Get = 'free' | 'shop' | 'random'
export type Variant = { key: string; name: string; e: string; get: Get; price?: number }
export const SLOTS: { key: SlotKey; name: string; icon: string; variants: Variant[] }[] = [
  { key: 'wheel', name: '핸들', icon: '🛞', variants: [
    { key: 'toy', name: '동글 장난감', e: '🍩', get: 'free' }, { key: 'race', name: '레이싱', e: '🏁', get: 'shop', price: 15 }, { key: 'bus', name: '큰 버스 핸들', e: '🚌', get: 'random' } ] },
  { key: 'dash', name: '대시보드', icon: '🎛️', variants: [
    { key: 'smooth', name: '매끈', e: '⬛', get: 'free' }, { key: 'stitch', name: '스티치 가죽', e: '🧵', get: 'shop', price: 10 }, { key: 'carbon', name: '카본', e: '🕸️', get: 'random' }, { key: 'wood', name: '원목 띠', e: '🪵', get: 'shop', price: 15 } ] },
  { key: 'screen', name: '가운데 화면', icon: '🖥️', variants: [
    { key: 'basic', name: '기본 화면', e: '📱', get: 'free' }, { key: 'led', name: '전광판', e: '🔆', get: 'shop', price: 10 }, { key: 'tv', name: '레트로 TV', e: '📺', get: 'random' }, { key: 'cheer', name: '응원 띠', e: '📣', get: 'shop', price: 10 } ] },
  { key: 'charm', name: '룸미러 장식', icon: '🪞', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'pennant', name: '응원 깃발', e: '🚩', get: 'shop', price: 5 }, { key: 'ball', name: '야구공', e: '⚾', get: 'shop', price: 5 }, { key: 'star', name: '별', e: '⭐', get: 'random' } ] },
  { key: 'frame', name: '거울 테두리', icon: '🪞', variants: [
    { key: 'basic', name: '기본', e: '▫️', get: 'free' }, { key: 'chrome', name: '크롬', e: '🪩', get: 'shop', price: 10 }, { key: 'stripe', name: '구단 줄무늬', e: '🎏', get: 'shop', price: 15 },
    { key: 'neon', name: '네온', e: '💡', get: 'random' }, { key: 'gold', name: '금테', e: '👑', get: 'random' } ] },
  { key: 'doll', name: '인형', icon: '🧸', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'dog', name: '강아지', e: '🐶', get: 'shop', price: 10 }, { key: 'penguin', name: '펭귄', e: '🐧', get: 'random' }, { key: 'duck', name: '오리', e: '🦆', get: 'random' } ] },
  { key: 'hands', name: '손', icon: '✋', variants: [
    { key: 'glove', name: '운전 장갑', e: '🧤', get: 'free' }, { key: 'mitt', name: '야구 글러브', e: '🥎', get: 'random' }, { key: 'mitten', name: '벙어리장갑', e: '🧶', get: 'shop', price: 5 } ] },
]
export const INTERIOR_DRAW_PRICE = 10 // 🎲 실내 뽑기 한 번(아직 없는 상점·뽑기 조합 중 하나, 모두 같은 확률)

export const slotOf = (k: SlotKey) => SLOTS.find(s => s.key === k)!
export const variantOf = (k: SlotKey, v: string): Variant | undefined => slotOf(k).variants.find(x => x.key === v)
export type Pick = { v: string; team: TeamKey | null }
export type Equip = Record<SlotKey, Pick>
// 그리기 함수가 쓰는 납작한 모양(부위 하나의 구단 + 모든 부위 종류)
export type Interior = { team: TeamKey | null } & Record<SlotKey, string>
export const TEAM_KEYS: (TeamKey | null)[] = [null, ...KBO_TEAMS.map(t => t.key)]
export const itemKey = (s: SlotKey, v: string, team: TeamKey | null) => `${s}:${v}:${team ?? 'base'}`
// 처음 운전석 — 무료 종류, 구단은 선호 구단(없으면 기본)
export const defaultEquip = (team: TeamKey | null = null): Equip =>
  Object.fromEntries(SLOTS.map(s => [s.key, { v: s.variants[0].key, team }])) as Equip
// 장착 현황 6칸 — 룸미러 칸은 장식 + 거울 테두리 둘을 묶는다
export const GROUPS: { key: SlotKey; label: string; subs: SlotKey[] }[] = [
  { key: 'wheel', label: '핸들', subs: ['wheel'] }, { key: 'dash', label: '대시보드', subs: ['dash'] }, { key: 'screen', label: '가운데 화면', subs: ['screen'] },
  { key: 'charm', label: '룸미러', subs: ['charm', 'frame'] }, { key: 'doll', label: '인형', subs: ['doll'] }, { key: 'hands', label: '손', subs: ['hands'] },
]
export const groupOf = (k: SlotKey) => GROUPS.find(g => g.subs.includes(k))!
export const teamShort = (t: TeamKey | null) => (t ? teamOf(t)!.name.split(' ')[0] : '기본')

type InteriorRow = { team?: string | null; interior?: unknown; interior_owned?: string[] | null; interior_gifts?: string[] | null } | null | undefined
// 가진 조합인지 — SQL race_interior_has와 같은 규칙
export function ownsInterior(row: InteriorRow, s: SlotKey, v: string, team: TeamKey | null) {
  const vv = variantOf(s, v)
  if (!vv) return false
  if (vv.get === 'free') return true
  return !!row?.interior_owned?.includes(itemKey(s, v, team))
}
// 저장된 장착 → 그릴 조합(없거나 못 가진 건 무료 종류로)
export function interiorOf(row: InteriorRow): Equip {
  const base = defaultEquip(teamOf(row?.team ?? null)?.key ?? null)
  const raw = (row?.interior && typeof row.interior === 'object' ? row.interior : {}) as Record<string, { v?: unknown; team?: unknown }>
  for (const s of SLOTS) {
    const p = raw[s.key]
    if (!p || typeof p.v !== 'string') continue
    const team = typeof p.team === 'string' ? teamOf(p.team)?.key ?? null : null
    if (ownsInterior(row, s.key, p.v, team)) base[s.key] = { v: p.v, team }
  }
  return base
}

// 구단 → 실내 색. main = 몸 색, accent = 포인트(어두우면 흰색), dash = 대시보드
export type Pal = { main: string; accent: string; dash: string; word: string }
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))))
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(c => c.toString(16).padStart(2, '0')).join('')
}
export function palOf(team: TeamKey | null): Pal {
  const t = teamOf(team)
  if (!t) return { main: '#334155', accent: '#F59E0B', dash: '#1E293B', word: 'HRM' }
  const main = t.primary === '#000000' ? '#1A1A1A' : t.primary
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 }
  const accent = lum(t.secondary) > 70 ? t.secondary : lum(main) > 70 ? main : '#F8FAFC'
  return { main, accent, dash: shade(main, -0.4), word: t.wordmark }
}

export function interiorErrorText(msg: string) {
  if (msg.includes('NOT_ENOUGH_COINS')) return '🪙 코인이 모자라요'
  if (msg.includes('ALREADY_OWNED')) return '이미 가진 아이템이에요'
  if (msg.includes('NOT_FOR_SALE')) return '상점에선 못 사요 — 🎲 뽑기·선물로만'
  if (msg.includes('ALL_OWNED')) return '실내 아이템을 전부 모았어요 🎉'
  if (msg.includes('NOT_ADMIN')) return '관리자만 선물할 수 있어요'
  if (msg.includes('race_interior') || msg.includes('interior')) return '실내 저장 칸이 아직 없어요(add_race_interior.sql 실행 필요)'
  return msg
}
