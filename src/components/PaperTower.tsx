'use client'

// 홈 "한 판" 카드의 🗼 서류탑 — 카드 안에서 바로 하는 물리 쌓기(팝업 없음).
// [지금 놓기] → 집게가 책상 위를 좌우로 왕복 → Space(또는 화면/버튼 탭)로 떨어뜨림 → 탑이 멈추면 판정.
// 판정: 이번 차례에 책상 아래로 떨어진 물건이 1개라도 있으면 "무너짐" → 탑을 치우고 새로 시작.
// 층이 오를수록(2개마다 1단계) 물건은 작아지고 집게는 빨라지고 이상한 물건이 자주 나온다.
// STEP 2: 팀 공용 탑(supabase/add_paper_tower.sql). 한 탑에 1인 2회 · 연속 금지 · 놓는 중 잠금 · 날짜 바뀌면 완공 마감.
// 물리 결과는 놓은 사람 화면의 계산이 정답 — 탑이 멈춘 뒤 물건 목록을 저장하고, 다른 사람 화면은 그 목록으로 탑을 다시 세운다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayName } from '@/lib/members'
import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite } = Matter

// 세계 좌표(그리기 때 캔버스 폭에 맞춰 늘림)
const VW = 480, VH = 400
const DESK = { x: 240, y: 360, w: 270, h: 16 }
const DESK_TOP = DESK.y - DESK.h / 2
const AIM_T = 8, JUDGE_MAX = 5, MAXLV = 10
const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'
const OPT = { friction: 0.9, frictionStatic: 1.2, restitution: 0, density: 0.0018 }

type Piece = Matter.Body & { kind?: string; fallen?: boolean; fill?: string[]; by?: string; sc?: number }
type Kind = { icon: string; name: string; weird?: boolean; make: () => Piece }

const part = (b: Matter.Body, c: string) => { (b as Piece).fill = [c]; return b }
const compound = (parts: [Matter.Body, string][]) => {
  const b = Body.create({ ...OPT, parts: parts.map(([p]) => p) }) as Piece
  b.fill = parts.map(([, c]) => c)
  return b
}
const PIECES: Record<string, Kind> = {
  binder: { icon: '📁', name: '바인더', make: () => part(Bodies.rectangle(0, 0, 104, 26, { ...OPT, chamfer: { radius: 3 } }), '#2f6fb0') as Piece },
  box: { icon: '📦', name: '박스', make: () => part(Bodies.rectangle(0, 0, 66, 56, OPT), '#b8864b') as Piece },
  papers: { icon: '📄', name: '서류 뭉치', make: () => part(Bodies.rectangle(0, 0, 132, 16, OPT), '#efe9da') as Piece },
  keyboard: { icon: '⌨', name: '키보드', make: () => part(Bodies.rectangle(0, 0, 118, 14, { ...OPT, chamfer: { radius: 4 } }), '#3b3f46') as Piece },
  cup: { icon: '☕', name: '커피컵', make: () => part(Bodies.rectangle(0, 0, 26, 36, OPT), '#f5f5f5') as Piece },
  monitor: { weird: true, icon: '🖥', name: '모니터', make: () => compound([[Bodies.rectangle(0, -14, 84, 54), '#2b2f36'], [Bodies.rectangle(0, 21, 12, 16), '#555b66'], [Bodies.rectangle(0, 33, 52, 8), '#555b66']]) },
  chair: { weird: true, icon: '🪑', name: '의자', make: () => compound([[Bodies.rectangle(0, 12, 64, 12), '#b8473a'], [Bodies.rectangle(-26, -22, 12, 56), '#b8473a']]) },
  plant: { weird: true, icon: '🪴', name: '화분', make: () => compound([[Bodies.trapezoid(0, 14, 40, 32, 0.3), '#a0522d'], [Bodies.circle(0, -16, 22), '#4f9a3a']]) },
  ball: { weird: true, icon: '⚽', name: '스트레스볼', make: () => part(Bodies.circle(0, 0, 18, { ...OPT, frictionAir: 0.01 }), '#ef7d2d') as Piece },
}
const NORMAL = Object.keys(PIECES).filter(k => !PIECES[k].weird)
const WEIRD = Object.keys(PIECES).filter(k => PIECES[k].weird)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

