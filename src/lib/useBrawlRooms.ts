'use client'

// 🥊 격투기 방 모집 — 운동장 채널의 'bw' 이벤트(드문 메시지만). 축구(useSoccerRooms)와 같은 흐름:
// 방장이 방을 열면(open, 5초마다 다시 알림) 운동장을 연 팀원에게 참가 카드 → join → 방장이 명단(roster) 방송
// → 방장 [시작] → start(자리·시드·시작 시각·맵·목숨) → 모두 BrawlGame으로. 빈자리는 🤖 CPU. 개인전 최대 5명.

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAP_ORDER, MAX_FIGHTERS, type BrawlMapKey } from './brawl'
import type { BrawlWire } from './brawlNet'

export const BW_PROTO = 1
const START_DELAY_MS = 3500
const OPEN_EVERY_MS = 5000
const OFFER_TTL_MS = 12000
export type BwMapPick = BrawlMapKey | 'random'
export type BwRoom = { bid: string; host: string; cap: number; seats: string[]; map: BwMapPick; lives: number }
export type BwOffer = { bid: string; host: string; cap: number; seen: number; count: number }
// players = 경기 자리(0..cap-1) — 사람 id 또는 null(CPU)
export type BwSession = { bid: string; hostId: string; players: (string | null)[]; seed: number; startAt: number; map: BrawlMapKey; lives: number }
export type BwRoomMsg =
  | { type: 'open'; bid: string; host: string; cap: number; v: number; count: number }
  | { type: 'join'; bid: string; id: string; v: number }
  | { type: 'leave'; bid: string; id: string }
  | { type: 'roster'; bid: string; host: string; cap: number; seats: string[]; map: BwMapPick; lives: number }
  | { type: 'cancel'; bid: string }
  | { type: 'start'; bid: string; hostId: string; players: (string | null)[]; seed: number; startAt: number; map: BrawlMapKey; lives: number }
  | { type: 'news'; text: string }
export type BwGameRelay = { type: 'game'; bid: string; payload: BrawlWire }

export const okCap = (n: unknown) => (typeof n === 'number' && n >= 2 && n <= MAX_FIGHTERS ? Math.round(n) : 4)
const okMap = (m: unknown): BwMapPick => (m === 'random' || MAP_ORDER.includes(m as BrawlMapKey) ? (m as BwMapPick) : 'random')
const okMapKey = (m: unknown): BrawlMapKey => (MAP_ORDER.includes(m as BrawlMapKey) ? (m as BrawlMapKey) : 'peak')
const okLives = (n: unknown) => (n === 1 || n === 3 || n === 5 ? n : 3)
export const bwCount = (seats: string[]) => seats.filter(Boolean).length
const trim = (seats: string[]) => { const s = [...seats]; while (s.length && !s[s.length - 1]) s.pop(); return s }
export const pickMap = (m: BwMapPick, seed: number): BrawlMapKey => (m === 'random' ? MAP_ORDER[seed % MAP_ORDER.length] : m)
export function bwPlayersOf(cap: number, seats: string[]): (string | null)[] {
  return Array.from({ length: cap }, (_, i) => seats[i] || null)
}

