'use client'

// 운동장 🏎 퇴근 레이싱 화면 — 운동장 무대 자리에 뜬다(대결 화면과 같은 방식, 별도 창 없음).
// 누가 레이스를 열면(open) 운동장을 연 팀원 누구나 참가(join) → 모집 시간이 끝나면 방장이 명단 확정(lock) → 3초 카운트 → 출발.
// 각자 자기 카트만 계산해서 15번/초 위치를 방송(st)하고, CPU 카트는 방장 PC가 계산해서 같이 보낸다.
// 🍌 바나나(banana/pop)·📧 메일(mail)도 방송으로 모두에게 보인다. 메일 맞는 처리는 맞는 사람 PC(CPU면 방장)가 한다.
// 키: ↑↓(또는 W/S) 차선 · Space 아이템 — 레이스 중엔 이 컴포넌트가 먼저 잡아서 운동장 캐릭터는 안 움직인다.
// 터치 기기는 아래 ◀ ▶ 버튼이 각각 위·아래 차선이다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { H, W } from '@/lib/playground'
import { drawChase, type ChaseCar } from '@/components/playground/raceChase'
import {
  COUNTDOWN_MS, ITEMS, KART_HX, LANE_Y, MAIL_FLIGHT_MS, RACE_LEN, RACE_TIMEOUT_MS, ROAD_BOT, ROAD_TOP,
  bananaDrop, cpuSteer, disabled, fireItem, kartStep, mailTarget, makeTrack, newCpu, newKart, ranking, rng, stunKart,
  type Banana, type CpuMem, type Item, type Kart,
} from '@/lib/race'

type Look = { name: string; palette: { bg: string; fg: string } }
type Fx = '' | 'spin' | 'stun' | 'slip' | 'boost'
type Remote = { x: number; y: number; v: number; fx: Fx; fin: number | null; item: Item | null; at: number }
export type RaceMsg =
  | { type: 'open'; rid: string; host: string; seed: number; startAt: number }
  | { type: 'join'; rid: string; id: string }
  | { type: 'lock'; rid: string; roster: string[]; cpus: number }
  | { type: 'st'; rid: string; list: ({ id: string } & Omit<Remote, 'at'>)[] }
  | { type: 'banana'; rid: string; b: Banana }
  | { type: 'pop'; rid: string; bid: string }
  | { type: 'mail'; rid: string; from: string; to: string; at: number }
  | { type: 'bye'; rid: string; id: string }