// 단계: 작게 · 빠르게 · 이상한 물건 자주. 10단계 뒤로는 속도만 계속 오름.
function lvInfo(lv: number) {
  const k = Math.min(lv, MAXLV) - 1, e = Math.max(0, lv - MAXLV)
  return { scale: Math.max(0.5, 1 - k * 0.06), freq: 1.3 * (1 + k * 0.15 + e * 0.1), weird: Math.min(0.5, 0.1 + k * 0.05) }
}
const levelOf = (count: number) => 1 + Math.floor(count / 2)

type Phase = 'idle' | 'aim' | 'falling' | 'collapse'
type FloatText = { x: number; y: number; txt: string; c: string; t: number }
type Saved = { k: string; x: number; y: number; a: number; s: number; by: string | null }
type Result = { collapsed: boolean; state: Saved[]; nextKind: string }
type Tag = { color: string; initial: string }

const TOWER_LIMIT = 5 // 한 탑에 1인 횟수 — add_paper_tower.sql 의 v_limit 과 같게
const sweepRange = DESK.w / 2 + 12
const pickKind = (count: number) => Math.random() < lvInfo(levelOf(count)).weird ? pick(WEIRD) : pick(NORMAL)
// 팀원 색(보라 계열 제외) — members.color_key 순번
const TAG_COLORS = ['#E8833A', '#2F9E9A', '#4F9A3A', '#2563EB', '#D6A91F', '#C2410C', '#0E7490', '#B91C1C']

// 게임 본체 — React 바깥에서 물리·그리기 상태를 들고, 바뀐 값은 콜백으로 알린다.
class TowerGame {
  engine!: Matter.Engine
  pieces: Piece[] = []
  hold: Piece | null = null
  holdKind = ''
  me: string | null = null
  phase: Phase = 'idle'
  swPh = 0; timer = 0; settleT = 0; calmT = 0; fallenNow = 0; resetT = 0
  acc = 0; cam = 0; clock = 0; shake = 0; count = 0
  texts: FloatText[] = []
  cv: HTMLCanvasElement | null = null
  raf: number | null = null
  tagOf: (id: string | null | undefined) => Tag | null = () => null
  onPhase: (p: Phase, msg: string | null) => void
  onResult: (r: Result) => void
  onCollapseDone: () => void

  constructor(onPhase: (p: Phase, msg: string | null) => void, onResult: (r: Result) => void, onCollapseDone: () => void) {
    this.onPhase = onPhase; this.onResult = onResult; this.onCollapseDone = onCollapseDone
    this.load([])
  }

  // 저장된 탑을 그대로 다시 세운다(잠든 상태로 — 불러오자마자 흔들리지 않게)
  load(state: Saved[]) {
    this.engine = Engine.create({ enableSleeping: true })
    this.engine.positionIterations = 10; this.engine.velocityIterations = 8
    const desk = Bodies.rectangle(DESK.x, DESK.y, DESK.w, DESK.h, { isStatic: true, friction: 1 })
    const floor = Bodies.rectangle(VW / 2, VH + 60, VW * 3, 80, { isStatic: true })
    Composite.add(this.engine.world, [desk, floor])
    this.pieces = []
    for (const s of state) {
      if (!PIECES[s.k]) continue
      const b = PIECES[s.k].make()
      if (s.s < 1) Body.scale(b, s.s, s.s)
      Body.setPosition(b, { x: s.x, y: s.y }); Body.setAngle(b, s.a)
      b.kind = s.k; b.sc = s.s; b.by = s.by ?? undefined
      Composite.add(this.engine.world, b); Matter.Sleeping.set(b, true)
      this.pieces.push(b)
    }
    this.hold = null; this.count = this.pieces.length; this.acc = 0; this.phase = 'idle'
    this.cam = this.camTarget()
    this.draw()
  }
  serialize(): Saved[] {
    return this.pieces.filter(b => !b.fallen).map(b => ({
      k: b.kind!, x: Math.round(b.position.x * 100) / 100, y: Math.round(b.position.y * 100) / 100,
      a: Math.round(b.angle * 10000) / 10000, s: b.sc ?? 1, by: b.by ?? null,
    }))
  }

