'use client'

// 🏎 퇴근 레이싱 차고 — 선호 구단 1개 + 🪙 코인으로 사는 부품 + 관리자가 주는 🎁 선물 부품.
// 기본 = 구단 색으로 도색 + 엠블럼이 그려진 카트(무료).
// 산 부품(일반)은 "고른 선호 구단 색·엠블럼으로" 그려진다(구단을 바꾸면 같이 바뀜).
// 선물 부품은 구단이 정해진 것도 있다(예: KIA 리어윙 — 선호 구단이 LG여도 그 부품만 KIA로). 영구 또는 1일권(오늘 밤 12시까지).
// 외형만 바뀐다 — 차체 업그레이드로 커 보여도 부딪힘 판정 크기는 그대로(공정하게).
// 가격·보상·하루 상한·소유 판정은 서버 함수(supabase/add_race_garage.sql, add_race_gifts.sql)와 맞춘다 — 숫자를 바꾸면 SQL도 같이.
//
// 장착 상태(equipped jsonb): 부위마다 true/'own' = 일반 부품, 구단 키('kia' 등) = 그 구단 선물 버전.
// 차체는 body('sport'|'super') + bodyTeam(선물 버전일 때만).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { teamOf, type TeamKey } from '@/lib/baseballGear'
import { interiorErrorText, type Equip, type SlotKey } from '@/lib/raceInterior'

export const RACE_ADMIN_EMAIL = 'ji.kim@egnis.kr' // 차 부품 선물을 줄 수 있는 유일한 계정(SQL admin_race_gift와 동일)

export type RacePart = 'flag' | 'wheels' | 'exhaust' | 'wing' | 'sport' | 'super'
export type SlotPart = 'flag' | 'wheels' | 'exhaust' | 'wing'
export const SLOT_PARTS: SlotPart[] = ['flag', 'wheels', 'exhaust', 'wing']
export const RACE_PARTS: { key: RacePart; name: string; emoji: string; price: number; help: string; needs?: RacePart }[] = [
  { key: 'flag', name: '응원 깃발', emoji: '🚩', price: 10, help: '안테나에 구단 깃발' },
  { key: 'wheels', name: '엠블럼 휠', emoji: '🛞', price: 15, help: '바퀴에 구단 엠블럼·팀 색 림' },
  { key: 'exhaust', name: '듀얼 배기구', emoji: '💨', price: 20, help: '크롬 배기구 2개 + 부스터 불꽃이 팀 색' },
  { key: 'wing', name: '팀 리어윙', emoji: '🪽', price: 25, help: '큰 뒷날개에 구단 글씨' },
  { key: 'sport', name: '스포츠 차체', emoji: '🏎️', price: 30, help: '차체가 더 크고 낮게 + 레이싱 줄무늬' },
  { key: 'super', name: '슈퍼카 차체', emoji: '🚀', price: 60, help: '가장 큰 차체 + 금테 엠블럼 + 후미등', needs: 'sport' },
]
export const partInfo = (p: string) => RACE_PARTS.find(x => x.key === p)
export const RACE_REWARD_TEXT = '완주 보상(다같이): 1등 5 · 2등 3 · 3등 2 · 완주 1 / 혼자 연습 1(하루 5까지) · 하루 최대 30'

export type CarBody = 'kart' | 'sport' | 'super'
// 부위 값: false = 안 낌 / 'own' = 선호 구단 버전 / 구단 키 = 그 구단 버전(선물)
export type SlotVal = false | 'own' | TeamKey
export type CarLook = { team: TeamKey | null; flag: SlotVal; wheels: SlotVal; exhaust: SlotVal; wing: SlotVal; body: CarBody; bodyTeam: TeamKey | null }
export const BASIC_CAR: CarLook = { team: null, flag: false, wheels: false, exhaust: false, wing: false, body: 'kart', bodyTeam: null }
// 부위를 그릴 구단(선물 버전이면 그 구단, 아니면 선호 구단)
export const slotTeam = (car: CarLook, v: SlotVal): TeamKey | null => (v === false ? null : v === 'own' ? car.team : v)

