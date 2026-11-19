'use client'

// ⚽ 미니 축구 방 모집 — 운동장 채널의 'sc' 이벤트(드문 메시지만). 폭탄 놀이터(useBombRooms)와 같은 흐름:
// 방장이 방을 열면(open, 5초마다 다시 알림) 운동장을 연 팀원에게 참가 카드 → join → 방장이 명단(roster) 방송
// → 방장 [시작] → start(자리·시드·시작 시각·팀 유니폼 구단) → 모두 SoccerArena로. 빈자리는 🤖 CPU.
// 팀 유니폼: 방장이 대기실에서 팀마다 구단을 고른다('auto' = 그 팀 첫 사람이 입은 야구 유니폼 구단, soccerKit.autoClub).

import { useCallback, useEffect, useRef, useState } from 'react'
import { KBO_TEAMS, type TeamKey } from './baseballGear'
import type { SoccerWire } from './soccerNet'

export const SC_PROTO = 1
const START_DELAY_MS = 3500
export type ScSize = 1 | 2 | 3
export type ClubPick = TeamKey | 'auto'
export type ScKits = { A: ClubPick; B: ClubPick }
const okSize = (n: unknown): ScSize => (n === 2 || n === 3 ? n : 1)
const okClub = (c: unknown): ClubPick => (c === 'auto' || KBO_TEAMS.some(t => t.key === c) ? (c as ClubPick) : 'auto')
const okKits = (k: unknown): ScKits => {
  const o = (k ?? {}) as { A?: unknown; B?: unknown }
  return { A: okClub(o.A), B: okClub(o.B) }
}
export type ScRoom = { bid: string; host: string; size: ScSize; seats: string[]; kits: ScKits }
export type ScOffer = { bid: string; host: string; size: ScSize; seen: number; count: number }
// players = 경기 자리 [A0, (A1, A2), B0, (B1, B2)] — 사람 id 또는 null(CPU)
export type ScSession = { bid: string; hostId: string; size: ScSize; players: (string | null)[]; seed: number; startAt: number; kits: { A: TeamKey; B: TeamKey } }
export type ScRoomMsg =
  | { type: 'open'; bid: string; host: string; size: ScSize; v: number; count: number }
  | { type: 'join'; bid: string; id: string; v: number }
  | { type: 'leave'; bid: string; id: string }
  | { type: 'roster'; bid: string; host: string; size: ScSize; seats: string[]; kits: ScKits }
  | { type: 'cancel'; bid: string }
  | { type: 'start'; bid: string; hostId: string; size: ScSize; players: (string | null)[]; seed: number; startAt: number; kits: { A: TeamKey; B: TeamKey } }
  | { type: 'news'; text: string }
export type ScGameRelay = { type: 'game'; bid: string; payload: SoccerWire }

export const scSeatsOf = (size: ScSize) => size * 2
export const scCount = (seats: string[]) => seats.filter(Boolean).length
const trim = (seats: string[]) => { const s = [...seats]; while (s.length && !s[s.length - 1]) s.pop(); return s }
const OPEN_EVERY_MS = 5000
const OFFER_TTL_MS = 12000

// 모집 자리 i(참가 순서) → 팀: 짝수 = A, 홀수 = B (A B A B …) — 경기 자리 index로
export function scPlayersOf(size: ScSize, seats: string[]): (string | null)[] {
  const out: (string | null)[] = Array(size * 2).fill(null)
  for (let i = 0; i < size * 2; i++) {
    const k = Math.floor(i / 2)
    out[i % 2 === 0 ? k : size + k] = seats[i] || null
  }
  return out
}