  towerTop() { let top = DESK_TOP; for (const b of this.pieces) if (!b.fallen) top = Math.min(top, b.bounds.min.y); return top }
  holdPos() {
    const h = this.hold ? (this.hold.bounds.max.y - this.hold.bounds.min.y) / 2 : 20
    return { x: DESK.x + Math.sin(this.swPh) * sweepRange, y: this.towerTop() - 40 - h }
  }
  calm() { return this.pieces.every(b => b.fallen || b.isSleeping || (b.speed < 0.12 && Math.abs(b.angularSpeed) < 0.012)) }
  camTarget() { return Math.max(0, DESK_TOP - this.towerTop() - 200) }

  start(kind: string) {
    if (this.phase !== 'idle' || !PIECES[kind]) return
    const L = lvInfo(levelOf(this.count))
    this.holdKind = kind
    const b = PIECES[kind].make()
    if (L.scale < 1) Body.scale(b, L.scale, L.scale)
    b.sc = Math.round(L.scale * 1000) / 1000; b.by = this.me ?? undefined
    this.hold = b; this.swPh = Math.random() * Math.PI * 2; this.timer = AIM_T; this.fallenNow = 0; this.phase = 'aim'
    Body.setPosition(b, this.holdPos())
    this.onPhase('aim', `${PIECES[kind].icon} ${PIECES[kind].name} — Space로 떨어뜨리기`)
    this.run()
  }

  drop() {
    if (this.phase !== 'aim' || !this.hold) return
    const L = lvInfo(levelOf(this.count))
    Body.setPosition(this.hold, this.holdPos())
    // 왕복하던 힘이 조금 실림 (단계가 높을수록 옆으로 더 밀림)
    Body.setVelocity(this.hold, { x: Math.cos(this.swPh) * sweepRange * L.freq / 60 * 0.3, y: 0 })
    this.hold.kind = this.holdKind
    for (const b of this.pieces) Matter.Sleeping.set(b, false)
    Composite.add(this.engine.world, this.hold); this.pieces.push(this.hold); this.count++
    this.hold = null; this.phase = 'falling'; this.settleT = 0; this.calmT = 0
    this.onPhase('falling', '⚖ 판정 중… 탑이 멈추길 기다리는 중')
  }

  judge() {
    if (this.fallenNow > 0) {
      this.phase = 'collapse'; this.resetT = 2.2; this.shake = 0.5; this.hold = null
      this.onPhase('collapse', `💥 무너짐! ${Math.max(0, this.count - 1)}층에서 와르르`)
      this.onResult({ collapsed: true, state: [], nextKind: pickKind(0) })
    } else {
      this.texts.push({ x: DESK.x, y: this.towerTop() - 18, txt: '✅ 세이프', c: '#7be08f', t: 1.4 })
      this.phase = 'idle'
      this.onPhase('idle', this.count % 2 === 0 ? `✅ 세이프 · ${this.count}층 · ⚡ ${levelOf(this.count)}단계로` : `✅ 세이프 · ${this.count}층`)
      this.onResult({ collapsed: false, state: this.serialize(), nextKind: pickKind(this.count) })
    }
  }

