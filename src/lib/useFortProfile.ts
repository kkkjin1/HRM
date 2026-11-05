'use client'

// 💥 결재 포격전 — 내 요새 꾸미기(skin)·전적(판·승·패)·고유 필살기.
// supabase/add_fort.sql(fort_profile·fort_games·fort_record·fort_set_skin), add_fort_unique_special.sql(fort_specials·fort_draw_special).
// SQL 실행 전(테이블 없음)엔 missing = true — 꾸미기는 이 브라우저에만 기억하고 전적은 쌓이지 않는다.
// 필살기: SPECIAL_ORDER(7종)가 각각 한 사람에게만 귀속. 🎁 상자(drawSpecial)를 열면 남은 것 중 랜덤 1개가 영구히 내 것(서버가 고름·중복 불가).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SKIN_ORDER, SPECIAL_ORDER, skinUnlocked, type SkinKey, type SpecialKey } from '@/lib/fort'

export type FortProfile = { member_id: string; skin: SkinKey; games: number; wins: number; losses: number }
const LOCAL_SKIN = 'hrm_fort_skin'
type Loaded = { missing: boolean; rows: Map<string, FortProfile> | null; specials: Map<SpecialKey, string> | null; specialMissing: boolean }

export function useFortProfile(myId: string | null) {
  const [rows, setRows] = useState<Map<string, FortProfile>>(new Map())
  const [missing, setMissing] = useState(false)
  const [specials, setSpecials] = useState<Map<SpecialKey, string>>(new Map()) // 필살기 → 주인 member_id
  const [specialMissing, setSpecialMissing] = useState(false)
  const [localSkin, setLocalSkin] = useState<SkinKey>(() => {
    try {
      const s = typeof window === 'undefined' ? null : (localStorage.getItem(LOCAL_SKIN) as SkinKey | null)
      return s && SKIN_ORDER.includes(s) ? s : 'desk'
    } catch { return 'desk' }
  })

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const sb = createClient()
    const [p, sp] = await Promise.all([
      sb.from('fort_profile').select('member_id, skin, games, wins, losses'),
      sb.from('fort_specials').select('special, member_id'),
    ])
    const gone = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205')
    return {
      missing: gone(p.error),
      rows: p.error ? null : new Map((p.data as FortProfile[]).map(r => [r.member_id, r])),
      specialMissing: gone(sp.error),
      specials: sp.error ? null : new Map((sp.data as { special: SpecialKey; member_id: string }[]).filter(r => SPECIAL_ORDER.includes(r.special)).map(r => [r.special, r.member_id])),
    }
  }, [])
  const apply = (r: Loaded) => {
    setMissing(r.missing)
    setSpecialMissing(r.specialMissing)
    if (r.rows) setRows(r.rows)
    if (r.specials) setSpecials(r.specials)
  }
  const reload = useCallback(async () => { apply(await fetchAll()) }, [fetchAll])
  useEffect(() => {
    let active = true
    fetchAll().then(r => { if (active) apply(r) })
    return () => { active = false }
  }, [fetchAll])

  const mine = myId ? rows.get(myId) ?? null : null
  const mySkin: SkinKey = mine && !missing ? mine.skin : localSkin
  const mySpecial: SpecialKey | null = myId ? ([...specials].find(([, m]) => m === myId)?.[0] ?? null) : null
  const specialsLeft = SPECIAL_ORDER.filter(k => !specials.has(k)).length

  // 🎁 필살기 상자 — 이미 있으면 그걸 돌려준다(서버에서도 한 사람 1개·한 종류 1명)
  const drawSpecial = useCallback(async (): Promise<{ special: SpecialKey | null; error: string | null }> => {
    if (!myId) return { special: null, error: '로그인이 필요해요' }
    if (specialMissing) return { special: null, error: '필살기 표(add_fort_unique_special.sql)가 아직 없어요' }
    const { data, error } = await createClient().rpc('fort_draw_special', { p_member: myId })
    if (error) return { special: null, error: error.message.includes('NO_SPECIAL_LEFT') ? `남은 필살기가 없어요 — ${SPECIAL_ORDER.length}개 모두 주인이 있어요` : '상자를 열지 못했어요' }
    await reload()
    return { special: data as SpecialKey, error: null }
  }, [myId, specialMissing, reload])

  const setSkin = useCallback(async (skin: SkinKey): Promise<string | null> => {
    if (!myId) return '로그인이 필요해요'
    if (!skinUnlocked(skin, mine)) return '아직 잠겨 있어요'
    try { localStorage.setItem(LOCAL_SKIN, skin) } catch { /* 저장 못 해도 그만 */ }
    setLocalSkin(skin)
    if (missing) return null
    const { data, error } = await createClient().rpc('fort_set_skin', { p_member: myId, p_skin: skin })
    if (error) return error.message.includes('LOCKED') ? '아직 잠겨 있어요' : '저장하지 못했어요'
    setRows(prev => new Map(prev).set(myId, data as FortProfile))
    return null
  }, [myId, mine, missing])

  const record = useCallback(async (fid: string, result: 'win' | 'lose' | 'draw', humans: number, mode: string) => {
    if (!myId || missing) return
    const { data, error } = await createClient().rpc('fort_record', { p_member: myId, p_fid: fid, p_result: result, p_humans: humans, p_mode: mode })
    if (!error && data) setRows(prev => new Map(prev).set(myId, data as FortProfile))
  }, [myId, missing])

  return { rows, mine, mySkin, mySpecial, specials, specialsLeft, missing, specialMissing, reload, setSkin, drawSpecial, record }
}