// interior* = 운전석 실내 꾸미기(lib/raceInterior.ts, add_race_interior.sql 실행 전엔 없음)
export type GarageRow = { member_id: string; team: string | null; coins: number; owned: string[]; equipped: Record<string, unknown>; interior?: unknown; interior_owned?: string[]; interior_gifts?: string[] }
export type RaceGift = { id: string; member_id: string; part: RacePart; team: TeamKey | null; expires_at: string | null; given_by: string | null; message: string | null; created_at: string }

export const giftValid = (g: RaceGift, nowMs: number) => !g.expires_at || Date.parse(g.expires_at) > nowMs

// 가진 부품인지 — SQL race_has와 같은 규칙
export function hasPart(row: GarageRow | null | undefined, gifts: RaceGift[], part: RacePart, team: TeamKey | null, nowMs: number) {
  const mine = gifts.filter(g => g.member_id === row?.member_id && g.part === part && giftValid(g, nowMs))
  if (team === null) return !!row?.owned?.includes(part) || mine.some(g => g.team === null)
  return mine.some(g => g.team === team)
}

export function carOf(row: GarageRow | null | undefined, gifts: RaceGift[] = [], nowMs = 0): CarLook {
  if (!row) return BASIC_CAR
  const e = row.equipped ?? {}
  const slot = (p: SlotPart): SlotVal => {
    const v = e[p]
    if (v === true || v === 'own') return hasPart(row, gifts, p, null, nowMs) ? 'own' : false
    const t = teamOf(typeof v === 'string' ? v : null)?.key
    if (!t) return false
    if (hasPart(row, gifts, p, t, nowMs)) return t
    return hasPart(row, gifts, p, null, nowMs) ? 'own' : false // 1일권이 끝나면 산 게 있으면 그걸로
  }
  let body: CarBody = 'kart'
  let bodyTeam: TeamKey | null = null
  if (e.body === 'sport' || e.body === 'super') {
    const bt = teamOf(typeof e.bodyTeam === 'string' ? e.bodyTeam : null)?.key ?? null
    if (hasPart(row, gifts, e.body, bt, nowMs)) { body = e.body; bodyTeam = bt }
    else if (bt && hasPart(row, gifts, e.body, null, nowMs)) body = e.body
  }
  return { team: teamOf(row.team)?.key ?? null, flag: slot('flag'), wheels: slot('wheels'), exhaust: slot('exhaust'), wing: slot('wing'), body, bodyTeam }
}

// race_set에 보낼 장착 상태
export function equipPayload(car: CarLook): Record<string, unknown> {
  const out: Record<string, unknown> = { body: car.body }
  if (car.bodyTeam) out.bodyTeam = car.bodyTeam
  for (const p of SLOT_PARTS) if (car[p]) out[p] = car[p]
  return out
}

export function garageErrorText(msg: string) {
  if (msg.includes('NOT_ENOUGH_COINS')) return '🪙 코인이 모자라요'
  if (msg.includes('ALREADY_OWNED')) return '이미 가진 부품이에요'
  if (msg.includes('NEED_SPORT')) return '스포츠 차체를 먼저 사야 해요'
  if (msg.includes('NOT_ADMIN')) return '관리자만 선물할 수 있어요'
  if (msg.includes('race_gifts') || msg.includes('admin_race_gift') || msg.includes('race_has')) return '선물 테이블이 아직 없어요(add_race_gifts.sql 실행 필요)'
  if (msg.includes('race_garage') || msg.includes('race_buy') || msg.includes('race_set') || msg.includes('race_reward')) return '차고 저장 테이블이 아직 없어요(add_race_garage.sql 실행 필요)'
  return msg
}