  step(dt: number) {
    this.clock += dt; if (this.shake > 0) this.shake -= dt
    this.texts = this.texts.map(t => ({ ...t, t: t.t - dt, y: t.y - 20 * dt })).filter(t => t.t > 0)
    // 물리: 화면 간격과 상관없이 항상 1/60초씩 (간격이 들쭉날쭉하면 가만있던 탑도 미끄러진다)
    this.acc += dt * 1000
    while (this.acc >= 1000 / 60) { Engine.update(this.engine, 1000 / 60); this.acc -= 1000 / 60 }
    for (const b of this.pieces) {
      // 중심이 책상 윗면보다 아래면 떨어진 것 — 윗면 기준으로 보면 키 큰 물건(모니터·의자·화분)은 바닥에 떨어져도 책상 높이에 걸려 판정이 안 됐다
      if (!b.fallen && b.position.y > DESK_TOP + 4) {
        b.fallen = true
        if (this.phase === 'aim' || this.phase === 'falling') {
          this.fallenNow++; this.shake = 0.35
          this.texts.push({ x: Math.max(50, Math.min(VW - 50, b.position.x)), y: DESK_TOP + 26, txt: '💔', c: '#ff7a6a', t: 1.2 })
        }
      }
    }
    this.cam += (this.camTarget() - this.cam) * Math.min(1, dt * 2.5)
    if (this.phase === 'aim') {
      this.timer -= dt; this.swPh += dt * lvInfo(levelOf(this.count)).freq
      if (this.hold) Body.setPosition(this.hold, this.holdPos())
      if (this.timer <= 0) this.drop()
    } else if (this.phase === 'falling') {
      this.settleT += dt; this.calmT = this.calm() ? this.calmT + dt : 0
      if ((this.settleT > 0.8 && this.calmT > 0.5) || this.settleT > JUDGE_MAX) this.judge()
    } else if (this.phase === 'collapse') {
      this.resetT -= dt
      if (this.resetT <= 0) { this.phase = 'idle'; this.onCollapseDone() }
    }
  }

