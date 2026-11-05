'use client'

// 💥 결재 포격전 — 내 요새 꾸미기(skin)와 전적(판·승·패). supabase/add_fort.sql(fort_profile·fort_games·fort_record·fort_set_skin).
// SQL 실행 전(테이블 없음)엔 missing = true — 꾸미기는 이 브라우저에만 기억하고 전적은 쌓이지 않는다.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SKIN_ORDER, skinUnlocked, type SkinKey } from '@/lib/fort'

export type FortProfile = { member_id: string; skin: SkinKey; games: number; wins: number; losses: number }
const LOCAL_SKIN = 'hrm_fort_skin'

export function useFortProfile(myId: string | null) {
  const [rows, setRows] = useState<Map<string, FortProfile>>(new Map())
  const [missing, setMissing] = useState(false)
  const [localSkin, setLocalSkin] = useState<SkinKey>(() => {
    try {
      const s = typeof window === 'undefined' ? null : (localStorage.getItem(LOCAL_SKIN) as SkinKey | null)
      return s && SKIN_ORDER.includes(s) ? s : 'desk'
    } catch { return 'desk' }
  })

  const fetchAll = useCallback(async () => {
    const { data, error } = await createClient().from('fort_profile').select('member_id, skin, games, wins, losses')
    if (error) return { missing: error.code === '42P01' || error.code === 'PGRST205', rows: null }
    return { missing: false, rows: new Map((data as FortProfile[]).map(r => [r.member_id, r])) }
  }, [])
  const apply = (r: { missing: boolean; rows: Map<string, FortProfile> | null }) => {
    setMissing(r.missing)
    if (r.rows) setRows(r.rows)
  }
  const reload = useCallback(async () => { apply(await fetchAll()) }, [fetchAll])
  useEffect(() => {
    let active = true
    fetchAll().then(r => { if (active) apply(r) })
    return () => { active = false }
  }, [fetchAll])

  const mine = myId ? rows.get(myId) ?? null : null
  const mySkin: SkinKey = mine && !missing ? mine.skin : localSkin

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

  return { rows, mine, mySkin, missing, reload, setSkin, record }
}
