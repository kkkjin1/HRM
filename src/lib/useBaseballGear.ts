'use client'

// 야구 꾸미기 데이터 훅 — 선물 상자·보유 장비·장착 상태·이번 달 물주기(크레딧). 팀원이 4명뿐이라 전부 불러온다.
// 쓰기는 전부 서버 함수(send/admin_send/open/equip)로만 한다 — 잔액 확인과 랜덤 뽑기를 클라이언트가 못 건드리게.
// baseball_gear는 realtime publication에 없어서, 상자가 열릴 때(gift_boxes UPDATE) 다시 불러온다.

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getServerOffset, kstDate } from '@/lib/serverClock'
import {
  BOX_COST, NO_EQUIP, gearErrorText,
  type Equip, type GearPart, type GiftBox, type OwnedGear, type TeamKey,
} from '@/lib/baseballGear'

type EquipRow = { member_id: string; cap: TeamKey | null; uniform: TeamKey | null; bat: TeamKey | null; bg_team: TeamKey | null }
type WaterRow = { member_id: string; watered_date: string }

function upsertBox(list: GiftBox[], b: GiftBox) {
  return list.some(x => x.id === b.id) ? list.map(x => (x.id === b.id ? b : x)) : [b, ...list]
}

export function useBaseballGear() {
  const [boxes, setBoxes] = useState<GiftBox[]>([])
  const [gear, setGear] = useState<OwnedGear[]>([])
  const [equipRows, setEquipRows] = useState<EquipRow[]>([])
  const [waterings, setWaterings] = useState<WaterRow[]>([])
  // 이번 달 'YYYY-MM' (서버 시각 KST) — 크레딧이 매달 리셋되는 기준
  const [month, setMonth] = useState(() => kstDate(Date.now()).slice(0, 7))
  const [loaded, setLoaded] = useState(false)
  const instanceId = useId()

  useEffect(() => {
    let active = true
    getServerOffset().then(off => { if (active) setMonth(kstDate(Date.now() + off).slice(0, 7)) })
    return () => { active = false }
  }, [])

  const loadGear = useCallback(async () => {
    const { data } = await createClient().from('baseball_gear').select('member_id, team, part, acquired_at').order('acquired_at')
    if (data) setGear(data as OwnedGear[])
  }, [])

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const [b, g, e, w] = await Promise.all([
        supabase.from('baseball_gift_boxes').select('*').order('created_at', { ascending: false }),
        supabase.from('baseball_gear').select('member_id, team, part, acquired_at').order('acquired_at'),
        supabase.from('baseball_equip').select('member_id, cap, uniform, bat, bg_team'),
        supabase.from('team_tree_waterings').select('member_id, watered_date').gte('watered_date', `${month}-01`),
      ])
      if (!active) return
      if (b.data) setBoxes(b.data as GiftBox[])
      if (g.data) setGear(g.data as OwnedGear[])
      if (e.data) setEquipRows(e.data as EquipRow[])
      if (w.data) setWaterings(w.data as WaterRow[])
      setLoaded(true)
    })()

    const channel = supabase
      .channel(`baseball-gear-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_gift_boxes' }, payload => {
        if (!active || payload.eventType === 'DELETE') return
        setBoxes(prev => upsertBox(prev, payload.new as GiftBox))
        if (payload.eventType === 'UPDATE') loadGear()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baseball_equip' }, payload => {
        if (!active || payload.eventType === 'DELETE') return
        const row = payload.new as EquipRow
        setEquipRows(prev => [...prev.filter(r => r.member_id !== row.member_id), row])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_tree_waterings' }, payload => {
        if (!active) return
        const row = payload.new as WaterRow
        setWaterings(prev => [...prev, { member_id: row.member_id, watered_date: row.watered_date }])
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [instanceId, loadGear, month])

  const equipMap = useMemo(
    () => new Map<string, Equip>(equipRows.map(r => [r.member_id, { cap: r.cap, uniform: r.uniform, bat: r.bat }])),
    [equipRows],
  )
  const equipOf = useCallback((memberId: string | null | undefined): Equip => (memberId ? equipMap.get(memberId) ?? NO_EQUIP : NO_EQUIP), [equipMap])
  const bgChoiceOf = useCallback(
    (memberId: string | null | undefined): TeamKey | null => equipRows.find(r => r.member_id === memberId)?.bg_team ?? null,
    [equipRows],
  )

  // 서버 baseball_credit_balance와 같은 식 — 화면 표시용(실제 차감 가능 여부는 서버가 다시 확인)
  const waterCountOf = useCallback(
    (memberId: string) => waterings.filter(w => w.member_id === memberId && w.watered_date.slice(0, 7) === month).length,
    [waterings, month],
  )
  const sentThisMonthOf = useCallback(
    (memberId: string) => boxes.filter(b => b.kind === 'credit' && b.sender_id === memberId && kstDate(Date.parse(b.created_at)).slice(0, 7) === month).length,
    [boxes, month],
  )
  const balanceOf = useCallback(
    (memberId: string) => waterCountOf(memberId) - sentThisMonthOf(memberId) * BOX_COST,
    [waterCountOf, sentThisMonthOf],
  )

  const sendBox = useCallback(async (sender: string, recipient: string, message: string): Promise<string | null> => {
    const { data, error } = await createClient().rpc('send_baseball_box', { p_sender: sender, p_recipient: recipient, p_message: message })
    if (error) return gearErrorText(error.message)
    setBoxes(prev => upsertBox(prev, data as GiftBox))
    return null
  }, [])

  const adminSendBox = useCallback(async (sender: string, recipient: string, team: TeamKey, part: GearPart, message: string): Promise<string | null> => {
    const { data, error } = await createClient().rpc('admin_send_baseball_box', {
      p_sender: sender, p_recipient: recipient, p_team: team, p_part: part, p_message: message,
    })
    if (error) return gearErrorText(error.message)
    setBoxes(prev => upsertBox(prev, data as GiftBox))
    return null
  }, [])

  const openBox = useCallback(async (boxId: string, member: string): Promise<{ box: GiftBox } | { error: string }> => {
    const { data, error } = await createClient().rpc('open_baseball_box', { p_box: boxId, p_member: member })
    if (error) return { error: gearErrorText(error.message) }
    const box = data as GiftBox
    setBoxes(prev => upsertBox(prev, box))
    await loadGear()
    return { box }
  }, [loadGear])

  const equip = useCallback(async (member: string, part: GearPart, team: TeamKey | null): Promise<string | null> => {
    const { data, error } = await createClient().rpc('equip_baseball_gear', { p_member: member, p_part: part, p_team: team })
    if (error) return gearErrorText(error.message)
    const row = data as EquipRow
    setEquipRows(prev => [...prev.filter(r => r.member_id !== row.member_id), row])
    return null
  }, [])

  const setBackground = useCallback(async (member: string, team: TeamKey | null): Promise<string | null> => {
    const { data, error } = await createClient().rpc('set_baseball_background', { p_member: member, p_team: team })
    if (error) return gearErrorText(error.message)
    const row = data as EquipRow
    setEquipRows(prev => [...prev.filter(r => r.member_id !== row.member_id), row])
    return null
  }, [])

  return { boxes, gear, loaded, month, equipOf, bgChoiceOf, setBackground, waterCountOf, sentThisMonthOf, balanceOf, sendBox, adminSendBox, openBox, equip }
}
