'use client'

// 💣 폭탄 놀이터 옷장 — 모습·🪙코인·산 부품·누적 기록(업적). DB: supabase/add_bomb_closet.sql (2026-11-10 실행됨)
// 가격·무료 부품·업적 조건·보상은 SQL(bomb_part_price · bomb_has · bomb_reward)과 같아야 한다 — 바꾸면 양쪽 같이.
// 쓰기는 전부 DB 함수(로그인 계정으로 본인 확인). 이 파일은 화면에 보여줄 값만 계산한다.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CritterLook } from '@/components/playground/bomb/Critter'
import { loadLook, sanitizeLook } from './bombLook'

export const PART_PRICE: Record<string, number> = {
  beanie: 10, flower: 10, cap: 15, sprout: 15, party: 20, chick: 30,
  freckles: 8, mustache: 12, sunglasses: 20,
  bowtie: 10, stripe: 12, sweater: 15, overalls: 20, raincoat: 25,
  backpack: 15, balloon: 20, cape: 30,
}
export const FREE_PARTS = ['none', 'strawberry', 'ribbon', 'glasses', 'heartBlush', 'scarf']
export type Stat = 'wins' | 'rescues' | 'pops' | 'hits'
export const ACH_PARTS: Record<string, { stat: Stat; need: number; label: string; short: string }> = {
  star: { stat: 'wins', need: 1, label: '첫 승', short: '승리' },
  crown: { stat: 'wins', need: 10, label: '10승', short: '승리' },
  wings: { stat: 'rescues', need: 20, label: '구출 20번', short: '구출' },
  batWings: { stat: 'pops', need: 15, label: '상대 유령 터뜨리기 15번', short: '터뜨림' },
  bandage: { stat: 'hits', need: 30, label: '맞기 30번 (위로상)', short: '맞기' },
}
export const BOMB_REWARD_TEXT = '보상: 사람끼리 승 5·패 2 / CPU전 승 2·패 1 / 연습판 1 · 구출 1번당 +1(한 판 3까지) · 하루 30, 혼자 하는 판은 6까지'

export interface ClosetRow {
  member_id: string
  look: unknown
  coins: number
  owned: string[]
  games: number
  wins: number
  rescues: number
  pops: number
  hits: number
}

export type PartState =
  | { kind: 'have' }
  | { kind: 'shop'; price: number }
  | { kind: 'ach'; label: string; short: string; cur: number; need: number }

export function partState(row: ClosetRow | null, part: string): PartState {
  if (FREE_PARTS.includes(part)) return { kind: 'have' }
  const a = ACH_PARTS[part]
  if (a) {
    const cur = row ? row[a.stat] : 0
    return cur >= a.need ? { kind: 'have' } : { kind: 'ach', label: a.label, short: a.short, cur, need: a.need }
  }
  if (row?.owned?.includes(part)) return { kind: 'have' }
  return { kind: 'shop', price: PART_PRICE[part] ?? 0 }
}

export const PART_NAME_KO = (part: string, lists: [string, string][][]) => lists.flat().find(([k]) => k === part)?.[1] ?? part

function errText(e: { message?: string } | null): string {
  const m = e?.message ?? ''
  if (m.includes('NOT_ENOUGH_COINS')) return '코인이 모자라요'
  if (m.includes('ALREADY_OWNED')) return '이미 가진 부품이에요'
  if (m.includes('NOT_FOR_SALE')) return '상점에서 파는 부품이 아니에요'
  if (m.includes('SELF_GIFT')) return '나에게는 선물할 수 없어요'
  if (m.includes('NOT_MEMBER')) return '로그인 계정과 팀원이 연결되지 않았어요'
  if (m.includes('bomb_')) return '옷장 저장소가 준비되지 않았어요'
  return '저장하지 못했어요 · 다시 시도해 주세요'
}

export type BombGift = { id: string; from_id: string; to_id: string; part: string; message: string | null; created_at: string; seen_at: string | null }

export function useBombCloset(myId: string | null) {
  const [mine, setMine] = useState<ClosetRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false) // 표가 없거나 함수 실패 — 이 브라우저 저장으로 대신
  const [newGifts, setNewGifts] = useState<BombGift[]>([])

  const reload = useCallback(async () => {
    if (!myId) return
    const supabase = createClient()
    // 처음이면 줄을 만들고, DB에 모습이 없으면 이 브라우저에 있던 모습을 옮긴다
    const { data, error } = await supabase.rpc('bomb_init', { p_look: loadLook(myId) })
    if (error || !data) {
      setMissing(true)
      setLoaded(true)
      return
    }
    setMissing(false)
    setMine(data as ClosetRow)
    setLoaded(true)
    const g = await supabase.from('bomb_gifts').select('*').eq('to_id', myId).is('seen_at', null).order('created_at')
    if (!g.error && g.data?.length) setNewGifts(g.data as BombGift[])
  }, [myId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 옷장은 DB에서 받아 와야 한다(받은 뒤 setState)
  useEffect(() => { void reload() }, [reload])

  const look: CritterLook | null = mine ? sanitizeLook(mine.look) : missing && myId ? loadLook(myId) : null

  const setLook = useCallback(async (l: CritterLook): Promise<string | null> => {
    const { data, error } = await createClient().rpc('bomb_set_look', { p_look: l })
    if (error) return errText(error)
    setMine(data as ClosetRow)
    return null
  }, [])

  const buy = useCallback(async (part: string): Promise<string | null> => {
    const { data, error } = await createClient().rpc('bomb_buy', { p_part: part })
    if (error) return errText(error)
    setMine(data as ClosetRow)
    return null
  }, [])

  const gift = useCallback(async (to: string, part: string, message: string): Promise<string | null> => {
    const { data, error } = await createClient().rpc('bomb_gift', { p_to: to, p_part: part, p_message: message })
    if (error) return errText(error)
    setMine(data as ClosetRow)
    return null
  }, [])

  // 판이 끝난 뒤 보상. 반환: 받은 코인 · 새로 풀린 업적 부품 (실패하면 null)
  const reward = useCallback(async (gid: string, kind: 'vs' | 'cpu' | 'practice', result: 'win' | 'lose' | 'draw' | 'clear', stats: { rescues: number; pops: number; hits: number }) => {
    const { data, error } = await createClient().rpc('bomb_reward', {
      p_gid: gid, p_kind: kind, p_result: result === 'clear' ? 'win' : result, p_rescues: stats.rescues, p_pops: stats.pops, p_hits: stats.hits,
    })
    if (error || !data) return null
    const d = data as { coins: number; unlocked: string[]; closet: ClosetRow; dup?: boolean }
    setMine(d.closet)
    return { coins: d.coins, unlocked: d.unlocked ?? [] }
  }, [])

  const markGiftsSeen = useCallback(async () => {
    await createClient().rpc('bomb_gifts_seen')
    setNewGifts([])
  }, [])

  return { mine, look, loaded, missing, newGifts, reload, setLook, buy, gift, reward, markGiftsSeen }
}