  // 움직일 게 있을 때만 프레임을 돌린다(가만히 있을 땐 멈춤)
  run() {
    if (this.raf != null) return
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      this.step(dt); this.draw()
      const busy = this.phase !== 'idle' || this.texts.length > 0 || this.shake > 0 || !this.calm() || Math.abs(this.cam - this.camTarget()) > 0.5
      this.raf = busy ? requestAnimationFrame(loop) : null
    }
    this.raf = requestAnimationFrame(loop)
  }
  stop() { if (this.raf != null) cancelAnimationFrame(this.raf); this.raf = null }

  draw() {
    const cv = this.cv; if (!cv || !cv.width) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const s = cv.width / VW
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#e7e3d8'; ctx.fillRect(0, 0, cv.width, cv.height)
    const sh = this.shake > 0 ? Math.sin(this.clock * 80) * 5 * this.shake : 0
    ctx.setTransform(s, 0, 0, s, sh * s, this.cam * s)
    // 창문
    ctx.fillStyle = '#1f2a40'; ctx.fillRect(30, 30, 150, 120); ctx.fillRect(300, 30, 150, 120)
    ctx.fillStyle = 'rgba(255,210,120,.55)'
    for (const x0 of [30, 300]) for (let i = 0; i < 8; i++) ctx.fillRect(x0 + 12 + ((i * 41) % 126), 60 + ((i * 29) % 80), 6, 8)
    ctx.strokeStyle = '#8b8577'; ctx.lineWidth = 5
    for (const x0 of [30, 300]) { ctx.strokeRect(x0, 30, 150, 120); ctx.beginPath(); ctx.moveTo(x0 + 75, 30); ctx.lineTo(x0 + 75, 150); ctx.stroke() }
    // 바닥·책상
    ctx.fillStyle = '#a49e8f'; ctx.fillRect(-40, VH - 8, VW + 80, 400)
    ctx.fillStyle = '#7a5a3c'; ctx.fillRect(DESK.x - DESK.w / 2 + 12, DESK.y, 12, VH - DESK.y); ctx.fillRect(DESK.x + DESK.w / 2 - 24, DESK.y, 12, VH - DESK.y)
    ctx.fillStyle = '#a0784f'; ctx.fillRect(DESK.x - DESK.w / 2, DESK_TOP, DESK.w, DESK.h)
    ctx.fillStyle = '#bf9466'; ctx.fillRect(DESK.x - DESK.w / 2, DESK_TOP, DESK.w, 4)
    const drawBody = (b: Piece, kind: string, ghost: boolean) => {
      const parts = b.parts.length > 1 ? b.parts.slice(1) : [b]
      parts.forEach((p, i) => {
        ctx.beginPath(); p.vertices.forEach((v, j) => j ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath()
        ctx.globalAlpha = ghost ? 0.85 : 1; ctx.fillStyle = b.fill?.[i] ?? '#ccc'; ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1
      })
      const w = b.bounds.max.x - b.bounds.min.x
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle)
      ctx.font = `${Math.round(16 * Math.max(0.7, Math.min(1, w / 50)))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(PIECES[kind].icon, 0, 0); ctx.restore()
      // 놓은 사람: 팀원 색 동그라미 + 이름 첫 글자
      const tag = this.tagOf(b.by)
      if (tag && !ghost) {
        const cx = b.bounds.min.x + 2, cy = b.bounds.min.y + 2
        ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fillStyle = tag.color; ctx.fill()
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(tag.initial, cx, cy + 0.5)
      }
    }
    for (const b of this.pieces) drawBody(b, b.kind!, false)
    // 집게
    if (this.hold && this.phase === 'aim') {
      const pos = this.holdPos(), ry = 6 - this.cam
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(-40, ry, VW + 80, 7)
      ctx.fillStyle = '#333'; ctx.fillRect(pos.x - 14, ry - 2, 28, 12)
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pos.x, ry + 10); ctx.lineTo(pos.x, this.hold.bounds.min.y); ctx.stroke()
      ctx.strokeStyle = 'rgba(232,131,58,.6)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(pos.x, this.hold.bounds.max.y); ctx.lineTo(pos.x, DESK_TOP); ctx.stroke(); ctx.setLineDash([])
      drawBody(this.hold, this.holdKind, true)
      // 남은 시간: 화면 폭 거의 전체 굵은 막대 + 초 숫자, 3초 남으면 빨갛게 깜빡
      const left = Math.max(0, this.timer), urgent = left < 3, blink = urgent && Math.floor(this.clock * 4) % 2 === 0
      const bx = 16, bw = VW - 32 - 52, by = ry + 18, bh = 14
      ctx.fillStyle = 'rgba(20,22,28,.55)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill()
      ctx.fillStyle = urgent ? (blink ? '#ff4d4d' : '#c0392b') : left < 5 ? '#f0a020' : '#4caf6a'
      ctx.beginPath(); ctx.roundRect(bx + 2, by + 2, Math.max(0, (bw - 4) * left / AIM_T), bh - 4, 5); ctx.fill()
      ctx.font = `900 ${urgent ? 22 : 18}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText(`${Math.ceil(left)}초`, VW - 14, by + bh / 2 + 1)
      ctx.fillStyle = urgent ? '#ff6b6b' : '#ffffff'; ctx.fillText(`${Math.ceil(left)}초`, VW - 14, by + bh / 2 + 1)
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    }
    // 높이 표시
    const top = this.towerTop(), h = DESK_TOP - top
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    if (h > 0) { ctx.font = `700 14px ${FONT}`; ctx.fillStyle = '#1d2320'; ctx.fillText(`${this.count}층 · ${Math.round(h / 2)}cm`, 12, top + 4) }
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.t)); ctx.font = `900 20px ${FONT}`; ctx.textAlign = 'center'
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(t.txt, t.x, t.y); ctx.fillStyle = t.c; ctx.fillText(t.txt, t.x, t.y); ctx.globalAlpha = 1
    }
    ctx.textAlign = 'left'
  }
}

/* ---------- 서버 데이터 ---------- */
type TowerRow = {
  id: number; floors: number; state: Saved[]; next_kind: string | null; version: number
  last_by: string | null; lock_by: string | null; lock_until: string | null
  ended_at: string | null; end_reason: 'collapse' | 'complete' | 'reset' | null; collapsed_by: string | null
}
type MoveRow = { id: number; member_id: string; floor: number; kind: string; result: 'safe' | 'collapse' | null }

