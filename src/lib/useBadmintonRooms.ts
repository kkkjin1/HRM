'use client'

// 🏸 배드민턴(중계 시점) 방 모집 — 운동장 채널의 'bm' 이벤트(드문 메시지만). 결재 포격전(useFortRooms)과 같은 흐름:
// 방장이 방을 열면(open, 5초마다 다시 알림) 운동장을 연 팀원에게 참가 카드 → join → 방장이 명단(roster) 방송
// → 방장 [시작] → start(자리·시드) → 모두 BadmintonArena로. 빈자리는 🤖 CPU.
// 경기 중 메시지(state·input·hit·quit)는 BadmintonArena가 전용 채널(bm-방id)로 주고받고,
// 전용 채널이 아직 안 붙은 사람이 운동장 채널 'bm'으로 보낸 경기 메시지는 arena listener로 넘긴다.

import { useCallback, useEffect, useRef, useState } from 'react'

export const BM_PROTO = 1
export type BmRoom = { bid: string; host: string; size: 1 | 2; seats: string[] } // seats = 모집 자리 순서(사람 id, '' = 빈자리·CPU)
export type BmOffer = { bid: string; host: string; size: 1 | 2; seen: number; count: number }
// players = 경기 자리 순서 [A0, (A1), B0, (B1)] — 사람 id 또는 null(CPU)
export type BmSession = { bid: string; hostId: string; size: 1 | 2; players: (string | null)[]; seed: number }
export type BmRoomMsg =
  | { type: 'open'; bid: string; host: string; size: 1 | 2; v: number; count: number }
  | { type: 'join'; bid: string; id: string; v: number }
  | { type: 'leave'; bid: string; id: string }
  | { type: 'roster'; bid: string; host: string; size: 1 | 2; seats: string[] }
  | { type: 'cancel'; bid: string }
  | { type: 'start'; bid: string; hostId: string; size: 1 | 2; players: (string | null)[]; seed: number }
  | { type: 'news'; text: string }
export type BmGameRelay = { type: 'game'; bid: string; payload: unknown }

export const bmSeatsOf = (size: 1 | 2) => size * 2
export const bmCount = (seats: string[]) => seats.filter(Boolean).length
const trim = (seats: string[]) => { const s = [...seats]; while (s.length && !s[s.length - 1]) s.pop(); return s }
const OPEN_EVERY_MS = 5000
const OFFER_TTL_MS = 12000

// 모집 자리 i(참가 순서) → 팀: 짝수 = A, 홀수 = B (A B A B). 경기 자리 index로 바꿔 둔다.
export const seatTeam = (i: number) => (i % 2 === 0 ? 'A' : 'B')
export function playersOf(size: 1 | 2, seats: string[]): (string | null)[] {
  const out: (string | null)[] = Array(size * 2).fill(null)
  for (let i = 0; i < size * 2; i++) {
    const k = Math.floor(i / 2)
    out[i % 2 === 0 ? k : size + k] = seats[i] ?? null
  }
  return out
}