const STEP_MS = 1000 / 60
const SEND_MS = 66
const CAM_AT = 300 // 내 카트가 화면에서 놓이는 가로 자리
const CPU_FILL = 4 // 사람이 이보다 적으면 CPU로 채운다
const CPU_NAMES = ['🤖 야근봇', '🤖 결재봇', '🤖 회의봇']
const VIEW_KEY = 'hrm_race_view'
type View = 'chase' | 'top'
const loadView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'top' ? 'top' : 'chase' } catch { return 'chase' } }
const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export default function RaceArena(props: {
  rid: string
  seed: number
  startAt: number // 서버 시각(출발 순간)
  hostId: string
  myId: string
  solo: boolean // 🤖 CPU랑 바로 — 방송 안 함
  offset: number // 서버 시각 = Date.now() + offset
  lookOf: (id: string) => Look
  send: (msg: RaceMsg) => void
  listen: (fn: ((msg: RaceMsg) => void) | null) => void
  onEnd: (text: string) => void
  onClose: () => void
}) {
  const { rid, seed, startAt, hostId, myId, solo } = props
  const isHost = hostId === myId
  const lobbyEnd = startAt - COUNTDOWN_MS
  const track = useMemo(() => makeTrack(seed), [seed])
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })

  const [joined, setJoined] = useState<string[]>(() => [hostId, ...(hostId === myId ? [] : [myId])])
  const joinedRef = useRef(joined)
  const [roster, setRoster] = useState<string[] | null>(solo ? [myId, 'cpu0', 'cpu1', 'cpu2'] : null)
  const rosterRef = useRef(roster)
  useEffect(() => { rosterRef.current = roster }, [roster])

  const meRef = useRef<Kart>(newKart(0))
  const remoteRef = useRef(new Map<string, Remote>())
  const cpuRef = useRef(new Map<string, { k: Kart; mem: CpuMem }>())
  const bananasRef = useRef<Banana[]>([])
  const mailsRef = useRef<{ id: string; from: string; to: string; at: number; sentAt: number }[]>([])
  const keys = useRef({ up: false, down: false, useSeq: 0 })
  const randRef = useRef(rng(seed ^ 0x5bd1e995)) // 아이템 뽑기·CPU 판단용(레이스마다 다름)
  const endedRef = useRef(false)
  // 화면은 매 프레임 찍어 둔 스냅샷으로만 그린다(그리는 중에 ref를 읽지 않게)
  type Snap = { sn: number; wall: number; me: Kart; cpus: Map<string, Kart>; remote: Map<string, Remote>; bananas: Banana[]; mails: typeof mailsRef.current; ended: boolean }
  const [snap, setSnap] = useState<Snap>(() => ({ sn: 0, wall: 0, me: newKart(0), cpus: new Map(), remote: new Map(), bananas: [], mails: [], ended: false }))
  const [flash, setFlash] = useState<{ text: string; at: number } | null>(null)
  // 시점: 🎥 추격(차 뒤에서, 기본) / 🗺 위에서 — V 키나 왼쪽 아래 버튼으로 바꾼다(브라우저에 기억)
  const [view, setView] = useState<View>(loadView)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view; try { localStorage.setItem(VIEW_KEY, view) } catch { /* 저장 못 해도 그만 */ } }, [view])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hitAt, setHitAt] = useState(0) // 화면 흔들기
  const [quitIds, setQuitIds] = useState<string[]>([])
  const now = () => Date.now() + propsRef.current.offset

  // 명단이 정해지면 출발 자리 배치(명단 순서 = 출발 자리)
  useEffect(() => {
    if (!roster) return
    meRef.current = newKart(Math.max(0, roster.indexOf(myId)))
    if (isHost) {
      const rand = randRef.current
      cpuRef.current = new Map(roster.filter(id => id.startsWith('cpu')).map(id => [id, { k: newKart(roster.indexOf(id)), mem: newCpu(rand) }]))
    }
  }, [roster, myId, isHost])

  // 참가 알리기 — 내가 연 게 아니면 열자마자 join
  useEffect(() => {
    if (!solo && !isHost) propsRef.current.send({ type: 'join', rid, id: myId })
  }, [rid, myId, isHost, solo])

  // 메시지 받기
  useEffect(() => {
    props.listen(msg => {
      if (msg.rid !== rid) return
      if (msg.type === 'join') {
        if (!joinedRef.current.includes(msg.id) && now() < lobbyEnd) { joinedRef.current = [...joinedRef.current, msg.id]; setJoined(joinedRef.current) }
      } else if (msg.type === 'lock') {
        if (!isHost) setRoster([...msg.roster, ...Array.from({ length: msg.cpus }, (_, i) => `cpu${i}`)])
      } else if (msg.type === 'st') {
        const at = Date.now()
        for (const r of msg.list) if (r.id !== myId) remoteRef.current.set(r.id, { x: r.x, y: r.y, v: r.v, fx: r.fx, fin: r.fin, item: r.item, at })
      } else if (msg.type === 'banana') {
        bananasRef.current = [...bananasRef.current, msg.b]
      } else if (msg.type === 'pop') {
        bananasRef.current = bananasRef.current.filter(b => b.id !== msg.bid)
      } else if (msg.type === 'mail') {
        mailsRef.current = [...mailsRef.current, { id: `${msg.from}-${msg.at}`, from: msg.from, to: msg.to, at: msg.at, sentAt: msg.at - MAIL_FLIGHT_MS }]
      } else if (msg.type === 'bye') {
        setQuitIds(q => (q.includes(msg.id) ? q : [...q, msg.id]))
      }
    })
    return () => props.listen(null)
    // listen은 부모가 안정적으로 넘긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, myId, isHost, lobbyEnd])

  // 키
  useEffect(() => {
    const touch = isTouch()
    const dirOf = (e: KeyboardEvent): 'up' | 'down' | null => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') return 'up'
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') return 'down'
      // 추격 시점에선 ←→가 차선(왼쪽 = 도로 위쪽 차선). 터치 기기는 ◀ ▶ 버튼이 같은 키를 보낸다
      if ((touch || viewRef.current === 'chase') && e.key === 'ArrowLeft') return 'up'
      if ((touch || viewRef.current === 'chase') && e.key === 'ArrowRight') return 'down'
      return null
    }
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const d = dirOf(e)
      const isAct = e.code === 'Space' || e.key === ' '
      if ((e.key === 'v' || e.key === 'V') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); setView(v => (v === 'chase' ? 'top' : 'chase')); return }
      if (!d && !isAct && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (d) keys.current[d] = true
      else if (isAct) keys.current.useSeq++
    }
    function up(e: KeyboardEvent) {
      const d = dirOf(e)
      if (!d && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.stopImmediatePropagation()
      if (d) keys.current[d] = false
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
  }, [])

  // 루프
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastSent = 0
    let seenUse = 0
    let locked = !!rosterRef.current
    const say = (text: string) => setFlash({ text, at: Date.now() })
    const allRacers = () => {
      const r = rosterRef.current ?? []
      return r.map(id => {
        if (id === myId) return { id, x: meRef.current.x, finishedAt: meRef.current.finishedAt }
        const c = cpuRef.current.get(id)
        if (c) return { id, x: c.k.x, finishedAt: c.k.finishedAt }
        const rm = remoteRef.current.get(id)
        return { id, x: rm?.x ?? 0, finishedAt: rm?.fin ?? null }
      })
    }
    const dropBanana = (owner: string, k: Kart) => {
      const b: Banana = { id: `${owner}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, ...bananaDrop(k), owner }
      bananasRef.current = [...bananasRef.current, b]
      if (!solo) propsRef.current.send({ type: 'banana', rid, b })
    }
    const sendMail = (from: string, t: number) => {
      const to = mailTarget(from, allRacers().map(r => ({ id: r.id, x: r.x, done: r.finishedAt !== null })))
      if (!to) return
      const at = now() + MAIL_FLIGHT_MS
      mailsRef.current = [...mailsRef.current, { id: `${from}-${at}`, from, to, at, sentAt: at - MAIL_FLIGHT_MS }]
      if (!solo) propsRef.current.send({ type: 'mail', rid, from, to, at })
      void t
    }
    const popBanana = (bid: string) => {
      bananasRef.current = bananasRef.current.filter(b => b.id !== bid)
      if (!solo) propsRef.current.send({ type: 'pop', rid, bid })
    }
    const fxOf = (k: Kart, t: number): Fx => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : '')

    const loop = (tt: number) => {
      acc = Math.min(acc + (tt - last), 250)
      last = tt
      const sn = now()
      // 방장: 모집 끝나면 명단 확정
      if (!locked && sn >= lobbyEnd) {
        if (isHost) {
          const humans = joinedRef.current
          const cpus = Math.max(0, CPU_FILL - humans.length)
          const r = [...humans, ...Array.from({ length: cpus }, (_, i) => `cpu${i}`)]
          if (!solo) propsRef.current.send({ type: 'lock', rid, roster: humans, cpus })
          setRoster(r)
          locked = true
        } else if (sn >= startAt + 1500 && !rosterRef.current) {
          // 방장 확정을 못 받았으면 아는 명단으로
          setRoster(joinedRef.current)
          locked = true
        } else if (rosterRef.current) locked = true
      }
      const roster = rosterRef.current
      if (roster) {
        const total = roster.length
        while (acc >= STEP_MS) {
          acc -= STEP_MS
          const t = now() - startAt
          const order = ranking(allRacers())
          const rankOf = (id: string) => Math.max(0, order.findIndex(o => o.id === id))
          // 내 카트
          const kk = keys.current
          const steer = ((kk.down ? 1 : 0) - (kk.up ? 1 : 0)) as -1 | 0 | 1
          const res = kartStep(meRef.current, steer, t, STEP_MS, track, bananasRef.current, rankOf(myId), total, randRef.current)
          let me = res.k
          for (const e of res.events) {
            if (e.type === 'spin' || e.type === 'slip') setHitAt(Date.now())
            if (e.type === 'spin') { say(e.by === 'banana' ? '🍌 바나나 밟았다!' : '🚧 고깔에 쾅!'); if (e.bananaId) popBanana(e.bananaId) }
            else if (e.type === 'slip') say('🛢 기름에 미끄덩')
            else if (e.type === 'pad') say('⏩ 부스터!')
            else if (e.type === 'finish') say(`🏁 완주! ${(t / 1000).toFixed(2)}초`)
          }
          if (kk.useSeq !== seenUse) {
            seenUse = kk.useSeq
            const u = fireItem(me, t)
            me = u.k
            if (u.used === 'banana') dropBanana(myId, me)
            else if (u.used === 'mail') sendMail(myId, t)
            else if (u.used === 'rocket') say('🚀 부스터 발사!')
          }
          meRef.current = me
          // CPU(방장만)
          if (isHost) {
            for (const [id, c] of cpuRef.current) {
              const cs = cpuSteer(c.k, c.mem, t, track, bananasRef.current, randRef.current)
              const r = kartStep(c.k, cs.steer, t, STEP_MS, track, bananasRef.current, rankOf(id), total, randRef.current)
              let ck = r.k
              for (const e of r.events) if (e.type === 'spin' && e.bananaId) popBanana(e.bananaId)
              if (cs.use) {
                const u = fireItem(ck, t)
                ck = u.k
                if (u.used === 'banana') dropBanana(id, ck)
                else if (u.used === 'mail') sendMail(id, t)
              }
              c.k = ck
            }
          }
          // 날아온 메일 도착 — 맞는 사람 PC(CPU면 방장)가 처리
          const arrived = mailsRef.current.filter(m => sn >= m.at)
          if (arrived.length) {
            mailsRef.current = mailsRef.current.filter(m => sn < m.at)
            for (const m of arrived) {
              if (m.to === myId && meRef.current.finishedAt === null) { meRef.current = stunKart(meRef.current, t); setHitAt(Date.now()); say(`📧 ${propsRef.current.lookOf(m.from).name}님의 긴급 메일! 멈춤`) }
              const c = isHost ? cpuRef.current.get(m.to) : undefined
              if (c && c.k.finishedAt === null) c.k = stunKart(c.k, t)
            }
          }
        }
        // 방송
        const t = now() - startAt
        if (!solo && Date.now() - lastSent >= SEND_MS) {
          lastSent = Date.now()
          const mk = (id: string, k: Kart) => ({ id, x: Math.round(k.x), y: Math.round(k.y), v: Math.round(k.v), fx: fxOf(k, t), fin: k.finishedAt, item: k.item })
          const list = [mk(myId, meRef.current)]
          if (isHost) for (const [id, c] of cpuRef.current) list.push(mk(id, c.k))
          propsRef.current.send({ type: 'st', rid, list })
        }
        // 끝: 모두 완주 또는 시간 초과
        const racers = allRacers()
        const over = t > RACE_TIMEOUT_MS || (t > 0 && racers.every(r => r.finishedAt !== null))
        if (over && !endedRef.current) {
          endedRef.current = true
          const ord = ranking(racers)
          const L = propsRef.current.lookOf
          const top = ord.slice(0, 3).map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${L(r.id).name}${r.finishedAt !== null ? ` ${(r.finishedAt / 1000).toFixed(1)}초` : ''}`).join(' · ')
          if (isHost || solo) propsRef.current.onEnd(`🏎 퇴근 레이싱 결과 — ${top}`)
        }
      } else acc = 0
      setSnap({
        sn: now(), wall: Date.now(), me: meRef.current, cpus: new Map([...cpuRef.current].map(([id, c]) => [id, c.k])),
        remote: new Map(remoteRef.current), bananas: bananasRef.current, mails: mailsRef.current, ended: endedRef.current,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rid, startAt, lobbyEnd, isHost, myId, solo, track])

  // 추격 시점 그리기 — 스냅샷이 바뀔 때마다(매 프레임)
  useEffect(() => {
    if (view !== 'chase') return
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const t = snap.sn - startAt
    const me = snap.me
    const fx = (k: Kart): ChaseCar['fx'] => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : '')
    const ids = rosterRef.current ?? [myId]
    const cars: ChaseCar[] = ids.map(id => {
      const look = id.startsWith('cpu') ? { name: CPU_NAMES[Number(id.slice(3)) % 3], palette: { bg: '#9CA3AF' } } : propsRef.current.lookOf(id)
      if (id === myId) return { id, x: me.x, y: me.y, fx: fx(me), fin: me.finishedAt, isMe: true, name: look.name, color: look.palette.bg }
      const c = snap.cpus.get(id)
      if (c) return { id, x: c.x, y: c.y, fx: fx(c), fin: c.finishedAt, isMe: false, name: look.name, color: look.palette.bg }
      const r = snap.remote.get(id)
      if (!r) { const g = newKart(Math.max(0, ids.indexOf(id))); return { id, x: g.x, y: g.y, fx: '', fin: null, isMe: false, name: look.name, color: look.palette.bg } }
      const lag = Math.max(0, Math.min(200, snap.wall - r.at)) / 1000
      return { id, x: r.x + (r.fx === 'spin' || r.fx === 'stun' ? 0 : r.v * lag), y: r.y, fx: r.fx, fin: r.fin, isMe: false, name: look.name, color: look.palette.bg }
    })
    const mails = snap.mails.flatMap(m => {
      const a = cars.find(c => c.id === m.from), b = cars.find(c => c.id === m.to)
      if (!a || !b) return []
      const p = Math.max(0, Math.min(1, (snap.sn - m.sentAt) / MAIL_FLIGHT_MS))
      return [{ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, h: Math.sin(p * Math.PI) * 60 }]
    })
    drawChase(ctx, {
      w: W, h: H, me: { x: me.x, y: me.y, v: me.v, fx: fx(me) }, cars, mails, bananas: snap.bananas, wall: snap.wall,
      things: track.filter(th => !(th.kind === 'box' && me.taken.includes(th.id))),
      shake: Math.max(0, 1 - (snap.wall - hitAt) / 400),
    })
  }, [snap, view, startAt, myId, track, hitAt])

  const quit = () => {
    if (!solo) props.send({ type: 'bye', rid, id: myId })
    props.onClose()
  }

  // ── 그리기 ──
  const { sn, wall } = snap
  const t = sn - startAt
  const me = snap.me
  const camX = Math.max(-60, Math.min(RACE_LEN + 260 - W, me.x - CAM_AT))
  const sx = (x: number) => x - camX
  const fxOf = (k: Kart): Fx => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : '')
  type Car = { id: string; x: number; y: number; fx: Fx; fin: number | null; isMe: boolean }
  const cars: Car[] = []
  if (roster) {
    for (const id of roster) {
      if (id === myId) cars.push({ id, x: me.x, y: me.y, fx: fxOf(me), fin: me.finishedAt, isMe: true })
      else if (snap.cpus.has(id)) { const c = snap.cpus.get(id)!; cars.push({ id, x: c.x, y: c.y, fx: fxOf(c), fin: c.finishedAt, isMe: false }) }
      else {
        const r = snap.remote.get(id)
        if (!r) { const g = newKart(roster.indexOf(id)); cars.push({ id, x: g.x, y: g.y, fx: '', fin: null, isMe: false }); continue }
        // 받은 뒤 지난 시간만큼 앞으로 그려서 덜 끊겨 보이게(최대 0.2초)
        const lag = Math.max(0, Math.min(200, wall - r.at)) / 1000
        cars.push({ id, x: r.x + (r.fx === 'spin' || r.fx === 'stun' ? 0 : r.v * lag), y: r.y, fx: r.fx, fin: r.fin, isMe: false })
      }
    }
  }
  const order = ranking(cars.map(c => ({ ...c, finishedAt: c.fin })))
  const myRank = order.findIndex(c => c.isMe) + 1
  const L = (id: string) => (id.startsWith('cpu') ? { name: CPU_NAMES[Number(id.slice(3)) % 3], palette: { bg: '#E5E7EB', fg: '#374151' } } : props.lookOf(id))
  const phase = !roster || sn < lobbyEnd ? 'lobby' : t < 0 ? 'count' : snap.ended ? 'done' : 'race'
  const rollingEmoji = me.rolling ? ITEMS[(['rocket', 'banana', 'mail'] as Item[])[Math.floor(wall / 90) % 3]].emoji : null
  const dash = ((-camX % 60) + 60) % 60

  return (
    <div className="absolute inset-0 z-[45] overflow-hidden" style={{ background: '#5B8C3A' }}>
      <style>{`@keyframes rc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes rc-shake{0%,100%{transform:translateX(0)}50%{transform:translateX(2px)}}`}</style>
      {view === 'chase' && <canvas ref={canvasRef} className="absolute inset-0" style={{ width: W, height: H }} aria-label="레이스 화면" />}
      {view === 'top' && (<>
      {/* 도로 */}
      <svg className="absolute inset-0" width={W} height={H} aria-hidden>
        <rect x={0} y={ROAD_TOP - 8} width={W} height={ROAD_BOT - ROAD_TOP + 16} fill="#E5E7EB" />
        <rect x={0} y={ROAD_TOP} width={W} height={ROAD_BOT - ROAD_TOP} fill="#4B5563" />
        {[0, 1, 2].map(i => {
          const y = (LANE_Y[i] + LANE_Y[i + 1]) / 2
          return <line key={i} x1={dash - 60} y1={y} x2={W + 60} y2={y} stroke="#F9FAFB" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="28 32" />
        })}
        {/* 연석(빨강·흰 줄무늬) */}
        {Array.from({ length: Math.ceil(W / 40) + 2 }, (_, i) => {
          const x = i * 40 - (((camX % 80) + 80) % 80)
          return (
            <g key={i}>
              <rect x={x} y={ROAD_TOP - 8} width={20} height={8} fill="#EF4444" />
              <rect x={x} y={ROAD_BOT} width={20} height={8} fill="#EF4444" />
            </g>
          )
        })}
        {/* 출발선·결승선 */}
        <rect x={sx(150)} y={ROAD_TOP} width={6} height={ROAD_BOT - ROAD_TOP} fill="#F9FAFB" />
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={sx(RACE_LEN) + (i % 2) * 10} y={ROAD_TOP + Math.floor(i / 2) * ((ROAD_BOT - ROAD_TOP) / 12)} width={10} height={(ROAD_BOT - ROAD_TOP) / 12}
            fill={(Math.floor(i / 2) + (i % 2)) % 2 ? '#111827' : '#F9FAFB'} />
        ))}
        {/* 부스터 발판·기름 */}
        {track.map(th => {
          const x = sx(th.x)
          if (x < -40 || x > W + 40) return null
          if (th.kind === 'pad') return (
            <g key={th.id} transform={`translate(${x} ${th.y})`}>
              <rect x={-22} y={-14} width={44} height={28} rx={4} fill="#FACC15" opacity="0.9" />
              <path d="M-14 -8 L-4 0 L-14 8 M0 -8 L10 0 L0 8" stroke="#B45309" strokeWidth="3" fill="none" />
            </g>
          )
          if (th.kind === 'oil') return <ellipse key={th.id} cx={x} cy={th.y} rx={26} ry={14} fill="#111827" opacity="0.8" />
          return null
        })}
      </svg>
      {track.map(th => {
        const x = sx(th.x)
        if (x < -40 || x > W + 40 || th.kind === 'pad' || th.kind === 'oil') return null
        if (th.kind === 'box' && me.taken.includes(th.id)) return null
        return (
          <span key={th.id} className="pointer-events-none absolute leading-none"
            style={{ left: x, top: th.y, transform: 'translate(-50%,-50%)', fontSize: th.kind === 'box' ? 20 : 22 }}>
            {th.kind === 'box'
              ? <span className="flex h-[24px] w-[24px] items-center justify-center rounded-md border-2 border-white bg-gradient-to-br from-[#38BDF8] to-[#F472B6] text-[14px] font-black text-white shadow">?</span>
              : '🚧'}
          </span>
        )
      })}
      {snap.bananas.map(b => (sx(b.x) > -30 && sx(b.x) < W + 30 ? (
        <span key={b.id} className="pointer-events-none absolute text-[20px] leading-none" style={{ left: sx(b.x), top: b.y, transform: 'translate(-50%,-50%)' }}>🍌</span>
      ) : null))}

      {/* 카트 */}
      {[...cars].sort((a, b) => a.y - b.y).map(c => {
        const look = L(c.id)
        const x = sx(c.x)
        if (x < -60 || x > W + 60) return null
        return (
          <div key={c.id} className="pointer-events-none absolute" style={{ left: x, top: c.y, transform: 'translate(-50%,-50%)' }}>
            <span className={`absolute -top-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold shadow ${c.isMe ? 'bg-[#E0A526] text-white' : 'bg-white/90 text-[#1F2933]'}`}>
              {c.fx === 'stun' ? '📧 ' : c.fx === 'spin' ? '💫 ' : ''}{look.name}{c.fin !== null ? ' 🏁' : ''}
            </span>
            {c.fx === 'boost' && <span className="absolute -left-[30px] top-1/2 -translate-y-1/2 text-[16px]" style={{ animation: 'rc-shake 120ms linear infinite' }}>🔥</span>}
            <div className="flex items-center justify-center rounded-[9px] border-2 shadow-md"
              style={{
                width: KART_HX * 2 + 4, height: 24, background: look.palette.bg, borderColor: c.isMe ? '#E0A526' : '#FFFFFF',
                animation: c.fx === 'spin' ? 'rc-spin 300ms linear infinite' : c.fx === 'slip' ? 'rc-shake 90ms linear infinite' : undefined,
                opacity: c.fx === 'stun' ? 0.6 : 1,
              }}>
              <span className="text-[17px] leading-none" style={{ transform: 'scaleX(-1)' }}>🏎️</span>
            </div>
          </div>
        )
      })}
      {/* 날아가는 메일 */}
      {snap.mails.map(m => {
        const from = cars.find(c => c.id === m.from), to = cars.find(c => c.id === m.to)
        if (!from || !to) return null
        const p = Math.max(0, Math.min(1, (sn - m.sentAt) / MAIL_FLIGHT_MS))
        const x = sx(from.x + (to.x - from.x) * p), y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 50
        return <span key={m.id} className="pointer-events-none absolute text-[20px] leading-none" style={{ left: x, top: y, transform: 'translate(-50%,-50%)' }}>📧</span>
      })}

      </>)}

      {/* 위쪽 정보 */}
      <div className="absolute left-3 top-2 flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-black/50 text-[24px]" title="아이템(Space)">
          {rollingEmoji ?? (me.item ? ITEMS[me.item].emoji : '')}
        </div>
        <div className="text-white drop-shadow">
          <p className="text-[18px] font-black leading-none">{roster && phase !== 'lobby' ? `${myRank}/${cars.length}등` : '—'}</p>
          <p className="text-[10.5px] font-semibold opacity-90">{me.item ? `Space: ${ITEMS[me.item].name}` : '❓ 상자를 먹으면 아이템'}</p>
        </div>
      </div>
      <div className="absolute right-3 top-2 w-[360px]">
        <div className="relative h-[10px] rounded-full bg-black/40">
          {cars.map(c => (
            <span key={c.id} className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
              style={{ left: `${Math.max(0, Math.min(1, c.x / RACE_LEN)) * 100}%`, background: c.isMe ? '#E0A526' : L(c.id).palette.bg, zIndex: c.isMe ? 2 : 1 }} />
          ))}
          <span className="absolute -right-1 -top-[3px] text-[11px]">🏁</span>
        </div>
        <p className="mt-0.5 text-right text-[10.5px] font-semibold text-white/90">
          {phase === 'race' || phase === 'done' ? `⏱ ${(Math.max(0, me.finishedAt ?? t) / 1000).toFixed(1)}초` : ''} · {view === 'chase' ? '←→' : '↑↓'} 차선 · Space 아이템{isTouch() && view === 'top' ? ' (◀=위 ▶=아래)' : ''}
        </p>
      </div>

      {flash && wall - flash.at < 1200 && (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] text-center">
          <span className="rounded-full bg-[#FACC15] px-3 py-0.5 text-[13px] font-black text-[#1F2933]">{flash.text}</span>
        </div>
      )}

      {phase === 'lobby' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
          <p className="text-[20px] font-black">🏎 퇴근 레이싱 참가자 모집 중… {Math.max(0, Math.ceil((lobbyEnd - sn) / 1000))}초</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {joined.map(id => <span key={id} className="rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-[#1F2933]">{L(id).name}{id === hostId ? ' (방장)' : ''}</span>)}
          </div>
          <p className="text-[11.5px] text-white/80">운동장을 연 팀원에게 참가 버튼이 떠요 · 사람이 {CPU_FILL}명보다 적으면 🤖 CPU가 채워요</p>
        </div>
      )}
      {phase === 'count' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[64px] font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]">{Math.ceil(-t / 1000)}</span>
        </div>
      )}
      {phase === 'race' && t < 700 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[56px] font-black text-[#FACC15] drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]">GO!</span>
        </div>
      )}
      {phase === 'race' && me.finishedAt !== null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-[13px] font-bold text-white drop-shadow">🏁 완주! 다른 사람 기다리는 중…</div>
      )}
      {phase === 'done' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white">
          <p className="text-[30px]">{myRank === 1 ? '🏆' : myRank <= 3 ? '🎉' : '🏎'}</p>
          {order.map((c, i) => (
            <p key={c.id} className={`text-[14px] ${c.isMe ? 'font-black text-[#FDE68A]' : 'font-semibold'}`}>
              {i + 1}등 {L(c.id).name} {c.fin !== null ? `${(c.fin / 1000).toFixed(2)}초` : '(시간 초과)'}{quitIds.includes(c.id) ? ' · 나감' : ''}
            </p>
          ))}
        </div>
      )}
      {view === 'chase' && phase === 'race' && me.finishedAt === null && (() => {
        // 뒤가 안 보이니 경고로 알려 준다 — 날아오는 메일, 바로 뒤에 붙은 차
        const incoming = snap.mails.some(m => m.to === myId)
        const behind = cars.filter(c => !c.isMe && c.fin === null && c.x < me.x && me.x - c.x < 260).sort((a, b) => b.x - a.x)[0]
        return (
          <div className="pointer-events-none absolute inset-x-0 bottom-12 flex flex-col items-center gap-1">
            {incoming && <span className="rounded-full bg-[#DC2626] px-3 py-0.5 text-[13px] font-black text-white" style={{ animation: 'rc-shake 90ms linear infinite' }}>📧 메일 날아오는 중!</span>}
            {behind && <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold text-white">{behind.y < me.y - 12 ? '↖' : behind.y > me.y + 12 ? '↗' : '⬇'} 뒤에 {L(behind.id).name}</span>}
          </div>
        )
      })()}
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setView(v => (v === 'chase' ? 'top' : 'chase'))}
        className="absolute bottom-2 left-2 z-[1] rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#1F2933] hover:bg-white" title="V 키로도 바꿀 수 있어요">
        {view === 'chase' ? '🗺 위에서 보기' : '🎥 차 뒤에서 보기'} (V)
      </button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={quit}
        className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-[#1F2933] hover:bg-white">
        {phase === 'done' ? '운동장으로' : '그만하기'}
      </button>
      {!disabled(me, t) && phase === 'race' && me.v < 50 && t > 2000 && me.finishedAt === null && (
        <p className="absolute bottom-10 left-3 text-[11px] text-white/80">카트는 자동으로 달려요 — {view === 'chase' ? '←→' : '↑↓'}로 피하기만!</p>
      )}
    </div>
  )
}