export function useSoccerRooms(opts: {
  myId: string | null
  send: (event: 'sc', msg: ScRoomMsg | ScGameRelay) => void
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
  serverNow: () => number
  resolveKits: (players: (string | null)[], size: ScSize, kits: ScKits) => { A: TeamKey; B: TeamKey }
}) {
  const { myId } = opts
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })
  const [offers, setOffers] = useState<ScOffer[]>([])
  const [room, setRoom] = useState<ScRoom | null>(null)
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const [session, setSession] = useState<ScSession | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const relayListener = useRef<((m: SoccerWire) => void) | null>(null)

  const send = (m: ScRoomMsg | ScGameRelay) => optsRef.current.send('sc', m)

  useEffect(() => {
    const t = setInterval(() => {
      const r = roomRef.current
      if (r && r.host === myId) send({ type: 'open', bid: r.bid, host: r.host, size: r.size, v: SC_PROTO, count: scCount(r.seats) })
      setOffers(list => (list.some(o => Date.now() - o.seen > OFFER_TTL_MS) ? list.filter(o => Date.now() - o.seen <= OFFER_TTL_MS) : list))
    }, OPEN_EVERY_MS)
    return () => clearInterval(t)
    // send는 optsRef로 늘 최신
  }, [myId])

  const begin = useCallback((ses: ScSession) => {
    setRoom(null); roomRef.current = null
    setOffers(list => list.filter(o => o.bid !== ses.bid))
    setSession(ses); sessionRef.current = ses
  }, [])

  const roster = (r: ScRoom) => send({ type: 'roster', bid: r.bid, host: r.host, size: r.size, seats: r.seats, kits: r.kits })

  const onMsg = useCallback((m: ScRoomMsg | ScGameRelay) => {
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
        if (m.host === me || m.v !== SC_PROTO) return
        setOffers(list => {
          const had = list.some(o => o.bid === m.bid)
          if (!had && !sessionRef.current && !roomRef.current) optsRef.current.toast(`⚽ ${optsRef.current.nickOf(m.host)}님이 미니 축구(${m.size}:${m.size}) 방을 열었어요!`)
          return [...list.filter(o => o.bid !== m.bid), { bid: m.bid, host: m.host, size: okSize(m.size), seen: Date.now(), count: m.count }]
        })
        return
      case 'cancel':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (r && r.bid === m.bid && r.host !== me) { setRoom(null); optsRef.current.toast('⚽ 방장이 방을 닫았어요') }
        return
      case 'join': {
        if (!r || r.bid !== m.bid || r.host !== me || m.v !== SC_PROTO) return
        if (r.seats.includes(m.id) || scCount(r.seats) >= scSeatsOf(r.size)) { roster(r); return }
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
        setOffers(list => list.map(o => (o.bid === m.bid ? { ...o, count: scCount(m.seats) } : o)))
        if (!r || r.bid !== m.bid || r.host === me) return
        if (!m.seats.includes(me)) { setRoom(null); optsRef.current.toast('⚽ 방이 꽉 찼어요'); return }
        setRoom({ bid: m.bid, host: m.host, size: okSize(m.size), seats: m.seats, kits: okKits(m.kits) })
        return
      case 'start':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (m.hostId !== me && m.players.includes(me) && !sessionRef.current) {
          const k = okKits(m.kits)
          begin({ bid: m.bid, hostId: m.hostId, size: okSize(m.size), players: m.players, seed: m.seed, startAt: m.startAt, kits: { A: k.A === 'auto' ? 'samsung' : k.A, B: k.B === 'auto' ? 'kia' : k.B } })
        }
        return
    }
    // send·roster는 optsRef로 늘 최신
    // roster·send는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin])

  const openRoom = useCallback((size: ScSize, solo: boolean, kits: ScKits = { A: 'auto', B: 'auto' }) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const bid = `sc-${me.slice(0, 6)}-${Date.now()}`
    if (solo) {
      const players = scPlayersOf(size, [me])
      begin({ bid, hostId: me, size, players, seed: Math.floor(Math.random() * 1e9), startAt: optsRef.current.serverNow() + 2500, kits: optsRef.current.resolveKits(players, size, kits) })
      return
    }
    const r: ScRoom = { bid, host: me, size, seats: [me], kits }
    setRoom(r); roomRef.current = r
    send({ type: 'open', bid, host: me, size, v: SC_PROTO, count: 1 })
  }, [begin])

  const join = useCallback((o: ScOffer) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const r: ScRoom = { bid: o.bid, host: o.host, size: o.size, seats: [], kits: { A: 'auto', B: 'auto' } }
    setRoom(r); roomRef.current = r
    send({ type: 'join', bid: o.bid, id: me, v: SC_PROTO })
    setTimeout(() => {
      const cur = roomRef.current
      if (cur && cur.bid === o.bid && !cur.seats.includes(me)) { setRoom(null); optsRef.current.toast('⚽ 방장이 응답하지 않아요') }
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

  // 방장: 이름을 누르면 옆 자리(상대 팀)와 맞바꿈 — 빈자리(CPU)와도
  const swapSeats = useCallback((i: number, j: number) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const n = scSeatsOf(r.size)
    const full: string[] = Array.from({ length: n }, (_, k) => r.seats[k] ?? '')
    ;[full[i], full[j]] = [full[j], full[i]]
    const next = { ...r, seats: trim(full) }
    setRoom(next); roomRef.current = next
    roster(next)
    // roster·send는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setRoomKit = useCallback((team: 'A' | 'B', club: ClubPick) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const next = { ...r, kits: { ...r.kits, [team]: club } }
    setRoom(next); roomRef.current = next
    roster(next)
    // roster·send는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || r.host !== me) return
    const players = scPlayersOf(r.size, r.seats)
    const seed = Math.floor(Math.random() * 1e9)
    const startAt = optsRef.current.serverNow() + START_DELAY_MS
    const kits = optsRef.current.resolveKits(players, r.size, r.kits)
    send({ type: 'start', bid: r.bid, hostId: me, size: r.size, players, seed, startAt, kits })
    begin({ bid: r.bid, hostId: me, size: r.size, players, seed, startAt, kits })
  }, [begin])

  const endSession = useCallback(() => { setSession(null); sessionRef.current = null }, [])
  const dismissOffer = useCallback((bid: string) => setOffers(list => list.filter(o => o.bid !== bid)), [])
  const setRelayListener = useCallback((fn: ((m: SoccerWire) => void) | null) => { relayListener.current = fn }, [])
  return { offers, room, session, onMsg, openRoom, join, leave, start, swapSeats, setRoomKit, endSession, dismissOffer, setRelayListener }
}
