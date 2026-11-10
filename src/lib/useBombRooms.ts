'use client'

// 🧨 폭탄 놀이터 방 모집 — 운동장 채널의 'bb' 이벤트(드문 메시지만). 배드민턴(useBadmintonRooms)과 같은 흐름:
// 방장이 방을 열면(open, 5초마다 다시 알림) 운동장을 연 팀원에게 참가 카드 → join(내 캐릭터 모습 포함) → 방장이 명단(roster) 방송
// → 방장 [시작] → start(자리·시드·시작 시각·모습) → 모두 BombArena로. 빈자리는 🤖 CPU.
// 경기 중 메시지는 useBombNet 전용 채널로. 전용 채널이 안 붙은 사람이 운동장 채널로 보낸 경기 메시지는 'game'으로 중계.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CritterLook } from '@/components/playground/bomb/Critter'
import { sanitizeLook } from './bombLook'
import { MAP_ORDER, type MapId } from './bomb'
import type { BombWire } from './bombNet'

export const BB_PROTO = 1
const START_DELAY_MS = 3500 // 시작 누르고 이만큼 뒤 출발(카운트다운 포함) — 다들 화면을 띄울 시간
export type BbSize = 1 | 2 | 3
export type BbMapPick = MapId | 'random'
const okMap = (m: unknown): MapId => (MAP_ORDER.includes(m as MapId) ? (m as MapId) : 'forest')
const okSize = (n: unknown): BbSize => (n === 2 || n === 3 ? n : 1)
const resolveMap = (m: BbMapPick): MapId => (m === 'random' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : m)
export type BbRoom = { bid: string; host: string; size: BbSize; map: BbMapPick; seats: string[]; looks: Record<string, CritterLook> }
export type BbOffer = { bid: string; host: string; size: BbSize; map: BbMapPick; seen: number; count: number }
// players = 경기 자리 [A0, (A1), B0, (B1)] — 사람 id 또는 null(CPU)
export type BbSession = { bid: string; hostId: string; size: BbSize; map: MapId; players: (string | null)[]; seed: number; startAt: number; looks: Record<string, CritterLook> }
export type BbRoomMsg =
  | { type: 'open'; bid: string; host: string; size: BbSize; map: BbMapPick; v: number; count: number }
  | { type: 'join'; bid: string; id: string; v: number; look: unknown }
  | { type: 'leave'; bid: string; id: string }
  | { type: 'roster'; bid: string; host: string; size: BbSize; map: BbMapPick; seats: string[]; looks: Record<string, unknown> }
  | { type: 'cancel'; bid: string }
  | { type: 'start'; bid: string; hostId: string; size: BbSize; map: MapId; players: (string | null)[]; seed: number; startAt: number; looks: Record<string, unknown> }
  | { type: 'news'; text: string }
export type BbGameRelay = { type: 'game'; bid: string; payload: BombWire }

export const bbSeatsOf = (size: BbSize) => size * 2
export const bbCount = (seats: string[]) => seats.filter(Boolean).length
const trim = (seats: string[]) => { const s = [...seats]; while (s.length && !s[s.length - 1]) s.pop(); return s }
const OPEN_EVERY_MS = 5000
const OFFER_TTL_MS = 12000

// 모집 자리 i(참가 순서) → 팀: 짝수 = A, 홀수 = B (A B A B) — 경기 자리 index로
export function bbPlayersOf(size: BbSize, seats: string[]): (string | null)[] {
  const out: (string | null)[] = Array(size * 2).fill(null)
  for (let i = 0; i < size * 2; i++) {
    const k = Math.floor(i / 2)
    out[i % 2 === 0 ? k : size + k] = seats[i] || null
  }
  return out
}

function cleanLooks(v: Record<string, unknown> | undefined): Record<string, CritterLook> {
  const out: Record<string, CritterLook> = {}
  for (const [id, l] of Object.entries(v ?? {})) {
    const ok = sanitizeLook(l)
    if (ok) out[id] = ok
  }
  return out
}