export function useBadmintonRooms(opts: {
  myId: string | null
  send: (event: 'bm', msg: BmRoomMsg | BmGameRelay) => void
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
}) {
  const { myId } = opts
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })
  const [offers, setOffers] = useState<BmOffer[]>([])
  const [room, setRoom] = useState<BmRoom | null>(null)
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const [session, setSession] = useState<BmSession | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const arenaListener = useRef<((payload: unknown) => void) | null>(null)

  const send = (m: BmRoomMsg | BmGameRelay) => optsRef.current.send('bm', m)

  useEffect(() => {
    const t = setInterval(() => {
      const r = roomRef.current
      if (r && r.host === myId) send({ type: 'open', bid: r.bid, host: r.host, size: r.size, v: BM_PROTO, count: bmCount(r.seats) })
      setOffers(list => (list.some(o => Date.now() - o.seen > OFFER_TTL_MS) ? list.filter(o => Date.now() - o.seen <= OFFER_TTL_MS) : list))
    }, OPEN_EVERY_MS)
    return () => clearInterval(t)
    // send는 optsRef로 늘 최신
     
  }, [myId])

  const begin = useCallback((ses: BmSession) => {
    setRoom(null); roomRef.current = null
    setOffers(list => list.filter(o => o.bid !== ses.bid))
    setSession(ses); sessionRef.current = ses
  }, [])

  const roster = (r: BmRoom) => send({ type: 'roster', bid: r.bid, host: r.host, size: r.size, seats: r.seats })

  const onMsg = useCallback((m: BmRoomMsg | BmGameRelay) => {
    const me = optsRef.current.myId
    if (!me) return
    const r = roomRef.current
    switch (m.type) {
      case 'news': optsRef.current.toast(m.text); optsRef.current.addNews(m.text); return
      case 'game': {
        const ss = sessionRef.current
        if (ss && m.bid === ss.bid) arenaListener.current?.(m.payload)
        return
      }
      case 'open':
        if (m.host === me || m.v !== BM_PROTO) return
        setOffers(list => {
          const had = list.some(o => o.bid === m.bid)
          if (!had && !sessionRef.current && !roomRef.current) optsRef.current.toast(`🏸 ${optsRef.current.nickOf(m.host)}님이 배드민턴(${m.size === 1 ? '1:1' : '2:2'}) 방을 열었어요!`)
          return [...list.filter(o => o.bid !== m.bid), { bid: m.bid, host: m.host, size: m.size, seen: Date.now(), count: m.count }]
        })
        return
      case 'cancel':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (r && r.bid === m.bid && r.host !== me) { setRoom(null); optsRef.current.toast('🏸 방장이 방을 닫았어요') }
        return
      case 'join': {
        if (!r || r.bid !== m.bid || r.host !== me || m.v !== BM_PROTO) return
        if (r.seats.includes(m.id) || bmCount(r.seats) >= bmSeatsOf(r.size)) { roster(r); return }
        const hole = r.seats.indexOf('')
        const next = { ...r, seats: hole >= 0 ? r.seats.map((id, i) => (i === hole ? m.id : id)) : [...r.seats, m.id] }
        setRoom(next); roomRef.current = next
        roster(next)
        return
      }
      case 'leave': {
        if (!r || r.bid !== m.bid || r.host !== me) return
        const next = { ...r, seats: trim(r.seats.map(id => (id === m.id ? '' : id))) }
        setRoom(next); roomRef.current = next
        roster(next)
        return
      }
      case 'roster':
        setOffers(list => list.map(o => (o.bid === m.bid ? { ...o, count: bmCount(m.seats) } : o)))
        if (!r || r.bid !== m.bid || r.host === me) return
        if (!m.seats.includes(me)) { setRoom(null); optsRef.current.toast('🏸 방이 꽉 찼어요'); return }
        setRoom({ bid: m.bid, host: m.host, size: m.size, seats: m.seats })
        return
      case 'start':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        // 방장이 나(같은 계정의 다른 창)면 무시 — 그 창이 진행한다
        if (m.hostId !== me && m.players.includes(me) && !sessionRef.current) begin({ bid: m.bid, hostId: m.hostId, size: m.size, players: m.players, seed: m.seed })
        return
    }
    // send·roster는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin])

  const openRoom = useCallback((size: 1 | 2, solo: boolean) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const bid = `b-${me.slice(0, 6)}-${Date.now()}`
    if (solo) { begin({ bid, hostId: me, size, players: playersOf(size, [me]), seed: Math.floor(Math.random() * 1e6) }); return }
    const r: BmRoom = { bid, host: me, size, seats: [me] }
    setRoom(r); roomRef.current = r
    send({ type: 'open', bid, host: me, size, v: BM_PROTO, count: 1 })
     
  }, [begin])

  const join = useCallback((o: BmOffer) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const r: BmRoom = { bid: o.bid, host: o.host, size: o.size, seats: [] }
    setRoom(r); roomRef.current = r
    send({ type: 'join', bid: o.bid, id: me, v: BM_PROTO })
    setTimeout(() => {
      const cur = roomRef.current
      if (cur && cur.bid === o.bid && !cur.seats.includes(me)) { setRoom(null); optsRef.current.toast('🏸 방장이 응답하지 않아요') }
    }, 6000)
     
  }, [])

  const leave = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || !me) return
    if (r.host === me) send({ type: 'cancel', bid: r.bid })
    else send({ type: 'leave', bid: r.bid, id: me })
    setRoom(null); roomRef.current = null
     
  }, [])

  // 방장: 이름을 누르면 옆 자리(상대 팀)와 맞바꿈 — 빈자리(CPU)와도 바꿀 수 있게 seats 길이를 늘려 둔다
  const swapSeats = useCallback((i: number, j: number) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const n = bmSeatsOf(r.size)
    const full: (string | null)[] = Array.from({ length: n }, (_, k) => r.seats[k] ?? null)
    ;[full[i], full[j]] = [full[j], full[i]]
    const seats = trim(full.map(id => id ?? ''))
    const next = { ...r, seats }
    setRoom(next); roomRef.current = next
    roster(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || r.host !== me) return
    const players = playersOf(r.size, r.seats).map(id => id || null)
    const seed = Math.floor(Math.random() * 1e6)
    send({ type: 'start', bid: r.bid, hostId: me, size: r.size, players, seed })
    begin({ bid: r.bid, hostId: me, size: r.size, players, seed })
     
  }, [begin])

  const endSession = useCallback(() => { setSession(null); sessionRef.current = null }, [])
  const dismissOffer = useCallback((bid: string) => setOffers(list => list.filter(o => o.bid !== bid)), [])
  const setArenaListener = useCallback((fn: ((payload: unknown) => void) | null) => { arenaListener.current = fn }, [])
  return { offers, room, session, onMsg, openRoom, join, leave, start, swapSeats, endSession, dismissOffer, setArenaListener }
}
