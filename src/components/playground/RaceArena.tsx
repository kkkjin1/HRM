'use client'

// 운동장 🏎 퇴근 레이싱 화면 — 운동장 무대 자리에 뜬다(대결 화면과 같은 방식, 별도 창 없음).
// 누가 레이스를 열면(open) 운동장을 연 팀원 누구나 참가(join) → 모집 시간이 끝나면 방장이 명단 확정(lock) → 3초 카운트 → 출발.
// 각자 자기 카트만 계산해서 위치를 방송(st)하고, CPU 카트는 방장 PC가 계산해서 같이 보낸다.
// 2026-11-05 통신량 줄이기(Supabase 무료 초당 100 한도): st는 레이스 전용 채널(race-레이스id, 참가자만)로,
//   매번이 아니라 조향·효과·아이템이 바뀔 때(최소 ST_MIN_MS 간격)와 ST_BEAT_MS마다만 보낸다.
//   받는 쪽은 마지막 위치 + 속도·조향(s) / CPU 목표 차선(tl)으로 앞으로 예측해서 그린다(predict). 새 소식이 오면 오차를 0.15초에 걸쳐 녹인다.
// 🍌 바나나(banana/pop)·📧 메일(mail)도 방송으로 모두에게 보인다. 메일 맞는 처리는 맞는 사람 PC(CPU면 방장)가 한다.
// 화면 = 차 뒤에서 따라가는 추격 시점(raceChase.ts) + 오른쪽 레이더(앞쪽을 위에서 본 띠). 위에서 보기는 2026-11-03 삭제(시점별 난이도 차이 없애기).
// 2026-11-05 레이스 중엔 운전석 1인칭(raceCockpit.ts, 차고 '실내'에서 꾸민 운전석) 고정 — V키 시점 전환은 같은 날 제거.
//   대신 모집 중엔 출발선 3D 쇼룸(race3d/Race3DStage, 카메라 360도), 카운트다운 동안 2D 카메라가 운전석으로 들어가고, 끝나면 3D 시상식.
//   WebGL이 안 되면 쇼룸 = 2D 추격 시점(SHOWROOM_CAM), 시상식 = 2D 단상(racePodium.ts).
// 키: ←→ 차선(↑↓는 2026-11-03 사용자 요청으로 뺌) · Space 아이템 — 레이스 중엔 이 컴포넌트가 먼저 잡아서 운동장 캐릭터는 안 움직인다. 터치 ◀ ▶도 같다.
// 차 모양 = 각자 차고(lib/raceGarage.ts)의 선호 구단 도색 + 산 부품. 끝나면 onFinish로 순위를 넘겨 🪙 코인을 받는다.
// 코스 = 시드로 고른 랜덤 코스(lib/raceCourses.ts, 40종 — 배경 테마 + 장애물 구성 + 커브·갈림길). 시드가 같으니 모두 같은 코스를 달린다.
// ❓ 상자는 줄마다 참가 인원만큼만 있고, 누가 먹으면 방송(box)해서 모두의 화면에서 사라진다 — 앞사람과 같은 길이면 못 먹는다.

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useWebGL } from '@/components/baseball/three/webgl'
import { H, W } from '@/lib/playground'
import { drawChase, drawRadar, type ChaseCam, type ChaseCar } from '@/components/playground/raceChase'
import { PODIUM, PODIUM_GROUND, drawPodium } from '@/components/playground/racePodium'
import { BASIC_CAR, type CarLook } from '@/lib/raceGarage'
import {
  COUNTDOWN_MS, ITEMS, MAIL_FLIGHT_MS, RACE_PROTO, REMOTE_LOOSE, lenOf, timeoutOf,
  HAZ, NOTICE_STUN_MS, bananaDrop, bump, type BumpOther, cpuSteer, disabled, fireItem, hitByMail, kartStep, mailTarget, newCpu, newKart, noticeTarget, ranking, rng, startGrid,
  type Banana, type CpuMem, type Item, type Kart,
} from '@/lib/race'
import { courseOf, courseTags, roadOf, themeOf, trackOf } from '@/lib/raceCourses'
import { useSideChannel } from '@/lib/useSideChannel'
import { COCKPIT_CAM, COCKPIT_RADAR, drawCockpit } from '@/components/playground/raceCockpit'
import { defaultEquip, type Equip } from '@/lib/raceInterior'
import { ST_BEAT_MS, ST_MIN_MS, predict, type Fx, type Remote, type StItem } from '@/lib/raceNet'
import { LANE_Y } from '@/lib/race'
import { rideOf, rideOffset, specOf } from '@/lib/raceCars'

type Look = { name: string; palette: { bg: string; fg: string }; car: CarLook }
export type RaceMsg =
  | { type: 'open'; rid: string; host: string; seed: number; startAt: number; v?: number } // v = RACE_PROTO(옛 화면은 없음)
  | { type: 'join'; rid: string; id: string; v?: number }
  | { type: 'lock'; rid: string; roster: string[]; cpus: number }
  | { type: 'st'; rid: string; list: StItem[]; v?: number }
  | { type: 'banana'; rid: string; b: Banana }
  | { type: 'box'; rid: string; id: number }
  | { type: 'pop'; rid: string; bid: string }
  | { type: 'mail'; rid: string; from: string; to: string; at: number; kind?: 'notice' } // kind = 📢 전체 공지(1등, 더 오래 멈춤)
  | { type: 'bye'; rid: string; id: string }