export function useBombRooms(opts: {
  myId: string | null
  myLook: CritterLook | null
  send: (event: 'bb', msg: BbRoomMsg | BbGameRelay) => void
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
  serverNow: () => number
}) {
  const { myId } = opts
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })
  const [offers, setOffers] = useState<BbOffer[]>([])
  const [room, setRoom] = useState<BbRoom | null>(null)
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const [session, setSession] = useState<BbSession | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const relayListener = useRef<((m: BombWire) => void) | null>(null)

  const send = (m: BbRoomMsg | BbGameRelay) => optsRef.current.send('bb', m)

  useEffect(() => {
    const t = setInterval(() => {
      const r = roomRef.current
      if (r && r.host === myId) send({ type: 'open', bid: r.bid, host: r.host, size: r.size, map: r.map, v: BB_PROTO, count: bbCount(r.seats) })
      setOffers(list => (list.some(o => Date.now() - o.seen > OFFER_TTL_MS) ? list.filter(o => Date.now() - o.seen <= OFFER_TTL_MS) : list))
    }, OPEN_EVERY_MS)
    return () => clearInterval(t)
    // send는 optsRef로 늘 최신
     
  }, [myId])

  const begin = useCallback((ses: BbSession) => {
    setRoom(null); roomRef.current = null
    setOffers(list => list.filter(o => o.bid !== ses.bid))
    setSession(ses); sessionRef.current = ses
  }, [])

  const roster = (r: BbRoom) => send({ type: 'roster', bid: r.bid, host: r.host, size: r.size, map: r.map, seats: r.seats, looks: r.looks })

  const onMsg = useCallback((m: BbRoomMsg | BbGameRelay) => {
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
        if (m.host === me || m.v !== BB_PROTO) return
        setOffers(list => {
          const had = list.some(o => o.bid === m.bid)
          if (!had && !sessionRef.current && !roomRef.current) optsRef.current.toast(`🧨 ${optsRef.current.nickOf(m.host)}님이 폭탄 놀이터(${m.size}:${m.size}) 방을 열었어요!`)
          return [...list.filter(o => o.bid !== m.bid), { bid: m.bid, host: m.host, size: okSize(m.size), map: m.map === 'random' ? 'random' : okMap(m.map), seen: Date.now(), count: m.count }]
        })
        return
      case 'cancel':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        if (r && r.bid === m.bid && r.host !== me) { setRoom(null); optsRef.current.toast('🧨 방장이 방을 닫았어요') }
        return
      case 'join': {
        if (!r || r.bid !== m.bid || r.host !== me || m.v !== BB_PROTO) return
        const look = sanitizeLook(m.look)
        if (r.seats.includes(m.id) || bbCount(r.seats) >= bbSeatsOf(r.size)) { roster(r); return }
        const hole = r.seats.indexOf('')
        const next = { ...r, seats: hole >= 0 ? r.seats.map((id, i) => (i === hole ? m.id : id)) : [...r.seats, m.id], looks: look ? { ...r.looks, [m.id]: look } : r.looks }
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
        setOffers(list => list.map(o => (o.bid === m.bid ? { ...o, count: bbCount(m.seats) } : o)))
        if (!r || r.bid !== m.bid || r.host === me) return
        if (!m.seats.includes(me)) { setRoom(null); optsRef.current.toast('🧨 방이 꽉 찼어요'); return }
        setRoom({ bid: m.bid, host: m.host, size: okSize(m.size), map: m.map === 'random' ? 'random' : okMap(m.map), seats: m.seats, looks: cleanLooks(m.looks) })
        return
      case 'start':
        setOffers(list => list.filter(o => o.bid !== m.bid))
        // 방장이 나(같은 계정의 다른 창)면 무시 — 그 창이 진행한다
        if (m.hostId !== me && m.players.includes(me) && !sessionRef.current)
          begin({ bid: m.bid, hostId: m.hostId, size: okSize(m.size), map: okMap(m.map), players: m.players, seed: m.seed, startAt: m.startAt, looks: cleanLooks(m.looks) })
        return
    }
    // send·roster는 optsRef로 늘 최신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin])

  const myLooks = (): Record<string, CritterLook> => {
    const o = optsRef.current
    return o.myId && o.myLook ? { [o.myId]: o.myLook } : {}
  }

  const openRoom = useCallback((size: BbSize, solo: boolean, map: BbMapPick = 'random') => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const bid = `bb-${me.slice(0, 6)}-${Date.now()}`
    if (solo) {
      begin({ bid, hostId: me, size, map: resolveMap(map), players: bbPlayersOf(size, [me]), seed: Math.floor(Math.random() * 1e9), startAt: optsRef.current.serverNow() + 2500, looks: myLooks() })
      return
    }
    const r: BbRoom = { bid, host: me, size, map, seats: [me], looks: myLooks() }
    setRoom(r); roomRef.current = r
    send({ type: 'open', bid, host: me, size, map, v: BB_PROTO, count: 1 })
  }, [begin])

  const join = useCallback((o: BbOffer, look?: CritterLook) => {
    const me = optsRef.current.myId
    if (!me || roomRef.current || sessionRef.current) return
    const r: BbRoom = { bid: o.bid, host: o.host, size: o.size, map: o.map, seats: [], looks: {} }
    setRoom(r); roomRef.current = r
    send({ type: 'join', bid: o.bid, id: me, v: BB_PROTO, look: look ?? optsRef.current.myLook })
    setTimeout(() => {
      const cur = roomRef.current
      if (cur && cur.bid === o.bid && !cur.seats.includes(me)) { setRoom(null); optsRef.current.toast('🧨 방장이 응답하지 않아요') }
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
    const n = bbSeatsOf(r.size)
    const full: string[] = Array.from({ length: n }, (_, k) => r.seats[k] ?? '')
    ;[full[i], full[j]] = [full[j], full[i]]
    const next = { ...r, seats: trim(full) }
    setRoom(next); roomRef.current = next
    roster(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    const r = roomRef.current
    const me = optsRef.current.myId
    if (!r || r.host !== me) return
    const players = bbPlayersOf(r.size, r.seats)
    const seed = Math.floor(Math.random() * 1e9)
    const startAt = optsRef.current.serverNow() + START_DELAY_MS
    const looks = { ...r.looks, ...myLooks() }
    const map = resolveMap(r.map)
    send({ type: 'start', bid: r.bid, hostId: me, size: r.size, map, players, seed, startAt, looks })
    begin({ bid: r.bid, hostId: me, size: r.size, map, players, seed, startAt, looks })
     
  }, [begin])

  // 방장: 대기실에서 맵 바꾸기
  const setRoomMap = useCallback((map: BbMapPick) => {
    const r = roomRef.current
    if (!r || r.host !== optsRef.current.myId) return
    const next = { ...r, map }
    setRoom(next); roomRef.current = next
    roster(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endSession = useCallback(() => { setSession(null); sessionRef.current = null }, [])
  const dismissOffer = useCallback((bid: string) => setOffers(list => list.filter(o => o.bid !== bid)), [])
  const setRelayListener = useCallback((fn: ((m: BombWire) => void) | null) => { relayListener.current = fn }, [])
  return { offers, room, session, onMsg, openRoom, join, leave, start, swapSeats, setRoomMap, endSession, dismissOffer, setRelayListener }
}