export function useBrawlRooms(opts: {
  myId: string | null
  send: (event: 'bw', msg: BwRoomMsg | BwGameRelay) => void
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
  serverNow: () => number
}) {
  const { myId } = opts
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })
  const [offers, setOffers] = useState<BwOffer[]>([])
  const [room, setRoom] = useState<BwRoom | null>(null)
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const [session, setSession] = useState<BwSession | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const relayListener = useRef<((m: BrawlWire) => void) | null>(null)

  const send = (m: BwRoomMsg | BwGameRelay) => optsRef.current.send('bw', m)

  useEffect(() => {
    const t = setInterval(() => {
      const r = roomRef.current
      if (r && r.host === myId) send({ type: 'open', bid: r.bid, host: r.host, cap: r.cap, v: BW_PROTO, count: bwCount(r.seats) })
      setOffers(list => (list.some(o => Date.now() - o.seen > OFFER_TTL_MS) ? list.filter(o => Date.now() - o.seen <= OFFER_TTL_MS) : list))
    }, OPEN_EVERY_MS)
    return () => clearInterval(t)
    // send는 optsRef로 늘 최신
  }, [myId])

  const begin = useCallback((ses: BwSession) => {
    setRoom(null); roomRef.current = null
    setOffers(list => list.filter(o => o.bid !== ses.bid))
    setSession(ses); sessionRef.current = ses
  }, [])

  const roster = (r: BwRoom) => send({ type: 'roster', bid: r.bid, host: r.host, cap: r.cap, seats: r.seats, map: r.map, lives: r.lives })

  const onMsg = useCallback((m: BwRoomMsg | BwGameRelay) => {
    const me = optsRef.current.myId
    if (!me) return
    const r = roomRef.current
    switch (m.type) {
      case 'news': optsRef.current.toast(m.text); optsRef.current.addNews(m.text); return
      case 'game': {
        const ss = sessionRef.current
        if (ss && m.bid === ss.bid) relayListener.current?.(m.payload)
        return
      }
      case 'open':
        if (m.host === me || m.v !== BW_PROTO) return
        setOffers(list => {
          const had = list.some(o => o.bid === m.bid)
          if (!had && !sessionRef.current && !roomRef.current) optsRef.current.toast(`🥊 ${optsRef.current.nickOf(m.host)}님이 격투기 방(최대 ${okCap(m.cap)}명)을 열었어요!`)
          return [...list.filter(o => o.bid !== m.bid), { bid: m.bid, host: m.host, cap: okCap(m.cap), seen: Date.now(), count: m.count }]
        })
        return
      case 'cancel':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (r && r.bid === m.bid && r.host !== me) { setRoom(null); optsRef.current.toast('🥊 방장이 방을 닫았어요') }
        return
      case 'join': {
        if (!r || r.bid !== m.bid || r.host !== me || m.v !== BW_PROTO) return
        if (r.seats.includes(m.id) || bwCount(r.seats) >= r.cap) { roster(r); return }
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
        setOffers(list => list.map(o => (o.bid === m.bid ? { ...o, count: bwCount(m.seats), cap: okCap(m.cap) } : o)))
        if (!r || r.bid !== m.bid || r.host === me) return
        if (!m.seats.includes(me)) { setRoom(null); optsRef.current.toast('🥊 방이 꽉 찼어요'); return }
        setRoom({ bid: m.bid, host: m.host, cap: okCap(m.cap), seats: m.seats, map: okMap(m.map), lives: okLives(m.lives) })
        return
      case 'start':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (m.hostId !== me && m.players.includes(me) && !sessionRef.current) {
          begin({ bid: m.bid, hostId: m.hostId, players: m.players.slice(0, MAX_FIGHTERS), seed: m.seed, startAt: m.startAt, map: okMapKey(m.map), lives: okLives(m.lives) })
        }
        return
    }
    // roster·send는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin])

  const openRoom = useCallback((cap: number, solo: boolean, map: BwMapPick, lives: number) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const bid = `bw-${me.slice(0, 6)}-${Date.now()}`
    const c = okCap(cap)
    if (solo) {
      const seed = Math.floor(Math.random() * 1e9)
      begin({ bid, hostId: me, players: bwPlayersOf(c, [me]), seed, startAt: optsRef.current.serverNow() + 2500, map: pickMap(map, seed), lives: okLives(lives) })
      return
    }
    const r: BwRoom = { bid, host: me, cap: c, seats: [me], map, lives: okLives(lives) }
    setRoom(r); roomRef.current = r
    send({ type: 'open', bid, host: me, cap: c, v: BW_PROTO, count: 1 })
  }, [begin])

  const join = useCallback((o: BwOffer) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const r: BwRoom = { bid: o.bid, host: o.host, cap: o.cap, seats: [], map: 'random', lives: 3 }
    setRoom(r); roomRef.current = r
    send({ type: 'join', bid: o.bid, id: me, v: BW_PROTO })
    setTimeout(() => {
      const cur = roomRef.current
      if (cur && cur.bid === o.bid && !cur.seats.includes(me)) { setRoom(null); optsRef.current.toast('🥊 방장이 응답하지 않아요') }
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

  // 방장: 인원·맵·목숨 바꾸기(인원을 줄이면 뒷자리 사람은 그대로 두고 꽉 찬 만큼만)
  const setRoomOpt = useCallback((o: Partial<Pick<BwRoom, 'cap' | 'map' | 'lives'>>) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const next = { ...r, ...o, cap: Math.max(o.cap ?? r.cap, bwCount(r.seats)) }
    setRoom(next); roomRef.current = next
    roster(next)
    // roster·send는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || r.host !== me) return
    const players = bwPlayersOf(r.cap, r.seats.filter(Boolean))
    const seed = Math.floor(Math.random() * 1e9)
    const startAt = optsRef.current.serverNow() + START_DELAY_MS
    const map = pickMap(r.map, seed)
    send({ type: 'start', bid: r.bid, hostId: me, players, seed, startAt, map, lives: r.lives })
    begin({ bid: r.bid, hostId: me, players, seed, startAt, map, lives: r.lives })
  }, [begin])

  const endSession = useCallback(() => { setSession(null); sessionRef.current = null }, [])
  const dismissOffer = useCallback((bid: string) => setOffers(list => list.filter(o => o.bid !== bid)), [])
  const setRelayListener = useCallback((fn: ((m: BrawlWire) => void) | null) => { relayListener.current = fn }, [])
  return { offers, room, session, onMsg, openRoom, join, leave, start, setRoomOpt, endSession, dismissOffer, setRelayListener }
}
