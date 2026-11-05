'use client'

// 💥 결재 포격전 방 모집 — 운동장 채널의 'fort' 이벤트(드문 메시지만).
// 방장이 방을 열면(open, 5초마다 다시 알림) 운동장을 연 팀원에게 참가 카드가 뜬다 → join → 방장이 명단(roster) 방송
// → 방장이 [시작] → start(첫 상태 포함) → 모두 FortArena로. 빈자리는 🤖 CPU. 게임 중 메시지는 FortArena가 전용 채널로.
// 'fort' 이벤트로 온 게임 메시지(전용 채널이 안 붙은 사람 것)는 arena 쪽 listener로 넘긴다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getServerOffset } from '@/lib/serverClock'
import { FORT_PROTO, THEME_ORDER, newFortState, type FortMode, type FortState, type FortTheme, type RosterEntry, type SkinKey, type SpecialKey } from '@/lib/fort'
import type { FortGameMsg } from '@/components/playground/FortArena'

export type FortSeat = { id: string; skin: SkinKey; special: SpecialKey | null }
export type ThemePick = FortTheme | 'random'
export type FortRoom = { fid: string; host: string; mode: FortMode; theme: ThemePick; seats: FortSeat[] }
export type FortSession = { fid: string; hostId: string; initial: FortState; offset: number; humans: number }
export type FortOffer = { fid: string; host: string; mode: FortMode; theme: ThemePick; seen: number; count: number }
export type FortRoomMsg =
  | { type: 'open'; fid: string; host: string; mode: FortMode; theme: ThemePick; v: number; count: number }
  | { type: 'join'; fid: string; id: string; skin: SkinKey; special: SpecialKey | null; v: number }
  | { type: 'leave'; fid: string; id: string }
  | { type: 'roster'; fid: string; host: string; mode: FortMode; theme: ThemePick; seats: FortSeat[] }
  | { type: 'cancel'; fid: string }
  | { type: 'start'; fid: string; hostId: string; state: FortState }
  | { type: 'news'; text: string }

export const seatsOf = (mode: FortMode) => (mode === '1v1' ? 2 : 4)
export const isCpuId = (id: string) => id.startsWith('cpu-')
const OPEN_EVERY_MS = 5000
const OFFER_TTL_MS = 12000

export const pickTheme = (t: ThemePick, seed: number): FortTheme => (t === 'random' ? THEME_ORDER[seed % THEME_ORDER.length] : t)

// 자리 순서대로 A B A B — CPU로 채움(CPU는 필살기 없음 — 필살기는 사람마다 고유)
export function rosterOf(mode: FortMode, seats: FortSeat[]) {
  const n = seatsOf(mode)
  const list: RosterEntry[] = []
  for (let i = 0; i < n; i++) {
    const s = seats[i]
    const cpuSkins: SkinKey[] = ['cabinet', 'copier', 'server', 'water']
    list.push(s ? { id: s.id, team: i % 2 === 0 ? 'A' : 'B', cpu: false, skin: s.skin, special: s.special } : { id: `cpu-${i}`, team: i % 2 === 0 ? 'A' : 'B', cpu: true, skin: cpuSkins[i % cpuSkins.length], special: null })
  }
  return list
}