const ERR_TEXT: Record<string, string> = {
  NOT_MEMBER: '팀원 계정으로 로그인해야 놓을 수 있어요',
  LOCKED: '다른 사람이 놓는 중이에요',
  ALREADY_MINE: '이미 놓는 중이에요',
  CONSECUTIVE: '방금 놓았어요 — 다른 사람이 놓은 뒤에 다시',
  LIMIT: `이번 탑에서 ${TOWER_LIMIT}번 다 놓았어요 — 새 탑에서 다시`,
  LOCK_LOST: '시간이 너무 지나 이번 결과는 기록되지 않았어요',
  VERSION: '그사이 탑이 바뀌어 이번 결과는 기록되지 않았어요',
  TOWER_CLOSED: '그사이 탑이 마감돼 이번 결과는 기록되지 않았어요',
  NOT_LEAD: '관리자만 리셋할 수 있어요',
}
const errCode = (e: { message?: string } | null) => {
  const m = e?.message ?? ''
  return Object.keys(ERR_TEXT).find(k => m.includes(k)) ?? null
}

export default function PaperTower() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<TowerGame | null>(null)
  const towerRef = useRef<TowerRow | null>(null)
  const loadSeq = useRef(0)
  const { allMembers } = useMembers()
  const { me } = useCurrentMember()
  const [phase, setPhase] = useState<Phase>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [tower, setTower] = useState<TowerRow | null>(null)
  const [moves, setMoves] = useState<MoveRow[]>([])
  const [prev, setPrev] = useState<TowerRow | null>(null)
  const [best, setBest] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const nameOf = useCallback((id: string | null | undefined) => {
    const m = allMembers.find(x => x.id === id)
    return m ? displayName(m) : '누군가'
  }, [allMembers])

  // 서버에서 지금 탑·이번 탑 기록·지난 탑·최고 기록을 받는다. 늦게 온 옛 응답은 버린다.
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const supabase = createClient()
    const { data: cur, error } = await supabase.rpc('paper_tower_current')
    if (seq !== loadSeq.current) return
    if (error || !cur) { setLoadFailed(true); return }
    const t = cur as TowerRow
    const [mv, pv, bs] = await Promise.all([
      supabase.from('paper_tower_moves').select('id, member_id, floor, kind, result').eq('tower_id', t.id).order('id'),
      supabase.from('paper_towers').select('*').not('ended_at', 'is', null).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('paper_towers').select('floors').order('floors', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (seq !== loadSeq.current) return
    setLoadFailed(false)
    setMoves((mv.data ?? []) as MoveRow[])
    setPrev((pv.data ?? null) as TowerRow | null)
    setBest(((bs.data as { floors: number } | null)?.floors) ?? 0)
    const before = towerRef.current
    towerRef.current = t; setTower(t)
    // 내가 놓는 중이 아닐 때만 화면 탑을 서버 모양으로 다시 세운다
    const g = gameRef.current
    if (g && g.phase === 'idle' && (!before || before.id !== t.id || before.version !== t.version)) g.load(t.state ?? [])
  }, [])

  // 놓은 결과 저장
  const commit = useCallback(async (r: Result) => {
    const t = towerRef.current; if (!t) return
    const supabase = createClient()
    const { error } = await supabase.rpc('paper_tower_commit', {
      p_tower_id: t.id, p_version: t.version, p_state: r.state, p_collapsed: r.collapsed, p_next_kind: r.nextKind,
    })
    if (error) { const c = errCode(error); setMsg(c ? ERR_TEXT[c] : '저장하지 못했어요 · 새로고침해 주세요') }
    // 무너졌으면 게임이 연출 중이라 화면 탑은 그대로 두고 새 탑 정보만 받아 둔다(연출이 끝나면 onCollapseDone 이 세움)
    await load()
  }, [load])

  // 마운트: 게임 만들고 캔버스 크기 맞추기
  useEffect(() => {
    const game = new TowerGame(
      (p, m) => { setPhase(p); setMsg(m) },
      r => { void commit(r) },
      () => { const t = towerRef.current; game.load(t?.state ?? []); setMsg('새 탑 시작!') },
    )
    gameRef.current = game
    const cv = cvRef.current, wrap = wrapRef.current
    if (!cv || !wrap) return
    game.cv = cv
    const fit = () => {
      const w = wrap.clientWidth; if (!w) return
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * VH / VW * dpr)
      game.draw()
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(wrap)
    return () => {
      ro.disconnect(); game.stop(); gameRef.current = null
      // 놓는 도중 떠나면 잠금만 풀어 준다(횟수는 이미 소모)
      if (game.phase === 'aim') void createClient().rpc('paper_tower_release')
    }
  }, [commit])

  // 처음 불러오기 + 실시간(다른 사람이 놓거나 무너뜨리면 바로 반영)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 상태를 마운트 때 받아 온다
    void load()
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load() }, 150) }
    const ch = supabase.channel('paper-tower')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_towers' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_tower_moves' }, soon)
      .subscribe(status => { if (status === 'SUBSCRIBED') soon() })
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch) }
  }, [load])

  // 팀원 색·이니셜을 게임에 알려 준다
  useEffect(() => {
    const g = gameRef.current; if (!g) return
    g.me = me?.id ?? null
    g.tagOf = id => {
      const m = allMembers.find(x => x.id === id); if (!m) return null
      return { color: TAG_COLORS[(((m.color_key ?? 0) % 8) + 8) % 8], initial: displayName(m).slice(0, 1) }
    }
    g.draw()
  }, [allMembers, me])

  // 잠금 남은 시간 표시용 시계(잠겨 있을 때만)
  const lockActive = !!(tower?.lock_by && tower.lock_until && new Date(tower.lock_until).getTime() > now)
  useEffect(() => {
    if (!tower?.lock_by) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tower?.lock_by, tower?.lock_until])

  // Space: 집게가 왕복하는 중에만 가로챈다(입력칸에서 쓰는 중이면 무시)
  useEffect(() => {
    if (phase !== 'aim') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault(); gameRef.current?.drop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const myUsed = me ? moves.filter(m => m.member_id === me.id).length : 0
  const myLeft = Math.max(0, TOWER_LIMIT - myUsed)
  const lockedByOther = lockActive && tower?.lock_by !== me?.id
  const blocked: string | null = !tower ? (loadFailed ? '불러오지 못했어요' : '불러오는 중…')
    : !me ? '팀원 계정으로 로그인해야 놓을 수 있어요'
    : lockedByOther ? `${nameOf(tower.lock_by)} 님이 놓는 중… ${Math.max(0, Math.ceil((new Date(tower.lock_until!).getTime() - now) / 1000))}초`
    : myLeft <= 0 ? `이번 탑 ${TOWER_LIMIT}번 다 놓음 — 새 탑에서 다시`
    : tower.last_by === me.id ? '방금 놓았어요 — 다른 사람 차례'
    : null

  async function onStart() {
    const g = gameRef.current, t = towerRef.current
    if (!g || !t || g.phase !== 'idle' || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('paper_tower_claim', { p_kind: pickKind(t.floors) })
    setBusy(false)
    if (error || !data) { const c = errCode(error); setMsg(c ? ERR_TEXT[c] : '지금은 놓을 수 없어요'); void load(); return }
    const nt = data as TowerRow
    towerRef.current = nt; setTower(nt)
    if (g.count !== (nt.state ?? []).length) g.load(nt.state ?? [])
    g.start(nt.next_kind ?? pickKind(nt.floors))
  }
  const onBtn = () => { if (phase === 'aim') gameRef.current?.drop(); else if (phase === 'idle' && !blocked) void onStart() }

  const btnLabel = phase === 'aim' ? '⬇ 떨어뜨리기 (Space)' : phase === 'falling' ? '⚖ 판정 중…' : phase === 'collapse' ? '💥 치우는 중…'
    : busy ? '잡는 중…' : blocked ?? `🗼 지금 놓기 · 남은 ${myLeft}/${TOWER_LIMIT}회`
  const canPress = phase === 'aim' || (phase === 'idle' && !blocked && !busy)
  const recent = [...moves].reverse()
  const prevLine = prev ? (prev.end_reason === 'collapse' ? `지난 탑 ${prev.floors}층 · 💥 범인 ${nameOf(prev.collapsed_by)}`
    : prev.end_reason === 'reset' ? `지난 탑 ${prev.floors}층 · ↺ 관리자 리셋` : `지난 탑 🏁 완공 ${prev.floors}층`) : null
  const isLead = me?.role === 'lead'

  // 관리자 리셋 — 지금 탑을 마감하고 빈 새 탑. 놓는 중인 사람이 있으면 그 결과는 기록되지 않는다.
  async function onReset() {
    const g = gameRef.current
    if (!g || g.phase !== 'idle' || busy) return
    const who = lockActive && tower?.lock_by ? `
지금 ${nameOf(tower.lock_by)} 님이 놓는 중이라 그 결과는 기록되지 않아요.` : ''
    if (!window.confirm(`지금 탑(${tower?.floors ?? 0}층)을 리셋하고 새 탑을 시작할까요?
모두의 횟수가 다시 채워집니다.${who}`)) return
    setBusy(true)
    const { data, error } = await createClient().rpc('paper_tower_reset')
    setBusy(false)
    if (error || !data) { const c = errCode(error); setMsg(c ? ERR_TEXT[c] : '리셋하지 못했어요'); return }
    setMsg('↺ 탑을 리셋했어요')
    await load()
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="w-full rounded-xl overflow-hidden border border-[#E8E8E4] cursor-pointer" onClick={() => { if (phase === 'aim') gameRef.current?.drop() }}>
        <canvas ref={cvRef} className="block w-full" style={{ aspectRatio: `${VW}/${VH}` }} aria-label="서류탑 화면" />
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#6B6B66] min-h-[18px]">
        <span className="truncate">{msg ?? prevLine ?? '책상에서 떨어뜨리면 무너짐!'}</span>
        <span className="flex-shrink-0 tabular-nums">{tower?.floors ?? 0}층 · 최고 {best}{tower?.next_kind && PIECES[tower.next_kind] ? ` · 다음 ${PIECES[tower.next_kind].icon}` : ''}</span>
      </div>
      {/* 이번 탑 기록 — 최근 차례부터 */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11.5px] min-h-[22px] [scrollbar-width:none]">
        {recent.length === 0
          ? <span className="text-[#9C9C96]">{tower ? '아직 아무도 안 놓았어요 — 첫 층의 주인공이 되어 보세요' : ''}</span>
          : recent.map(m => {
              const mem = allMembers.find(x => x.id === m.member_id)
              const color = mem ? TAG_COLORS[(((mem.color_key ?? 0) % 8) + 8) % 8] : '#9C9C96'
              const pending = m.result == null && lockActive && tower?.lock_by === m.member_id && m.id === moves[moves.length - 1]?.id
              const mark = m.result === 'safe' ? '✅' : m.result === 'collapse' ? '💥' : pending ? '…' : '⌛'
              return (
                <span key={m.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#F4F4F1]" title={m.result == null && !pending ? '시간 초과 — 기록 안 됨' : undefined}>
                  <span className="tabular-nums text-[#9C9C96]">{m.floor}</span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[#1F1F1D]">{nameOf(m.member_id)}</span>
                  <span>{mark}</span>
                </span>
              )
            })}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onBtn}
          disabled={!canPress}
          className={`flex-1 min-w-0 py-2 rounded-xl text-[13px] font-semibold transition-colors truncate ${phase === 'aim' ? 'bg-[#E8833A] text-white animate-pulse' : canPress ? 'bg-[#1F1F1D] text-white hover:bg-[#3a3a36]' : 'bg-[#EDEDEA] text-[#9C9C96]'}`}
        >{btnLabel}</button>
        {/* 관리자(팀장)만: 지금 탑 리셋 — 권한은 DB 함수가 다시 확인 */}
        {isLead && (
          <button
            type="button"
            onClick={() => { void onReset() }}
            disabled={phase !== 'idle' || busy || !tower}
            title="관리자: 지금 탑을 리셋하고 새 탑 시작"
            className="flex-shrink-0 px-3 py-2 rounded-xl text-[12px] font-semibold border border-[#E8E8E4] text-[#6B6B66] hover:text-[#C0392B] hover:border-[#C0392B] disabled:opacity-40 transition-colors"
          >↺ 리셋</button>
        )}
      </div>
    </div>
  )
}