const STEP_MS = 1000 / 60
const CPU_FILL = 4 // 사람이 이보다 적으면 CPU로 채운다
// 사람이 모두 들어오면(또는 나가면) CPU는 이만큼만 더 기다리고 끝낸다 — 방장이 나가거나 탭을 내리면 CPU가 멈춰서
// 꼴찌 CPU를 110초 동안 기다리던 버그(2026-11-05). 못 들어온 CPU는 달린 거리 순으로 '미완주'.
const CPU_GRACE_MS = 3000
const STALE_MS = 10_000 // 이만큼 위치 소식이 없는 사람은 나간 걸로 본다(창 닫힘·끊김). 4초는 잠깐 끊겨도 '나감'이 돼서 늘림(2026-11-05)
const CPU_LOOKS: Look[] = [
  // CPU도 차종이 다르다(2026-11-10) — 세단·스포츠카·SUV
  { name: '🤖 야근봇', palette: { bg: '#9CA3AF', fg: '#1F2937' }, car: { ...BASIC_CAR, team: 'kt', exhaust: 'own', body: 'sedan' } },
  { name: '🤖 결재봇', palette: { bg: '#9CA3AF', fg: '#1F2937' }, car: { ...BASIC_CAR, team: 'lotte', wheels: 'own', body: 'sport' } },
  { name: '🤖 회의봇', palette: { bg: '#9CA3AF', fg: '#1F2937' }, car: { ...BASIC_CAR, team: 'nc', flag: 'own', body: 'suv' } },
]
const lookAt = (id: string, lookOf: (id: string) => Look) => (id.startsWith('cpu') ? CPU_LOOKS[Number(id.slice(3)) % CPU_LOOKS.length] : lookOf(id))
// 모집 중 쇼룸 카메라 — 출발선에 선 차들을 뒤에서 조금 높이(외관이 잘 보이게). 카운트다운 동안 COCKPIT_CAM으로 옮겨 간다.
const SHOWROOM_CAM: ChaseCam = { back: 180, h: 80, follow: 0.5, horizon: 0.3, focal: 410 }
// 3D 쇼룸·시상식(three.js) — 이 화면을 열 때만 받는다. WebGL이 안 되면 2D 그림 그대로
const Race3DStage = dynamic(() => import('@/components/playground/race3d/Race3DStage'), { ssr: false })
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
// 🏎 속도선(쿠페·스포츠카·슈퍼카 승차감) — 소실점에서 화면 가장자리로 뻗는 흰 줄. k = 세기(0~1)
function drawSpeedLines(ctx: CanvasRenderingContext2D, k: number, wall: number, hy: number) {
  if (k <= 0) return
  const cx = W / 2
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + 0.13 * i
    const ph = (wall / 260 + i * 0.37) % 1 // 0 → 1 바깥으로 흐른다
    const r0 = 150 + ph * 420, r1 = r0 + 40 + 70 * ph
    const dx = Math.cos(a), dy = Math.sin(a) * 0.55
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.32 * k * (0.3 + ph)).toFixed(3) + ')'
    ctx.lineWidth = 1 + 1.6 * ph
    ctx.beginPath(); ctx.moveTo(cx + dx * r0, hy + dy * r0); ctx.lineTo(cx + dx * r1, hy + dy * r1); ctx.stroke()
  }
  ctx.restore()
}

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
  onFinish: (rank: number, humans: number) => void // 내 순위(미완주 0)·사람 수 — 코인 받기
  interior?: Equip // 내 운전석 꾸미기(운전석 시점에서만 보임)
  onClose: () => void
}) {
  const { rid, seed, startAt, hostId, myId, solo } = props
  const isHost = hostId === myId
  const gl = useWebGL() // 3D 쇼룸·시상식을 쓸 수 있는지
  const lobbyEnd = startAt - COUNTDOWN_MS
  const course = useMemo(() => courseOf(seed), [seed])
  const theme = themeOf(course)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })

  const [joined, setJoined] = useState<string[]>(() => [hostId, ...(hostId === myId ? [] : [myId])])
  const joinedRef = useRef(joined)
  const [roster, setRoster] = useState<string[] | null>(solo ? [myId, 'cpu0', 'cpu1', 'cpu2'] : null)
  const rosterRef = useRef(roster)
  useEffect(() => { rosterRef.current = roster }, [roster])
  const road = useMemo(() => roadOf(seed, course), [seed, course])
  const boxes = roster?.length ?? 4
  const track = useMemo(() => trackOf(seed, course, boxes), [seed, course, boxes])
  const raceLen = lenOf(road)
  const timeoutMs = timeoutOf(raceLen)
  const goneRef = useRef(new Set<number>()) // 누군가 먹은 상자 id(모두 같이)

  const meRef = useRef<Kart>(newKart(0))
  const remoteRef = useRef(new Map<string, Remote>())
  const cpuRef = useRef(new Map<string, { k: Kart; mem: CpuMem }>())
  const bananasRef = useRef<Banana[]>([])
  const mailsRef = useRef<{ id: string; from: string; to: string; at: number; sentAt: number; kind?: 'notice' }[]>([])
  const keys = useRef({ up: false, down: false, useSeq: 0 })
  const steerVis = useRef(0) // 운전석 핸들이 부드럽게 따라 돌게
  const randRef = useRef(rng(seed ^ 0x5bd1e995)) // 아이템 뽑기·CPU 판단용(레이스마다 다름)
  const endedRef = useRef(false)
  // 화면은 매 프레임 찍어 둔 스냅샷으로만 그린다(그리는 중에 ref를 읽지 않게)
  type Snap = { sn: number; wall: number; me: Kart; cpus: Map<string, Kart>; remote: Map<string, Remote>; bananas: Banana[]; mails: typeof mailsRef.current; ended: boolean; gone: ReadonlySet<number> }
  const [snap, setSnap] = useState<Snap>(() => ({ sn: 0, wall: 0, me: newKart(0), cpus: new Map(), remote: new Map(), bananas: [], mails: [], ended: false, gone: new Set() }))
  const [flash, setFlash] = useState<{ text: string; at: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hitAt, setHitAt] = useState(0) // 화면 흔들기
  const [quitIds, setQuitIds] = useState<string[]>([])
  const quitRef = useRef(new Set<string>())
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
    if (!solo && !isHost) propsRef.current.send({ type: 'join', rid, id: myId, v: RACE_PROTO })
  }, [rid, myId, isHost, solo])

  // 위치 소식 받기 — 예측과 어긋난 만큼은 잠깐 남겨서(cx·cy) 툭 튀지 않게
  const takeSt = (list: StItem[], v: number | undefined) => {
    if (v !== RACE_PROTO) return // 새로고침 안 한(다른 버전) 화면 — 결승선·코스가 달라 섞으면 순위가 엉킨다
    const wall = Date.now()
    const missing: string[] = []
    for (const r of list) {
      if (r.id === myId) continue
      const ro = rosterRef.current
      if (ro && !ro.includes(r.id) && !r.id.startsWith('cpu')) missing.push(r.id)
      const old = remoteRef.current.get(r.id)
      let cx = 0, cy = 0
      if (old) { const p = predict(old, wall); cx = p.x - r.x; cy = p.y - r.y; if (Math.abs(cx) > 160 || Math.abs(cy) > 60) { cx = 0; cy = 0 } }
      remoteRef.current.set(r.id, { ...r, at: wall, cx, cy })
    }
    // 방장의 명단 확정(lock)을 놓쳤거나 늦게 들어온 사람 — 달리고 있는 게 보이면 명단에 넣는다(안 넣으면 순위·끝내기에서 빠진다)
    if (missing.length && rosterRef.current) { const next = [...rosterRef.current, ...missing]; rosterRef.current = next; setRoster(next) }
  }
  const sendSt = useSideChannel<{ list: StItem[]; v: number }>(solo ? null : `race-${rid}`, 'st', m => takeSt(m.list, m.v),
    m => propsRef.current.send({ type: 'st', rid, list: m.list, v: m.v })) // 전용 채널이 아직·잠깐 안 붙었으면 운동장 채널로

  // 메시지 받기
  useEffect(() => {
    props.listen(msg => {
      if (msg.rid !== rid) return
      if (msg.type === 'join') {
        if (msg.v !== RACE_PROTO) return // 다른 버전 화면은 명단에 안 넣는다
        if (!joinedRef.current.includes(msg.id) && now() < lobbyEnd) { joinedRef.current = [...joinedRef.current, msg.id]; setJoined(joinedRef.current) }
      } else if (msg.type === 'lock') {
        if (!isHost) setRoster([...msg.roster, ...Array.from({ length: msg.cpus }, (_, i) => `cpu${i}`)])
      } else if (msg.type === 'st') {
        takeSt(msg.list, msg.v) // 전용 채널이 안 붙은 사람이 운동장 채널로 보낸 것
      } else if (msg.type === 'banana') {
        bananasRef.current = [...bananasRef.current, msg.b]
      } else if (msg.type === 'box') {
        goneRef.current.add(msg.id)
      } else if (msg.type === 'pop') {
        bananasRef.current = bananasRef.current.filter(b => b.id !== msg.bid)
      } else if (msg.type === 'mail') {
        mailsRef.current = [...mailsRef.current, { id: `${msg.from}-${msg.at}`, from: msg.from, to: msg.to, at: msg.at, sentAt: msg.at - MAIL_FLIGHT_MS, kind: msg.kind }]
      } else if (msg.type === 'bye') {
        quitRef.current.add(msg.id)
        setQuitIds(q => (q.includes(msg.id) ? q : [...q, msg.id]))
      }
    })
    return () => props.listen(null)
    // listen은 부모가 안정적으로 넘긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, myId, isHost, lobbyEnd])

  // 키
  useEffect(() => {
    const dirOf = (e: KeyboardEvent): 'up' | 'down' | null => {
      // ←→ = 차선(왼쪽 = 도로 위쪽 차선). 터치 기기는 ◀ ▶ 버튼이 같은 키를 보낸다
      if (e.key === 'ArrowLeft') return 'up'
      if (e.key === 'ArrowRight') return 'down'
      return null
    }
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const d = dirOf(e)
      const isAct = e.code === 'Space' || e.key === ' '
      if (!d && !isAct) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (d) keys.current[d] = true
      else if (isAct) keys.current.useSeq++
    }
    function up(e: KeyboardEvent) {
      const d = dirOf(e)
      if (!d) return
      e.stopImmediatePropagation()
      keys.current[d] = false
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
    let lastSig = ''
    let mySteer: -1 | 0 | 1 = 0
    let forceSt = false // 차끼리 부딪혔을 때 — 위치가 예측과 달라졌으니 곧바로 알린다
    let seenUse = 0
    let locked = !!rosterRef.current
    let humansDoneAt: number | null = null
    const say = (text: string) => setFlash({ text, at: Date.now() })
    const allRacers = () => {
      const r = rosterRef.current ?? []
      return r.map(id => {
        if (id === myId) return { id, x: meRef.current.x, finishedAt: meRef.current.finishedAt }
        const c = cpuRef.current.get(id)
        if (c) return { id, x: c.k.x, finishedAt: c.k.finishedAt }
        const rm = remoteRef.current.get(id)
        return { id, x: rm ? predict(rm, Date.now()).x : 0, finishedAt: rm?.fin ?? null }
      })
    }
    const dropBanana = (owner: string, k: Kart, kind?: 'hurdle') => {
      const b: Banana = { id: `${owner}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, ...bananaDrop(k), owner, ...(kind ? { kind } : {}) }
      bananasRef.current = [...bananasRef.current, b]
      if (!solo) propsRef.current.send({ type: 'banana', rid, b })
    }
    const targetOf = (from: string, notice: boolean) => {
      const list = allRacers().map(r => ({ id: r.id, x: r.x, done: r.finishedAt !== null }))
      return notice ? noticeTarget(from, list) : mailTarget(from, list)
    }
    const sendMail = (from: string, t: number, kind?: 'notice') => {
      const to = targetOf(from, kind === 'notice')
      if (!to) return
      const at = now() + MAIL_FLIGHT_MS
      mailsRef.current = [...mailsRef.current, { id: `${from}-${at}`, from, to, at, sentAt: at - MAIL_FLIGHT_MS, kind }]
      if (!solo) propsRef.current.send({ type: 'mail', rid, from, to, at, kind })
      void t
    }
    const takeBox = (id: number) => {
      goneRef.current.add(id)
      if (!solo) propsRef.current.send({ type: 'box', rid, id })
    }
    const popBanana = (bid: string) => {
      bananasRef.current = bananasRef.current.filter(b => b.id !== bid)
      if (!solo) propsRef.current.send({ type: 'pop', rid, bid })
    }
    const fxOf = (k: Kart, t: number): Fx => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : t < k.shieldUntil ? 'shield' : '')

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
          mySteer = steer
          const opts = { road, gone: goneRef.current }
          const bodyOf = (id: string) => lookAt(id, propsRef.current.lookOf).car.body // 차종 — 성능(spec)·무게(mass)
          const mySpec = specOf(bodyOf(myId))
          const res = kartStep(meRef.current, steer, t, STEP_MS, track, bananasRef.current, rankOf(myId), total, randRef.current, { ...opts, spec: mySpec })
          let me = res.k
          for (const e of res.events) {
            if ((e.type === 'spin' && !e.blocked) || e.type === 'slip' || e.type === 'slow') setHitAt(Date.now())
            if (e.type === 'spin' && e.blocked) { if (e.bananaId) popBanana(e.bananaId) }
            else if (e.type === 'spin') { say(e.by === 'banana' ? '🍌 바나나 밟았다!' : HAZ[e.by].msg); if (e.bananaId) popBanana(e.bananaId) }
            else if (e.type === 'block') say('🛡️ 결재 도장으로 막았다!')
            else if (e.type === 'slow' && e.by === 'hurdle') { say('🏃 허들에 걸렸다! 덜컹 감속'); if (e.bananaId) popBanana(e.bananaId) }
            else if (e.type === 'slip' || e.type === 'slow') say(HAZ[e.by as keyof typeof HAZ].msg)
            else if (e.type === 'pad') say('⏩ 부스터!')
            else if (e.type === 'box') takeBox(e.id)
            else if (e.type === 'shortcut') say('⚡ 지름길! 잘 피하면 빨라져요')
            else if (e.type === 'finish') say(`🏁 완주! ${(t / 1000).toFixed(2)}초`)
          }
          if (kk.useSeq !== seenUse) {
            seenUse = kk.useSeq
            // 📧·📢는 앞사람이 있어야 쓴다 — 1등이면 안 쓰고 그대로 들고 있음
            const noTarget = (me.item === 'mail' || me.item === 'notice') && targetOf(myId, me.item === 'notice') === null
            if (noTarget) say(me.item === 'mail' ? '📧 1등이라 보낼 앞사람이 없어요 — 추월당하면 써요' : '📢 내가 1등이라 공지를 보낼 상대가 없어요')
            const u = noTarget ? { k: me, used: null } : fireItem(me, t, mySpec)
            me = u.k
            if (u.used === 'banana') dropBanana(myId, me)
            else if (u.used === 'hurdle') { dropBanana(myId, me, 'hurdle'); say(me.charges > 0 ? `🏃 허들 설치! 남은 ${me.charges}개` : '🏃 마지막 허들!') }
            else if (u.used === 'mail') sendMail(myId, t)
            else if (u.used === 'notice') { sendMail(myId, t, 'notice'); say('📢 전체 공지 발송 — 1등 멈춰!') }
            else if (u.used === 'shield') say('🛡️ 결재 도장! 3초 동안 한 번 막아요')
            else if (u.used === 'rocket') say('🚀 부스터 발사!')
          }
          // 💥 차끼리 부딪힘 — 내 화면에 보이는 다른 차(사람은 예측 위치, CPU는 방장이면 실제 위치)
          const wallNow = Date.now()
          const others = (exceptId: string): BumpOther[] => {
            const out: BumpOther[] = []
            if (exceptId !== myId && me.finishedAt === null && t >= me.spinUntil) out.push({ x: me.x, y: me.y, v: me.v, boost: t < me.boostUntil, heavy: t < me.shieldUntil, mass: mySpec.mass })
            for (const [id, c] of cpuRef.current) {
              if (id === exceptId || c.k.finishedAt !== null || t < c.k.spinUntil) continue
              out.push({ x: c.k.x, y: c.k.y, v: c.k.v, boost: t < c.k.boostUntil, heavy: t < c.k.shieldUntil, mass: specOf(bodyOf(id)).mass })
            }
            for (const [id, r] of remoteRef.current) {
              if (id === exceptId || r.fin !== null || r.fx === 'spin' || (cpuRef.current.has(id))) continue
              if (wallNow - r.at > STALE_MS) continue
              const p = predict(r, wallNow)
              out.push({ x: p.x, y: p.y, v: r.v, boost: r.fx === 'boost', heavy: r.fx === 'shield', loose: REMOTE_LOOSE, mass: specOf(bodyOf(id)).mass })
            }
            return out
          }
          {
            const b = bump(me, others(myId), t, road, mySpec.mass)
            if (b.k !== me) forceSt = true
            me = b.k
            if (b.ev === 'ram') { setHitAt(Date.now()); say('💥 부스터 차에 들이받혔다!') }
            else if (b.ev === 'rear') say('💥 쿵! 앞차에 막혔다')
            else if (b.ev === 'side') say('💥 쿵!')
            else if (b.ev === 'held') say('🛡️ 도장 차는 안 밀려요')
          }
          meRef.current = me
          // CPU(방장만)
          if (isHost) {
            for (const [id, c] of cpuRef.current) {
              const cs = cpuSteer(c.k, c.mem, t, track, bananasRef.current, randRef.current, opts)
              const cSpec = specOf(bodyOf(id))
              const r = kartStep(c.k, cs.steer, t, STEP_MS, track, bananasRef.current, rankOf(id), total, randRef.current, { ...opts, spec: cSpec })
              let ck = r.k
              for (const e of r.events) { if ((e.type === 'spin' || e.type === 'slow') && e.bananaId) popBanana(e.bananaId); if (e.type === 'box') takeBox(e.id) }
              if (cs.use && !((ck.item === 'mail' || ck.item === 'notice') && targetOf(id, ck.item === 'notice') === null)) {
                const u = fireItem(ck, t, cSpec)
                ck = u.k
                if (u.used === 'banana') dropBanana(id, ck)
                else if (u.used === 'hurdle') dropBanana(id, ck, 'hurdle')
                else if (u.used === 'mail') sendMail(id, t)
                else if (u.used === 'notice') sendMail(id, t, 'notice')
              }
              c.k = ck
            }
            for (const [id, c] of cpuRef.current) {
              const b = bump(c.k, others(id), t, road, specOf(bodyOf(id)).mass)
              if (b.k !== c.k) forceSt = true
              c.k = b.k
            }
          }
          // 날아온 메일 도착 — 맞는 사람 PC(CPU면 방장)가 처리
          const arrived = mailsRef.current.filter(m => sn >= m.at)
          if (arrived.length) {
            mailsRef.current = mailsRef.current.filter(m => sn < m.at)
            for (const m of arrived) {
              const ms = m.kind === 'notice' ? NOTICE_STUN_MS : undefined
              if (m.to === myId && meRef.current.finishedAt === null) {
                const h = hitByMail(meRef.current, t, ms)
                meRef.current = h.k
                const who = lookAt(m.from, propsRef.current.lookOf).name
                if (h.blocked) say('🛡️ 결재 도장으로 막았다!')
                else { setHitAt(Date.now()); say(m.kind === 'notice' ? `📢 ${who}님의 전체 공지! 1등 정지` : `📧 ${who}님의 긴급 메일! 멈춤`) }
              }
              const c = isHost ? cpuRef.current.get(m.to) : undefined
              if (c && c.k.finishedAt === null) c.k = hitByMail(c.k, t, ms).k
            }
          }
        }
        // 방송
        const t = now() - startAt
        if (!solo) {
          const mk = (id: string, k: Kart, extra: { s?: -1 | 0 | 1; tl?: number }): StItem => ({ id, x: Math.round(k.x), y: Math.round(k.y), v: Math.round(k.v), fx: fxOf(k, t), fin: k.finishedAt, item: k.item, ...extra })
          const list = [mk(myId, meRef.current, { s: mySteer })]
          if (isHost) for (const [id, c] of cpuRef.current) list.push(mk(id, c.k, { tl: Math.round(LANE_Y[c.mem.target]) }))
          // 바뀐 게 있나(위치·속도 빼고 — 그건 예측으로 따라간다)
          const sig = list.map(r => `${r.s ?? ''}${r.tl ?? ''}${r.fx}${r.item ?? ''}${r.fin ?? ''}`).join('|')
          const since = Date.now() - lastSent
          if (((sig !== lastSig || forceSt) && since >= ST_MIN_MS) || since >= ST_BEAT_MS) {
            lastSent = Date.now(); lastSig = sig; forceSt = false
            sendSt({ list, v: RACE_PROTO })
          }
        }
        // 끝: 모두 완주 / 시간 초과 / 사람이 다 들어오고(나가고) CPU_GRACE_MS 지남
        const racers = allRacers()
        const humanLeft = racers.some(r => {
          if (r.id.startsWith('cpu') || r.finishedAt !== null || quitRef.current.has(r.id)) return false
          if (r.id === myId) return true
          const rm = remoteRef.current.get(r.id)
          if (!rm) return t < STALE_MS // 출발 직후 아직 소식이 없는 건 기다린다
          return Date.now() - rm.at < STALE_MS // 소식이 끊긴 사람은 기다리지 않는다
        })
        if (t > 0 && !humanLeft && humansDoneAt === null) humansDoneAt = t
        const over = t > timeoutMs || (t > 0 && racers.every(r => r.finishedAt !== null)) || (humansDoneAt !== null && t - humansDoneAt > CPU_GRACE_MS)
        if (over && !endedRef.current) {
          endedRef.current = true
          const ord = ranking(racers)
          const L = (id: string) => lookAt(id, propsRef.current.lookOf)
          const top = ord.slice(0, 3).map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${L(r.id).name}${r.finishedAt !== null ? ` ${(r.finishedAt / 1000).toFixed(1)}초` : ''}`).join(' · ')
          if (isHost || solo) propsRef.current.onEnd(`🏎 퇴근 레이싱(${course.name}) 결과 — ${top}`)
          // 🪙 코인: 명단에 있던 사람만(구경꾼 제외)
          if (roster.includes(myId)) {
            const mine = ord.findIndex(r => r.id === myId)
            const humans = roster.filter(id => !id.startsWith('cpu')).length
            propsRef.current.onFinish(meRef.current.finishedAt !== null ? mine + 1 : 0, humans)
          }
        }
      } else acc = 0
      setSnap({
        sn: now(), wall: Date.now(), me: meRef.current, cpus: new Map([...cpuRef.current].map(([id, c]) => [id, c.k])),
        remote: new Map(remoteRef.current), bananas: bananasRef.current, mails: mailsRef.current, ended: endedRef.current, gone: new Set(goneRef.current),
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rid, startAt, lobbyEnd, isHost, myId, solo, track, course, road, sendSt, timeoutMs])

  // 추격 시점 그리기 — 스냅샷이 바뀔 때마다(매 프레임)
  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const t = snap.sn - startAt
    const me = snap.me
    const fx = (k: Kart): ChaseCar['fx'] => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : t < k.shieldUntil ? 'shield' : '')
    const lobby = !rosterRef.current || snap.sn < lobbyEnd
    // 모집 중 = 참가한 사람 차를 출발 자리에 세워 둔 쇼룸(뒤에서 본 외관)
    if (lobby) {
      const js = rosterRef.current ?? (joined.length ? joined : [myId]) // 혼자 하기는 명단(CPU 포함)이 처음부터 있다
      const mine = startGrid(Math.max(0, js.indexOf(myId)))
      const cars: ChaseCar[] = js.map((id, i) => {
        const look = lookAt(id, propsRef.current.lookOf)
        const g = startGrid(i)
        return { id, name: id === myId ? `${look.name} (나)` : look.name, color: look.palette.bg, car: look.car, x: g.x, y: g.y, fx: '', fin: null, isMe: false }
      })
      drawChase(ctx, { w: W, h: H, me: { x: mine.x, y: mine.y, v: 0, fx: '' }, cars, mails: [], bananas: [], wall: snap.wall, things: track.filter(th => th.x > 260), shake: 0, t: 0, theme, road, cam: SHOWROOM_CAM })
      return
    }
    const ids = rosterRef.current ?? [myId]
    const cars: ChaseCar[] = ids.map(id => {
      const look = lookAt(id, propsRef.current.lookOf)
      const base = { id, name: look.name, color: look.palette.bg, car: look.car }
      if (id === myId) return { ...base, x: me.x, y: me.y, fx: fx(me), fin: me.finishedAt, isMe: true }
      const c = snap.cpus.get(id)
      if (c) return { ...base, x: c.x, y: c.y, fx: fx(c), fin: c.finishedAt, isMe: false }
      const r = snap.remote.get(id)
      if (!r) { const g = newKart(Math.max(0, ids.indexOf(id))); return { ...base, x: g.x, y: g.y, fx: '', fin: null, isMe: false } }
      const p = predict(r, snap.wall) // 받은 뒤 지난 시간만큼 앞으로 예측
      return { ...base, x: p.x, y: p.y, fx: r.fx, fin: r.fin, isMe: false }
    })
    const mails = snap.mails.flatMap(m => {
      const a = cars.find(c => c.id === m.from), b = cars.find(c => c.id === m.to)
      if (!a || !b) return []
      const p = Math.max(0, Math.min(1, (snap.sn - m.sentAt) / MAIL_FLIGHT_MS))
      return [{ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, h: Math.sin(p * Math.PI) * (m.kind === 'notice' ? 120 : 60), e: m.kind === 'notice' ? '📢' : '📧' }]
    })
    // 🪑 승차감(차종) — 눈높이·시야·진동·출렁임·속도선(lib/raceCars.ts CarRide). 판정과는 무관, 내 화면만
    const myCar = lookAt(myId, propsRef.current.lookOf).car
    const ride = rideOf(myCar.body)
    const speed01 = me.v / Math.max(1, specOf(myCar.body).vMax)
    const scene = {
      w: W, h: H, me: { x: me.x, y: me.y, v: me.v, fx: fx(me) }, cars, mails, bananas: snap.bananas, wall: snap.wall,
      things: track.filter(th => !(th.kind === 'box' && snap.gone.has(th.id))),
      shake: Math.min(1.6, Math.max(0, 1 - (snap.wall - hitAt) / 400) * ride.hitShake),
      t, theme, road,
    }
    const order = ranking(cars.map(c => ({ ...c, finishedAt: c.fin })))
    // 시상식 — 1·2·3등 차를 단상 위에
    if (snap.ended) {
      drawPodium(ctx, W, H, theme, order.slice(0, 3), snap.wall)
      return
    }
    // 카운트다운 = 쇼룸 카메라에서 운전석으로 빨려 들어간다(앞 2.2초), 대시보드는 아래에서 올라온다
    const p = t < 0 ? ease(Math.min(1, Math.max(0, (t + COUNTDOWN_MS) / 2200))) : 1
    // 차종 운전석 카메라 — 눈높이(camH), 최고속에서 시야가 넓어짐(fovKick)
    const drive: ChaseCam = { ...COCKPIT_CAM, h: ride.camH, focal: ride.focal - ride.fovKick * Math.max(0, Math.min(1, (speed01 - 0.6) / 0.4)) }
    const cam: ChaseCam = p >= 1 ? drive : {
      back: lerp(SHOWROOM_CAM.back, drive.back, p), h: lerp(SHOWROOM_CAM.h, drive.h, p),
      follow: lerp(SHOWROOM_CAM.follow, drive.follow, p), horizon: lerp(SHOWROOM_CAM.horizon, drive.horizon, p),
      focal: lerp(SHOWROOM_CAM.focal ?? 410, drive.focal ?? 330, p),
      hideMe: lerp(SHOWROOM_CAM.back, drive.back, p) < 70, carMaxSc: 4,
    }
    const sc = { ...scene, cam }
    // 노면 진동·출렁임 — 바깥 풍경은 그대로 흔들고(가장자리가 비지 않게 살짝 키움), 대시보드는 절반만(머리가 따라 움직이는 느낌)
    const rk = p >= 1 && t >= 0 ? rideOffset(ride, snap.wall, speed01) : { x: 0, y: 0, roll: 0 }
    ctx.save()
    ctx.translate(W / 2 + rk.x, H / 2 + rk.y); ctx.rotate(rk.roll); ctx.scale(1.02, 1.02); ctx.translate(-W / 2, -H / 2)
    drawChase(ctx, sc)
    ctx.restore()
    if (p >= 1 && ride.lines > 0 && speed01 > 0.6) drawSpeedLines(ctx, ride.lines * Math.min(1, (speed01 - 0.6) / 0.35), snap.wall, COCKPIT_CAM.horizon * H)
    const kk = keys.current
    // 핸들 반응 — 핸들링 좋은 차는 빨리, 무거운 차(슈퍼카·SUV)는 천천히 돈다
    steerVis.current += ((kk.down ? 1 : 0) - (kk.up ? 1 : 0) - steerVis.current) * 0.15 * (specOf(myCar.body).steer / 230)
    const rise = p >= 1 ? 0 : Math.max(0, 1 - (p - 0.55) / 0.45) * H * 0.6 // 대시보드가 올라오는 거리
    if (p > 0.55) {
      ctx.save(); ctx.translate(rk.x * 0.5, rise + rk.y * 0.5)
      drawCockpit(ctx, propsRef.current.interior ?? defaultEquip(), {
        me: { x: me.x, y: me.y, v: me.v, item: me.item }, steer: steerVis.current,
        others: cars.filter(c => !c.isMe).map(c => ({ x: c.x, y: c.y, color: c.color })),
        rank: Math.max(1, order.findIndex(c => c.isMe) + 1), total: cars.length, wall: snap.wall,
      }, null, ride)
      ctx.restore()
    }
    if (p >= 1) drawRadar(ctx, COCKPIT_RADAR.x, COCKPIT_RADAR.y, COCKPIT_RADAR.w, COCKPIT_RADAR.h, sc)
  }, [snap, startAt, lobbyEnd, joined, myId, track, hitAt, theme, road])

  const quit = () => {
    if (!solo) props.send({ type: 'bye', rid, id: myId })
    props.onClose()
  }

  // ── 그리기 ──
  const { sn, wall } = snap
  const t = sn - startAt
  const me = snap.me
  const fxOf = (k: Kart): Fx => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : t < k.shieldUntil ? 'shield' : '')
  type Car = { id: string; x: number; y: number; fx: Fx; fin: number | null; isMe: boolean }
  const cars: Car[] = []
  if (roster) {
    for (const id of roster) {
      if (id === myId) cars.push({ id, x: me.x, y: me.y, fx: fxOf(me), fin: me.finishedAt, isMe: true })
      else if (snap.cpus.has(id)) { const c = snap.cpus.get(id)!; cars.push({ id, x: c.x, y: c.y, fx: fxOf(c), fin: c.finishedAt, isMe: false }) }
      else {
        const r = snap.remote.get(id)
        if (!r) { const g = newKart(roster.indexOf(id)); cars.push({ id, x: g.x, y: g.y, fx: '', fin: null, isMe: false }); continue }
        const p = predict(r, wall)
        cars.push({ id, x: p.x, y: p.y, fx: r.fx, fin: r.fin, isMe: false })
      }
    }
  }
  const order = ranking(cars.map(c => ({ ...c, finishedAt: c.fin })))
  const myRank = order.findIndex(c => c.isMe) + 1
  const L = (id: string) => lookAt(id, props.lookOf)
  const phase = !roster || sn < lobbyEnd ? 'lobby' : t < 0 ? 'count' : snap.ended ? 'done' : 'race'
  const ITEM_KEYS = Object.keys(ITEMS) as Item[]
  const rollingEmoji = me.rolling ? ITEMS[ITEM_KEYS[Math.floor(wall / 90) % ITEM_KEYS.length]].emoji : null

  return (
    <div className="absolute inset-0 z-[45] overflow-hidden" style={{ background: theme.bg }}>
      <style>{`@keyframes rc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes rc-shake{0%,100%{transform:translateX(0)}50%{transform:translateX(2px)}}`}</style>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: W, height: H }} aria-label="레이스 화면" />
      {/* 모집 중 3D 쇼룸 — 카메라가 출발선 차들 주위를 돌다가 모집이 끝나는 순간 차들 바로 뒤(= 2D 카운트다운 첫 화면)에 온다 */}
      {phase === 'lobby' && gl && (
        <Race3DStage mode="showroom" theme={theme} width={W} height={H} endAt={lobbyEnd - props.offset}
          cars={(roster ?? joined).map(id => ({ id, car: L(id).car, color: L(id).palette.bg, label: id === myId ? `${L(id).name} (나)` : L(id).name, me: id === myId }))} />
      )}
      {phase === 'race' && <span className="pointer-events-none absolute text-[9.5px] font-bold text-white/85" style={{ left: COCKPIT_RADAR.x - 8, top: COCKPIT_RADAR.y + COCKPIT_RADAR.h + 2 }}>📡 앞 레이더</span>}

      {/* 위쪽 정보(모집·시상식 땐 숨김) */}
      {(phase === 'count' || phase === 'race') && <>
      <div className="absolute left-3 top-2 flex items-center gap-2">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-black/50 text-[24px]" title="아이템(Space)">
          {rollingEmoji ?? (me.item ? ITEMS[me.item].emoji : t < me.shieldUntil ? '🛡️' : '')}
          {!rollingEmoji && me.item === 'hurdle' && <span className="absolute -bottom-1 -right-1 rounded-full bg-[#FACC15] px-1 text-[10px] font-black text-[#0F172A]">×{me.charges}</span>}
        </div>
        <div className="text-white drop-shadow">
          <p className="text-[18px] font-black leading-none">{roster ? `${myRank}/${cars.length}등` : '—'}</p>
          <p className="text-[10.5px] font-semibold opacity-90">{me.item ? `Space: ${ITEMS[me.item].name}` : '❓ 상자를 먹으면 아이템'}</p>
        </div>
      </div>
      <div className="absolute right-3 top-2 w-[360px]">
        <div className="relative h-[10px] rounded-full bg-black/40">
          {cars.map(c => (
            <span key={c.id} className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
              style={{ left: `${Math.max(0, Math.min(1, c.x / raceLen)) * 100}%`, background: c.isMe ? '#E0A526' : L(c.id).palette.bg, zIndex: c.isMe ? 2 : 1 }} />
          ))}
          <span className="absolute -right-1 -top-[3px] text-[11px]">🏁</span>
        </div>
        <p className="mt-0.5 text-right text-[10.5px] font-semibold text-white/90">
          {phase === 'race' ? `⏱ ${(Math.max(0, me.finishedAt ?? t) / 1000).toFixed(1)}초 · ` : ''}←→ 차선 · Space 아이템
        </p>
      </div>
      </>}

      {flash && wall - flash.at < 1200 && (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] text-center">
          <span className="rounded-full bg-[#FACC15] px-3 py-0.5 text-[13px] font-black text-[#1F2933]">{flash.text}</span>
        </div>
      )}

      {phase === 'lobby' && (
        // 출발선에 선 차들이 보이게 아래쪽 띠에만 안내(차 이름표는 3D 무대가 차 위에 띄운다)
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/70 to-transparent pb-2 pt-8 text-white">
          <p className="text-[17px] font-black drop-shadow">🏎 참가자 모집 중… {Math.max(0, Math.ceil((lobbyEnd - sn) / 1000))}초 <span className="ml-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[12.5px] font-bold">이번 코스 · {course.name}{courseTags(course) ? ` · ${courseTags(course)}` : ''}</span></p>
          {!gl && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {joined.map(id => <span key={id} className="rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-[#1F2933]">{L(id).name}{id === hostId ? ' (방장)' : ''}</span>)}
            </div>
          )}
          <p className="text-[11px] text-white/85 drop-shadow">운동장을 연 팀원에게 참가 버튼이 떠요 · 사람이 {CPU_FILL}명보다 적으면 🤖 CPU가 채워요 · 출발하면 운전석으로 들어가요</p>
        </div>
      )}
      {phase === 'count' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <span className="rounded-full bg-black/45 px-3 py-0.5 text-[15px] font-black text-white">{course.name}{courseTags(course) ? ` · ${courseTags(course)}` : ''}</span>
            <span className="text-[64px] font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]">{Math.ceil(-t / 1000)}</span>
          </div>
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
      {phase === 'done' && (() => {
        // 🏆 시상식 — 단상·차는 캔버스(racePodium.ts), 이름·기록은 여기서 얹는다
        const rec = (c: Car) => `${c.fin !== null ? `${(c.fin / 1000).toFixed(2)}초` : t > timeoutMs ? '시간 초과' : !c.id.startsWith('cpu') && c.id !== myId && (snap.remote.get(c.id) === undefined || wall - snap.remote.get(c.id)!.at > STALE_MS) ? '연결 끊김' : '미완주'}${quitIds.includes(c.id) ? ' · 나감' : ''}`
        const gy = H * PODIUM_GROUND
        return (
          <div className="pointer-events-none absolute inset-0 text-white">
            {gl && <Race3DStage mode="podium" theme={theme} width={W} height={H}
              cars={order.slice(0, 3).map((c, i) => ({ id: c.id, car: L(c.id).car, color: L(c.id).palette.bg, label: `${i === 0 ? '👑 ' : ''}${L(c.id).name}`, sub: rec(c), me: c.isMe }))} />}
            <div className={gl ? 'absolute left-3 top-2 rounded-xl bg-black/45 px-3 py-1.5' : 'absolute inset-x-0 top-2 text-center'}>
              <p className="text-[20px] font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.45)]">🏆 시상식 <span className="text-[13px] font-bold opacity-90">· {course.name}</span></p>
              <p className="text-[13px] font-bold text-[#FDE68A] drop-shadow">{myRank === 1 ? '우승! 축하해요 🎉' : myRank <= 3 ? `${myRank}등 — 단상에 올랐어요 🎉` : `내 순위 ${myRank}등`}</p>
            </div>
            {!gl && order.slice(0, 3).map((c, i) => (
              <div key={c.id} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: W / 2 + PODIUM[i].dx, top: gy - PODIUM[i].h - 112 }}>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-black ${c.isMe ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-black/55'}`}>{i === 0 ? '👑 ' : ''}{L(c.id).name}</span>
                <span className="mt-0.5 text-[11px] font-bold drop-shadow">{rec(c)}</span>
              </div>
            ))}
            {order.length > 3 && (
              <div className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2.5 py-1.5 text-[11.5px]">
                {order.slice(3).map((c, i) => (
                  <p key={c.id} className={c.isMe ? 'font-black text-[#FDE68A]' : 'font-semibold'}>{i + 4}등 {L(c.id).name} · {rec(c)}</p>
                ))}
              </div>
            )}
          </div>
        )
      })()}
      {phase === 'race' && me.finishedAt === null && (() => {
        // 뒤가 안 보이니 경고로 알려 준다 — 날아오는 메일, 바로 뒤에 붙은 차
        const incoming = snap.mails.find(m => m.to === myId)
        const behind = cars.filter(c => !c.isMe && c.fin === null && c.x < me.x && me.x - c.x < 260).sort((a, b) => b.x - a.x)[0]
        return (
          <div className="pointer-events-none absolute inset-x-0 bottom-12 flex flex-col items-center gap-1">
            {incoming && (
              <span className="rounded-full bg-[#DC2626] px-3 py-1 text-[14px] font-black text-white shadow-[0_0_0_3px_rgba(255,255,255,0.7)]" style={{ animation: 'rc-shake 90ms linear infinite' }}>
                {incoming.kind === 'notice' ? '📢 전체 공지' : '📧 메일'} {Math.max(0, (incoming.at - sn) / 1000).toFixed(1)}초 뒤 맞아요!
                {t < me.shieldUntil ? ' — 🛡️ 도장이 막아 줘요' : me.item === 'shield' ? ' — 지금 Space = 🛡️ 막기!' : ''}
              </span>
            )}
            {behind && <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold text-white">{behind.y < me.y - 12 ? '↖' : behind.y > me.y + 12 ? '↗' : '⬇'} 뒤에 {L(behind.id).name}</span>}
          </div>
        )
      })()}
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={quit}
        className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-[#1F2933] hover:bg-white">
        {phase === 'done' ? '운동장으로' : '그만하기'}
      </button>
      {!disabled(me, t) && phase === 'race' && me.v < 50 && t > 2000 && me.finishedAt === null && (
        <p className="absolute bottom-10 left-3 text-[11px] text-white/80">카트는 자동으로 달려요 — ←→로 피하기만!</p>
      )}
    </div>
  )
}