export function useFortRooms(opts: {
  myId: string | null
  mySkin: SkinKey
  mySpecial: SpecialKey | null // 고유 필살기(없으면 null)
  send: (event: 'fort', msg: FortRoomMsg | FortGameMsg) => void
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
}) {
  const { myId } = opts
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })
  const [offers, setOffers] = useState<FortOffer[]>([])
  const [room, setRoom] = useState<FortRoom | null>(null)
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const [session, setSession] = useState<FortSession | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const arenaListener = useRef<((m: FortGameMsg) => void) | null>(null)

  const send = (m: FortRoomMsg | FortGameMsg) => optsRef.current.send('fort', m)

  // 방장: 방이 열려 있는 동안 5초마다 다시 알림(늦게 운동장을 연 사람도 보이게) + 오래된 참가 카드 정리
  useEffect(() => {
    const t = setInterval(() => {
      const r = roomRef.current
      if (r && r.host === myId) send({ type: 'open', fid: r.fid, host: r.host, mode: r.mode, theme: r.theme, v: FORT_PROTO, count: r.seats.length })
      setOffers(list => (list.some(o => Date.now() - o.seen > OFFER_TTL_MS) ? list.filter(o => Date.now() - o.seen <= OFFER_TTL_MS) : list))
    }, OPEN_EVERY_MS)
    return () => clearInterval(t)
     
  }, [myId])

  const begin = useCallback((fid: string, hostId: string, state: FortState) => {
    void getServerOffset().then(off => {
      setRoom(null)
      setOffers(list => list.filter(o => o.fid !== fid))
      setSession({ fid, hostId, initial: state, offset: off, humans: state.players.filter(p => !p.cpu).length })
    })
  }, [])

  const onMsg = useCallback((m: FortRoomMsg | FortGameMsg) => {
    const me = optsRef.current.myId
    if (!me) return
    const r = roomRef.current
    switch (m.type) {
      case 'news': optsRef.current.toast(m.text); optsRef.current.addNews(m.text); return
      case 'open':
        if (m.host === me) return
        if (m.v !== FORT_PROTO) return
        setOffers(list => {
          const had = list.some(o => o.fid === m.fid)
          if (!had && !sessionRef.current && !roomRef.current) optsRef.current.toast(`💥 ${optsRef.current.nickOf(m.host)}님이 결재 포격전(${m.mode === '1v1' ? '1:1' : '2:2'}) 방을 열었어요!`)
          return [...list.filter(o => o.fid !== m.fid), { fid: m.fid, host: m.host, mode: m.mode, theme: m.theme, seen: Date.now(), count: m.count }]
        })
        return
      case 'cancel':
        setOffers(list => list.filter(o => o.fid !== m.fid))
        if (r && r.fid === m.fid && r.host !== me) { setRoom(null); optsRef.current.toast('💥 방장이 방을 닫았어요') }
        return
      case 'join': {
        if (!r || r.fid !== m.fid || r.host !== me) return
        if (m.v !== FORT_PROTO) return
        if (r.seats.some(s => s.id === m.id) || r.seats.length >= seatsOf(r.mode)) { send({ type: 'roster', fid: r.fid, host: r.host, mode: r.mode, theme: r.theme, seats: r.seats }); return }
        const next = { ...r, seats: [...r.seats, { id: m.id, skin: m.skin, special: m.special ?? null }] }
        setRoom(next); roomRef.current = next
        send({ type: 'roster', fid: r.fid, host: r.host, mode: r.mode, theme: r.theme, seats: next.seats })
        return
      }
      case 'leave': {
        if (!r || r.fid !== m.fid || r.host !== me) return
        const next = { ...r, seats: r.seats.filter(s => s.id !== m.id) }
        setRoom(next); roomRef.current = next
        send({ type: 'roster', fid: r.fid, host: r.host, mode: r.mode, theme: r.theme, seats: next.seats })
        return
      }
      case 'roster':
        setOffers(list => list.map(o => (o.fid === m.fid ? { ...o, count: m.seats.length } : o)))
        if (!r || r.fid !== m.fid || r.host === me) return
        if (!m.seats.some(s => s.id === me)) { setRoom(null); optsRef.current.toast('💥 방이 꽉 찼어요'); return }
        setRoom({ fid: m.fid, host: m.host, mode: m.mode, theme: m.theme, seats: m.seats })
        return
      case 'start':
        setOffers(list => list.filter(o => o.fid !== m.fid))
        if (m.state.players.some(p => p.id === me) && !sessionRef.current) begin(m.fid, m.hostId, m.state)
        return
      default: {
        // 게임 메시지(전용 채널이 안 붙은 사람이 운동장 채널로 보낸 것)
        const ss = sessionRef.current
        if (ss && 'fid' in m && m.fid === ss.fid) arenaListener.current?.(m as FortGameMsg)
      }
    }
  }, [begin])

  const openRoom = useCallback((mode: FortMode, solo: boolean, theme: ThemePick = 'random') => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    void getServerOffset().then(off => {
      const fid = `f-${me.slice(0, 6)}-${Date.now() + off}`
      const seats = [{ id: me, skin: optsRef.current.mySkin, special: optsRef.current.mySpecial }]
      if (solo) {
        const seed = Math.floor(Math.random() * 1e9)
        const state = newFortState(seed, mode, rosterOf(mode, seats), Date.now() + off, pickTheme(theme, seed))
        setSession({ fid, hostId: me, initial: state, offset: off, humans: 1 })
        return
      }
      const r: FortRoom = { fid, host: me, mode, theme, seats }
      setRoom(r); roomRef.current = r
      send({ type: 'open', fid, host: me, mode, theme, v: FORT_PROTO, count: 1 })
    })
     
  }, [])

  const join = useCallback((o: FortOffer) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const r: FortRoom = { fid: o.fid, host: o.host, mode: o.mode, theme: o.theme, seats: [] }
    setRoom(r); roomRef.current = r
    send({ type: 'join', fid: o.fid, id: me, skin: optsRef.current.mySkin, special: optsRef.current.mySpecial, v: FORT_PROTO })
    // 방장 응답(roster)이 없으면 정리
    setTimeout(() => {
      const cur = roomRef.current
      if (cur && cur.fid === o.fid && !cur.seats.some(s => s.id === me)) { setRoom(null); optsRef.current.toast('💥 방장이 응답하지 않아요') }
    }, 6000)
     
  }, [])

  const leave = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || !me) return
    if (r.host === me) send({ type: 'cancel', fid: r.fid })
    else send({ type: 'leave', fid: r.fid, id: me })
    setRoom(null); roomRef.current = null
     
  }, [])

  // 방장: 자리 순서 바꾸기(팀 바꾸기) — 사람 둘의 자리를 맞바꿈
  const swapSeats = useCallback((i: number, j: number) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const seats = [...r.seats]
    if (!seats[i] || !seats[j]) return
    ;[seats[i], seats[j]] = [seats[j], seats[i]]
    const next = { ...r, seats }
    setRoom(next); roomRef.current = next
    send({ type: 'roster', fid: r.fid, host: r.host, mode: r.mode, theme: r.theme, seats })
     
  }, [])

  const start = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || r.host !== me) return
    void getServerOffset().then(off => {
      const seats = r.seats.map(s => (s.id === me ? { ...s, skin: optsRef.current.mySkin, special: optsRef.current.mySpecial } : s))
      const seed = Math.floor(Math.random() * 1e9)
      const state = newFortState(seed, r.mode, rosterOf(r.mode, seats), Date.now() + off, pickTheme(r.theme, seed))
      send({ type: 'start', fid: r.fid, hostId: me, state })
      begin(r.fid, me, state)
    })
     
  }, [begin])

  const endSession = useCallback(() => setSession(null), [])
  const dismissOffer = useCallback((fid: string) => setOffers(list => list.filter(o => o.fid !== fid)), [])

  const setArenaListener = useCallback((fn: ((m: FortGameMsg) => void) | null) => { arenaListener.current = fn }, [])
  return { offers, room, session, onMsg, openRoom, join, leave, start, swapSeats, endSession, dismissOffer, setArenaListener }
}