// 팀원이 몇 명 안 돼서 차고·선물은 전부 불러온다(남의 차 모양도 그려야 하니까)
export function useRaceGarage(myId: string | null) {
  const [rows, setRows] = useState<Map<string, GarageRow>>(new Map())
  const [gifts, setGifts] = useState<RaceGift[]>([])
  const [missing, setMissing] = useState(false)
  const fetchAll = useCallback(async () => {
    const sb = createClient()
    const [g, gf] = await Promise.all([
      sb.from('race_garage').select('*'), // 실내 칸(interior*)은 SQL 실행 전엔 없어서 * 로
      sb.from('race_gifts').select('*').order('created_at'), // 테이블이 아직 없으면 error → 빈 목록
    ])
    if (g.error) return { missing: g.error.code === '42P01' || g.error.code === 'PGRST205', rows: null, gifts: [] as RaceGift[] }
    return { missing: false, rows: new Map((g.data as GarageRow[]).map(r => [r.member_id, r])), gifts: gf.error ? [] : (gf.data as RaceGift[]) }
  }, [])
  const apply = (r: { missing: boolean; rows: Map<string, GarageRow> | null; gifts: RaceGift[] }) => {
    setMissing(r.missing)
    if (r.rows) setRows(r.rows)
    setGifts(r.gifts)
  }
  const load = useCallback(async () => { apply(await fetchAll()) }, [fetchAll])
  useEffect(() => {
    let active = true
    fetchAll().then(r => { if (active) apply(r) })
    return () => { active = false }
  }, [fetchAll])
  const put = (g: GarageRow) => setRows(prev => new Map(prev).set(g.member_id, g))

  const buy = useCallback(async (part: RacePart): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { data, error } = await createClient().rpc('race_buy', { p_member: myId, p_part: part })
    if (error) return garageErrorText(error.message)
    put(data as GarageRow)
    return null
  }, [myId])
  const set = useCallback(async (team: TeamKey | null, car: CarLook | null): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { data, error } = await createClient().rpc('race_set', { p_member: myId, p_team: team, p_equipped: car ? equipPayload(car) : null })
    if (error) return garageErrorText(error.message)
    put(data as GarageRow)
    return null
  }, [myId])
  // 레이스 끝 — 받은 코인 수(0이면 상한·미완주)
  const reward = useCallback(async (rid: string, rank: number, humans: number): Promise<number | null> => {
    if (!myId) return null
    const { data, error } = await createClient().rpc('race_reward', { p_member: myId, p_rid: rid, p_rank: rank, p_humans: humans })
    if (error) return null
    void load()
    return typeof data === 'number' ? data : null
  }, [myId, load])
  // 관리자 선물 — days 0 = 영구, 1 = 오늘만(1일권)
  const gift = useCallback(async (to: string, part: RacePart, team: TeamKey | null, days: 0 | 1, message: string): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { error } = await createClient().rpc('admin_race_gift', { p_admin: myId, p_member: to, p_part: part, p_team: team, p_days: days, p_message: message })
    if (error) return garageErrorText(error.message)
    await load()
    return null
  }, [myId, load])

  // ── 🪑 운전석 실내 ──
  const buyInterior = useCallback(async (slot: SlotKey, v: string, team: TeamKey | null): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { data, error } = await createClient().rpc('race_interior_buy', { p_member: myId, p_slot: slot, p_v: v, p_team: team })
    if (error) return interiorErrorText(error.message)
    put(data as GarageRow)
    return null
  }, [myId])
  // 뽑기 — 성공하면 { got: 'slot:v:team' }
  const drawInterior = useCallback(async (): Promise<{ err: string | null; got: string | null }> => {
    if (!myId) return { err: '로그인 계정과 팀원이 연결되지 않았어요', got: null }
    const { data, error } = await createClient().rpc('race_interior_draw', { p_member: myId })
    if (error) return { err: interiorErrorText(error.message), got: null }
    const d = data as { garage: GarageRow; got: string }
    put(d.garage)
    return { err: null, got: d.got }
  }, [myId])
  const setInterior = useCallback(async (eq: Equip): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { data, error } = await createClient().rpc('race_interior_set', { p_member: myId, p_interior: eq })
    if (error) return interiorErrorText(error.message)
    put(data as GarageRow)
    return null
  }, [myId])
  const giftInterior = useCallback(async (to: string, slot: SlotKey, v: string, team: TeamKey | null): Promise<string | null> => {
    if (!myId) return '로그인 계정과 팀원이 연결되지 않았어요'
    const { error } = await createClient().rpc('admin_race_interior_gift', { p_admin: myId, p_member: to, p_slot: slot, p_v: v, p_team: team })
    if (error) return interiorErrorText(error.message)
    await load()
    return null
  }, [myId, load])

  return { rows, gifts, mine: myId ? rows.get(myId) ?? null : null, missing, buy, set, reward, gift, reload: load, buyInterior, drawInterior, setInterior, giftInterior }
}
