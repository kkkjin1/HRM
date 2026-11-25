'use client'

// 🥊 격투기(낭떠러지 밀어내기) 화면 — 2026-11-24 STEP 1(혼자 CPU 연습판) + STEP 2(온라인: 방장 판정, brawlNet 머리말)
// 렉 없이: 경기장은 캔버스 한 장에 직접 그린다. 매 프레임 React를 다시 그리지 않고(포격전에서 본 끊김 원인),
// React 상태는 판이 끝날 때 한 번만 바꾼다. 계산은 1/60초 고정 간격(src/lib/brawl.ts step).
// 조작: ←→ 이동 · ↑ 점프(공중 1번 더) · ↓ 가드 · Space 꾹 눌러 기 모으고 떼면 펀치(0.1초 미만은 취소, Enter·Z·X도 같은 키)
//      휴대폰은 운동장 TouchPad(조이스틱 + A)가 같은 키를 보낸다.

import { useEffect, useRef, useState } from 'react'
import {
  BH, BODY_H, BRAWL_MAPS, BW, CRUMBLE_AT, DOWN_SEC, DT, JAB, MASH_NEED, NO_INPUT, RING_FLOOR, RING_TIME, ROPE_L, ROPE_R, STRONG, TIME_LIMIT, isRing,
  cpuInput, isCharging, newBrawl, newCpuMind, step, windAt, type BrawlMapKey, type BrawlState, type CpuMind, type Entrant, type Fighter, type Input,
} from '@/lib/brawl'
import { GUEST_LOST_MS, HOST_LOST_MS, INPUT_BEAT_MS, WORLD_EVERY_MS, applyWorld, decodeInput, encodeInput, encodeWorld, type BrawlWire } from '@/lib/brawlNet'
import type { BrawlNetCtl } from '@/lib/useBrawlNet'

export const BRAWL_WORLD = { w: BW, h: BH }
const START_DELAY = 2.4 // 초(3·2·1·시작!)

type Spark = { x: number; y: number; t: number; strong: boolean; guard: boolean }
type KoMark = { x: number; y: number; t: number; color: string; name: string }

export type BrawlResult = { winner: Fighter | null; ranking: Fighter[] }

export default function BrawlArena({ entrants, myId, map, lives = 3, seed = 1, onResult, overlay, startAt, offset = 0, net, keep }: {
  entrants: Entrant[] // 자리 순서 = 모든 화면이 같은 순서
  myId: string
  map: BrawlMapKey
  lives?: number
  seed?: number
  onResult?: (r: BrawlResult) => void
  overlay?: React.ReactNode // 판 끝 화면 등(경기장 위에 HTML로)
  startAt?: number // 시작 시각(서버 시계 ms) — 없으면 띄운 때부터 카운트
  offset?: number // 서버 시계 - 내 시계
  net?: BrawlNetCtl // 사람 2명 이상: host = 판정·방송, guest = 키만 보내고 방장 소식으로 맞춤
  keep?: { get: () => BrawlState | null; set: (s: BrawlState) => void } // 창 모드↔풀화면 전환으로 화면이 새로 그려져도 판을 이어 가게 바깥에 보관
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const keys = useRef<Input>({ ...NO_INPUT })
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult })
  const [, setTick] = useState(0) // 판 끝 표시용(한 번)

  // 키 — 경기 중엔 여기서 먼저 잡는다(광장 이동 등으로 새지 않게)
  useEffect(() => {
    const map: Record<string, keyof Input> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      ' ': 'attack', Space: 'attack', Enter: 'attack', KeyZ: 'attack', KeyX: 'attack', z: 'attack', Z: 'attack', x: 'attack', X: 'attack',
    }
    const which = (e: KeyboardEvent) => map[e.code] ?? map[e.key]
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = which(e); if (!k) return
      e.preventDefault(); e.stopImmediatePropagation()
      keys.current[k] = true
    }
    const up = (e: KeyboardEvent) => {
      const k = which(e); if (!k) return
      e.stopImmediatePropagation()
      keys.current[k] = false
    }
    const blur = () => { keys.current = { ...NO_INPUT } }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
  }, [])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const s: BrawlState = keep?.get() ?? newBrawl(map, entrants, lives, seed)
    keep?.set(s)
    const role = net?.role ?? 'solo'
    if (window.location.pathname.startsWith('/mock')) (window as unknown as { __brawl?: BrawlState }).__brawl = s // 목업 시험용(두 탭 비교)
    const myIdx = s.fighters.findIndex(f => f.id === myId)
    // CPU 마음: 혼자면 나 말고 전부, 방장이면 CPU 자리 + 나간 사람 자리(나중에 추가). 참가자는 CPU를 안 돌린다(방장이 알려 준 키로)
    const minds: Record<string, CpuMind> = {}
    const giveCpu = (i: number) => { const f = s.fighters[i]; if (f && !minds[f.id]) minds[f.id] = newCpuMind(seed * 31 + i * 7) }
    if (role !== 'guest') s.fighters.forEach((f, i) => { if (f.cpu || (role === 'solo' && f.id !== myId)) giveCpu(i) })
    const colorOf = Object.fromEntries(s.fighters.map(f => [f.id, f.color]))
    const sparks: Spark[] = []
    const kos: KoMark[] = []
    let shake = 0
    let ended = false
    const t0Local = Date.now()
    const start = startAt ?? t0Local + offset + START_DELAY * 1000 // 서버 시계
    const serverNow = () => Date.now() + offset

    // ── 통신 상태
    const remote: Input[] = s.fighters.map(() => ({ ...NO_INPUT })) // 방장: 참가자가 보낸 키 / 참가자: 방장이 알려 준 모두의 키
    const seen: number[] = s.fighters.map(() => Date.now() + 4000) // 방장: 참가자 마지막 소식(시작 직후 4초 여유)
    let lastWorld = 0, lastMine = -1, lastMineAt = 0, hostSeenAt = Date.now() + 4000
    let lost = false
    if (net) net.listen((m: BrawlWire) => {
      if (role === 'host') {
        if (m.k === 'i' && s.fighters[m.i] && !s.fighters[m.i].cpu) { remote[m.i] = decodeInput(m.b); seen[m.i] = Date.now() }
        else if (m.k === 'q' && s.fighters[m.i]) { s.fighters[m.i].cpu = true; giveCpu(m.i) }
      } else if (m.k === 'w') {
        hostSeenAt = Date.now(); lost = false
        m.b.forEach((b, i) => { if (i !== myIdx) remote[i] = decodeInput(b) })
        // 남의 몸은 방장 소식이 올 때(초당 12번) 그 자리로 '툭' 옮겨져 덜덜 떨려 보였다(2026-11-25 렉 수정)
        // → 판정 위치는 바로 맞추되, 화면엔 어긋난 만큼을 남겨 두었다가 0.1초쯤에 걸쳐 녹인다. 멀리(부활·KO) 튀면 그대로 옮김
        const before = s.fighters.map(f => [f.x, f.y])
        const fx = applyWorld(s, m, myIdx)
        s.fighters.forEach((f, i) => {
          if (i === myIdx) return
          const ox = before[i][0] - f.x + (smooth[i]?.[0] ?? 0), oy = before[i][1] - f.y + (smooth[i]?.[1] ?? 0)
          smooth[i] = Math.hypot(ox, oy) < 90 ? [ox, oy] : [0, 0]
        })
        for (const h of fx.hits) { const f = s.fighters[h.i]; sparks.push({ x: f.x, y: f.y - 36, t: 0, strong: h.strong, guard: false }); if (h.strong) shake = Math.max(shake, 5) }
        for (const i of fx.kos) { const f = s.fighters[i]; kos.push({ x: Math.max(0, Math.min(BW, f.x)), y: Math.max(0, Math.min(BH, f.y)), t: 0, color: colorOf[f.id], name: f.name }); shake = Math.max(shake, 12) }
      }
    })

    const smooth: [number, number][] = s.fighters.map(() => [0, 0]) // 참가자 화면: 남의 몸 보정 남은 거리(그리기에만)

    const inputsNow = (): Record<string, Input> => {
      const out: Record<string, Input> = {}
      s.fighters.forEach((f, i) => {
        if (i === myIdx) out[f.id] = { ...keys.current }
        else if (minds[f.id]) out[f.id] = cpuInput(s, f.id, minds[f.id])
        else out[f.id] = remote[i]
      })
      return out
    }

    // 캔버스 실제 픽셀 = 화면에 보이는 크기 × 기기 픽셀 밀도(흐리지 않게). 배경은 크기가 바뀔 때만 다시 그림
    let scale = 1
    let bg: HTMLCanvasElement | null = null
    let painted = 0 // 이 effect에서 배경을 그린 폭(개발 모드에서 effect가 두 번 돌아도 처음부터 다시 그리게 캔버스 폭과 따로 둔다)
    const fit = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(320, Math.min(2560, Math.round(r.width * dpr)))
      if (painted === w) return
      painted = w
      cv.width = w; cv.height = Math.round((w * BH) / BW); scale = w / BW; bg = paintBackground(map, cv.width, cv.height)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(cv)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const el = Math.min(0.1, (now - last) / 1000)
      last = now
      const T = (serverNow() - start) / 1000 // 판 시간(시작 전엔 음수)
      const sinceStart = T + START_DELAY
      if (T > 0 && !s.over) {
        // 방장: 소식 끊긴 참가자 자리는 CPU가 대신
        if (role === 'host') s.fighters.forEach((f, i) => { if (i !== myIdx && !f.cpu && Date.now() - seen[i] > GUEST_LOST_MS) { f.cpu = true; giveCpu(i) } })
        let n = 0
        while (s.time + DT <= T && n < 8) {
          const inputs = inputsNow()
          step(s, inputs, DT, role !== 'guest')
          if (role !== 'guest') {
            for (const h of s.fx.hits) { sparks.push({ x: h.x, y: h.y, t: 0, strong: h.strong, guard: h.guard }); if (h.big) shake = Math.max(shake, 9); else if (h.strong) shake = Math.max(shake, 4) }
            for (const k of s.fx.kos) { const f = s.fighters.find(x => x.id === k.id); kos.push({ x: k.x, y: k.y, t: 0, color: colorOf[k.id], name: f?.name ?? '' }); shake = Math.max(shake, 12) }
          }
          n++
        }
        if (s.time + DT * 8 < T) s.time = T - DT // 탭이 멈췄다 돌아오면 밀린 시간은 건너뜀(무대 시계만 맞춤)
      }
      // 보내기
      if (net && role === 'host' && (Date.now() - lastWorld >= WORLD_EVERY_MS || (s.over && Date.now() - lastWorld >= 300)) && T > -1) {
        lastWorld = Date.now()
        const ins = inputsNow()
        net.send(encodeWorld(s, s.fighters.map(f => ins[f.id])))
      }
      if (net && role === 'guest' && myIdx >= 0) {
        const b = encodeInput(keys.current)
        if (b !== lastMine || Date.now() - lastMineAt >= INPUT_BEAT_MS) { lastMine = b; lastMineAt = Date.now(); net.send({ k: 'i', i: myIdx, b }) }
        if (!s.over && Date.now() - hostSeenAt > HOST_LOST_MS) lost = true
      }
      for (const sp of sparks) sp.t += el
      for (const k of kos) k.t += el
      while (sparks.length && sparks[0].t > 0.35) sparks.shift()
      while (kos.length && kos[0].t > 1.4) kos.shift()
      shake = Math.max(0, shake - el * 40)
      if (role === 'guest') {
        const k = Math.exp(-el * 22) // 약 0.1초에 거의 다 녹음
        s.fighters.forEach((f, i) => { const o = smooth[i]; if (!o || (!o[0] && !o[1])) return; o[0] *= k; o[1] *= k; if (Math.abs(o[0]) + Math.abs(o[1]) < 0.3) { o[0] = 0; o[1] = 0 } f.x += o[0]; f.y += o[1] })
        draw(ctx, s, scale, bg, sparks, kos, shake, myId, sinceStart, lost)
        s.fighters.forEach((f, i) => { const o = smooth[i]; if (o) { f.x -= o[0]; f.y -= o[1] } })
      } else draw(ctx, s, scale, bg, sparks, kos, shake, myId, sinceStart, lost)
      if (s.over && !ended) {
        ended = true
        const ranking = [...s.fighters].sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
        onResultRef.current?.({ winner: s.fighters.find(f => f.id === s.winner) ?? null, ranking })
        setTick(t => t + 1)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      if (net) { if (role === 'guest' && myIdx >= 0 && !s.over) net.send({ k: 'q', i: myIdx }); net.listen(null) }
    }
    // 새 판은 key를 바꿔 다시 띄운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative" style={{ width: BW, height: BH }}>
      <canvas ref={cvRef} style={{ width: BW, height: BH, display: 'block' }} />
      {overlay}
    </div>
  )
}

// ── 그리기 ─────────────────────────────────────────
const SKY: Record<BrawlMapKey, [string, string]> = { peak: ['#7CC4F2', '#DDF1FB'], bridge: ['#F6B67A', '#FCE7C8'], ice: ['#9BB7E0', '#EAF2FB'], isles: ['#5EC2E8', '#C9EEF7'], ring: ['#0B1220', '#1E293B'] }

function paintBackground(map: BrawlMapKey, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  const k = w / BW
  g.scale(k, k)
  const [top, bot] = SKY[map]
  const grad = g.createLinearGradient(0, 0, 0, BH)
  grad.addColorStop(0, top); grad.addColorStop(1, bot)
  g.fillStyle = grad; g.fillRect(0, 0, BW, BH)
  // 해·달
  if (map !== 'ring') g.fillStyle = map === 'bridge' ? 'rgba(255,240,200,0.9)' : 'rgba(255,255,255,0.85)'
  if (map !== 'ring') { g.beginPath(); g.arc(map === 'bridge' ? 760 : 820, 90, 34, 0, Math.PI * 2); g.fill() }
  // 먼 산 2겹
  const ridge = (y0: number, amp: number, col: string, seed: number) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, BH)
    for (let x = 0; x <= BW; x += 40) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.006 + seed)) * amp - Math.sin(x * 0.021 + seed * 2) * amp * 0.2)
    g.lineTo(BW, BH); g.closePath(); g.fill()
  }
  if (map === 'ring') {
    // 🥊 경기장: 관중석 점 + 위에서 비추는 조명 원뿔
    for (let row = 0; row < 6; row++) for (let i = 0; i < 60; i++) {
      g.fillStyle = ['#334155', '#475569', '#1E3A5F', '#3F3F46'][(i * 7 + row * 3) % 4]
      g.beginPath(); g.arc(i * 16 + (row % 2) * 8, 150 + row * 26, 7, 0, Math.PI * 2); g.fill()
    }
    for (const x of [250, 480, 710]) {
      const cone = g.createLinearGradient(0, 0, 0, RING_FLOOR)
      cone.addColorStop(0, 'rgba(255,248,220,0.35)'); cone.addColorStop(1, 'rgba(255,248,220,0.04)')
      g.fillStyle = cone; g.beginPath(); g.moveTo(x - 18, 0); g.lineTo(x + 18, 0); g.lineTo(x + 150, RING_FLOOR); g.lineTo(x - 150, RING_FLOOR); g.closePath(); g.fill()
    }
    return c
  }
  if (map === 'isles') { ridge(410, 40, '#9FD6E6', 2) } // 먼 수평선 섬
  else if (map === 'ice') { ridge(330, 150, '#C7D7EE', 1); ridge(380, 110, '#B2C6E4', 3) }
  else if (map === 'bridge') { ridge(340, 120, '#E8A877', 2); ridge(400, 90, '#D98E5E', 5) }
  else { ridge(330, 140, '#A9CDE6', 1); ridge(390, 100, '#8DB9D6', 4) }
  // 바위섬: 아래는 바다
  if (map === 'isles') {
    const sea = g.createLinearGradient(0, 430, 0, BH)
    sea.addColorStop(0, '#2C8EC0'); sea.addColorStop(1, '#1B5E86')
    g.fillStyle = sea; g.fillRect(0, 430, BW, BH - 430)
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2
    for (let y = 445; y < BH; y += 22) { g.beginPath(); for (let x = 0; x <= BW; x += 30) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3); g.stroke() }
    return c
  }
  // 아래 낭떠러지 안개
  const fog = g.createLinearGradient(0, BH - 90, 0, BH)
  fog.addColorStop(0, 'rgba(255,255,255,0)'); fog.addColorStop(1, 'rgba(255,255,255,0.75)')
  g.fillStyle = fog; g.fillRect(0, BH - 90, BW, 90)
  return c
}

function draw(ctx: CanvasRenderingContext2D, s: BrawlState, k: number, bg: HTMLCanvasElement | null, sparks: Spark[], kos: KoMark[], shake: number, myId: string, sinceStart: number, lost = false) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (bg) ctx.drawImage(bg, 0, 0)
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0
  ctx.setTransform(k, 0, 0, k, sx * k, sy * k)
  const m = BRAWL_MAPS[s.map]

  // 무대
  if (isRing(s.map)) drawRing(ctx)
  for (const p of isRing(s.map) ? [] : s.platforms) {
    const w = p.x1 - p.x0
    const breaking = p.breaksAt !== undefined && s.time > p.breaksAt - 4 && Math.floor(s.time * 6) % 2 === 1 // 끊어지기·녹기 직전 깜빡
    if (m.key === 'bridge' && !p.main) {
      // 다리 — 나무 판자 + 밧줄, 끊어지기 직전엔 깜빡
      ctx.strokeStyle = '#6B4423'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(p.x0, p.y - 26); ctx.quadraticCurveTo((p.x0 + p.x1) / 2, p.y - 10, p.x1, p.y - 26); ctx.stroke()
      ctx.globalAlpha = breaking ? 0.45 : 1
      for (let x = p.x0; x < p.x1; x += 14) { ctx.fillStyle = (x / 14) % 2 ? '#A8723F' : '#94622F'; ctx.fillRect(x, p.y, 12, 9) }
      ctx.globalAlpha = 1
      continue
    }
    const thick = p.main ? BH - p.y + 40 : 22
    ctx.globalAlpha = breaking ? 0.45 : 1
    if (m.key === 'isles') {
      // 바위섬: 아래로 좁아지는 바위 + 풀
      ctx.fillStyle = '#8A7A68'
      ctx.beginPath(); ctx.moveTo(p.x0, p.y); ctx.lineTo(p.x1, p.y); ctx.lineTo(p.x1 - 30, BH); ctx.lineTo(p.x0 + 30, BH); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#6FB34E'; roundRect(ctx, p.x0 - 2, p.y - 2, w + 4, 9, 4); ctx.fill()
      ctx.globalAlpha = 1
      continue
    }
    if (!p.main && !m.ice) {
      // 떠 있는 바위
      ctx.fillStyle = '#7A5A3C'
      ctx.beginPath(); ctx.moveTo(p.x0, p.y); ctx.lineTo(p.x1, p.y); ctx.lineTo(p.x1 - 18, p.y + 26); ctx.lineTo((p.x0 + p.x1) / 2, p.y + 40); ctx.lineTo(p.x0 + 18, p.y + 26); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#5FA343'; roundRect(ctx, p.x0 - 2, p.y - 2, w + 4, 9, 4); ctx.fill()
      ctx.globalAlpha = 1
      continue
    }
    if (m.ice) {
      ctx.fillStyle = '#CFE6F7'; roundRect(ctx, p.x0, p.y, w, thick, p.main ? 10 : 8); ctx.fill()
      ctx.fillStyle = '#F4FBFF'; ctx.fillRect(p.x0 + 4, p.y, w - 8, 5)
      ctx.strokeStyle = 'rgba(80,130,180,0.5)'; ctx.lineWidth = 2; roundRect(ctx, p.x0, p.y, w, thick, p.main ? 10 : 8); ctx.stroke()
    } else {
      ctx.fillStyle = '#7A5A3C'; roundRect(ctx, p.x0, p.y, w, thick, p.main ? 10 : 8); ctx.fill()
      ctx.fillStyle = '#5FA343'; roundRect(ctx, p.x0 - 2, p.y - 2, w + 4, 9, 4); ctx.fill()
    }
    ctx.globalAlpha = 1
    // 무너지는 끝 — 금
    if (p.main && m.crumble && s.time > CRUMBLE_AT - 4) { // 무너지는 맵만
      ctx.strokeStyle = 'rgba(40,25,15,0.55)'; ctx.lineWidth = 1.5
      for (const ex of [p.x0 + 6, p.x1 - 6]) { ctx.beginPath(); ctx.moveTo(ex, p.y + 2); ctx.lineTo(ex + (ex < (p.x0 + p.x1) / 2 ? 8 : -8), p.y + 18); ctx.lineTo(ex, p.y + 34); ctx.stroke() }
    }
  }

  // 🌬 돌풍 줄무늬
  const wnd = windAt(s.map, s.time)
  if (wnd.acc) {
    const d = Math.sign(wnd.acc)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2
    for (let i = 0; i < 14; i++) {
      const y = 60 + ((i * 97) % 380), len = 60 + (i % 3) * 30
      const x = (((s.time * 900 * d + i * 173) % (BW + 200)) + BW + 200) % (BW + 200) - 100
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d * len, y); ctx.stroke()
    }
  }
  // 사람
  for (const f of s.fighters) if (f.lives > 0) drawFighter(ctx, f, s.time, f.id === myId, isRing(s.map))

  // 맞은 자리 불꽃
  for (const sp of sparks) {
    const a = 1 - sp.t / 0.35, r = (sp.strong ? 26 : 15) * (0.6 + sp.t * 2.2)
    ctx.strokeStyle = sp.guard ? `rgba(120,200,255,${a})` : sp.strong ? `rgba(255,170,30,${a})` : `rgba(255,255,255,${a})`
    ctx.lineWidth = sp.strong ? 4 : 2.5
    ctx.beginPath()
    for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2 + sp.x; ctx.moveTo(sp.x + Math.cos(an) * r * 0.4, sp.y + Math.sin(an) * r * 0.4); ctx.lineTo(sp.x + Math.cos(an) * r, sp.y + Math.sin(an) * r) }
    ctx.stroke()
  }
  // 떨어진 자리 — 색 기둥 + KO
  for (const ko of kos) {
    const a = Math.max(0, 1 - ko.t / 1.4)
    ctx.globalAlpha = a
    const x = Math.max(16, Math.min(BW - 16, ko.x)), y = Math.max(30, Math.min(BH - 20, ko.y))
    ctx.fillStyle = ko.color
    ctx.beginPath(); ctx.arc(x, y, 30 + ko.t * 60, 0, Math.PI * 2); ctx.globalAlpha = a * 0.35; ctx.fill(); ctx.globalAlpha = a
    ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#111827'
    const ty = Math.max(40, Math.min(BH - 40, y - 10 - ko.t * 20))
    const tx = Math.max(60, Math.min(BW - 60, x))
    ctx.strokeText('KO!', tx, ty); ctx.fillStyle = '#FDE047'; ctx.fillText('KO!', tx, ty)
    ctx.font = '700 13px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeText(ko.name, tx, ty + 18); ctx.fillStyle = '#fff'; ctx.fillText(ko.name, tx, ty + 18)
    ctx.globalAlpha = 1
  }

  ctx.setTransform(k, 0, 0, k, 0, 0)
  drawHud(ctx, s, myId)
  if (lost) {
    ctx.fillStyle = 'rgba(15,23,42,0.75)'; roundRect(ctx, BW / 2 - 170, BH / 2 - 26, 340, 52, 14); ctx.fill()
    ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#FECACA'
    ctx.fillText('📡 방장 연결이 끊겼어요 — 나가기를 눌러 주세요', BW / 2, BH / 2 + 6)
  }
  // 시작 카운트
  if (sinceStart < START_DELAY + 0.6) {
    const n = Math.ceil(START_DELAY - sinceStart)
    const txt = n > 0 ? String(Math.min(3, n)) : '시작!'
    ctx.font = '900 72px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#0F172A'
    ctx.strokeText(txt, BW / 2, BH / 2 - 20); ctx.fillStyle = n > 0 ? '#FFFFFF' : '#FDE047'; ctx.fillText(txt, BW / 2, BH / 2 - 20)
    if (n > 0) {
      ctx.font = '700 16px system-ui, sans-serif'; ctx.lineWidth = 4; const h = `${m.emoji} ${m.name} — 밀어서 떨어뜨리세요!`; ctx.strokeText(h, BW / 2, BH / 2 + 20); ctx.fillStyle = '#fff'; ctx.fillText(h, BW / 2, BH / 2 + 20)
      ctx.font = '600 13px system-ui, sans-serif'; ctx.lineWidth = 3.5; ctx.strokeText(m.hint, BW / 2, BH / 2 + 42); ctx.fillStyle = '#E2E8F0'; ctx.fillText(m.hint, BW / 2, BH / 2 + 42)
    }
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, time: number, me: boolean, ring = false) {
  const x = f.x, y = f.y, d = f.facing
  ctx.save()
  // 다운: 바닥에 누운 자세(몸을 옆으로 눕힘)
  if (f.act === 'down') { ctx.translate(x, y - 6); ctx.rotate(-d * Math.PI / 2 * 0.92); ctx.translate(-x, -(y - 6)) }
  if (f.invuln > 0 && Math.floor(time * 12) % 2) ctx.globalAlpha = 0.45
  const charging = isCharging(f)
  const lean = f.act === 'stun' ? -d * 0.5 : charging ? -d * 0.12 : f.act === 'strong' ? d * 0.15 : 0
  const hipY = y - 22, neckY = y - 44, headY = y - 52
  ctx.translate(x, hipY); ctx.rotate(lean); ctx.translate(-x, -hipY)
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // 다리
  const run = f.ground && Math.abs(f.vx) > 30 ? Math.sin(time * 18 + x * 0.05) : 0
  const air = !f.ground
  ctx.beginPath()
  ctx.moveTo(x, hipY); ctx.lineTo(x + (air ? -6 : 7 * run - 5), air ? y - 6 : y)
  ctx.moveTo(x, hipY); ctx.lineTo(x + (air ? 8 : -7 * run + 5), air ? y - 10 : y)
  ctx.stroke()
  // 몸통
  ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(x, neckY); ctx.stroke()
  // 팔 + 큰 글러브
  const shY = neckY + 4
  let front: [number, number], back: [number, number]
  if (f.act === 'jab') { const p = f.t < JAB.startup ? 0.4 : f.t < JAB.startup + JAB.active ? 1 : 0.6; front = [x + d * (14 + 24 * p), shY - 2]; back = [x + d * 10, shY + 6] }
  else if (f.act === 'strong') { const p = f.t < STRONG.startup ? 0.3 : f.t < STRONG.startup + STRONG.active ? 1 : 0.7; front = [x + d * (12 + 32 * p), shY - 4]; back = [x - d * 8, shY + 8] }
  else if (charging) { front = [x - d * (10 + 6 * f.charge), shY + 2]; back = [x + d * 10, shY + 2] }
  else if (f.act === 'guard') { front = [x + d * 13, headY + 4]; back = [x + d * 9, headY + 12] }
  else if (f.act === 'stun') { front = [x - d * 12, shY - 12]; back = [x + d * 6, shY - 14] }
  else { const b = Math.sin(time * 5 + x) * 1.5; front = [x + d * 15, shY + 2 + b]; back = [x + d * 8, shY + 8 - b] }
  ctx.beginPath(); ctx.moveTo(x, shY); ctx.lineTo(back[0], back[1]); ctx.moveTo(x, shY); ctx.lineTo(front[0], front[1]); ctx.stroke()
  // 머리
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath(); ctx.arc(x, headY, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // 눈(바라보는 쪽)
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(x + d * 3.5, headY - 1, 1.6, 0, Math.PI * 2); ctx.fill()
  if (f.act === 'stun') { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + d * 1.5, headY - 3); ctx.lineTo(x + d * 5.5, headY + 1); ctx.moveTo(x + d * 5.5, headY - 3); ctx.lineTo(x + d * 1.5, headY + 1); ctx.stroke(); ctx.lineWidth = 3.2 }
  // 머리띠(팀 색)
  ctx.strokeStyle = f.color; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(x, headY, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
  // 글러브(뒤 → 앞)
  const glove = (gx: number, gy: number, r: number) => {
    ctx.fillStyle = f.color; ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(gx - r * 0.35, gy - r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.fill()
  }
  glove(back[0], back[1], 9)
  const big = charging ? 10 + f.charge * 5 : f.act === 'strong' ? 13 : 10.5
  if (charging) { ctx.fillStyle = `rgba(253,224,71,${0.25 + 0.45 * f.charge})`; ctx.beginPath(); ctx.arc(front[0], front[1], big + 6 + Math.sin(time * 30) * 2, 0, Math.PI * 2); ctx.fill() }
  glove(front[0], front[1], big)
  ctx.restore()

  // 이름 · %
  const ty = y - BODY_H - 14
  ctx.textAlign = 'center'
  ctx.font = '700 11px system-ui, sans-serif'
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(15,23,42,0.85)'
  const label = me ? `▼ ${f.name}` : f.name
  ctx.strokeText(label, x, ty - 12); ctx.fillStyle = me ? '#FDE047' : '#FFFFFF'; ctx.fillText(label, x, ty - 12)
  if (ring) {
    // 체력 막대
    const hp = Math.max(0, 100 - f.pct)
    ctx.fillStyle = 'rgba(15,23,42,0.75)'; roundRect(ctx, x - 22, ty - 5, 44, 7, 3); ctx.fill()
    ctx.fillStyle = hpColor(hp); roundRect(ctx, x - 21, ty - 4, 42 * hp / 100, 5, 2.5); ctx.fill()
  } else {
    ctx.font = '900 13px system-ui, sans-serif'
    ctx.strokeText(`${Math.round(f.pct)}%`, x, ty + 2); ctx.fillStyle = pctColor(f.pct); ctx.fillText(`${Math.round(f.pct)}%`, x, ty + 2)
  }
  // 다운: 연타 게이지 + 남은 시간
  if (f.act === 'down') {
    const k = Math.min(1, f.mash / MASH_NEED), left = Math.max(0, DOWN_SEC - f.downT)
    ctx.font = '900 14px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#7F1D1D'
    const txt = me ? `DOWN! Space 연타 ${f.mash}/${MASH_NEED}` : `DOWN ${f.mash}/${MASH_NEED}`
    ctx.strokeText(txt, x, ty - 30); ctx.fillStyle = '#FDE047'; ctx.fillText(txt, x, ty - 30)
    ctx.fillStyle = 'rgba(15,23,42,0.75)'; roundRect(ctx, x - 40, ty - 24, 80, 8, 4); ctx.fill()
    ctx.fillStyle = '#22C55E'; roundRect(ctx, x - 39, ty - 23, 78 * k, 6, 3); ctx.fill()
    ctx.strokeStyle = '#F87171'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 52, ty - 20, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / DOWN_SEC)); ctx.stroke()
  }
  // 화면 위로 날아갔을 때 위치 표시
  if (y < 0) { ctx.fillStyle = f.color; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x - 7, 18); ctx.lineTo(x + 7, 18); ctx.closePath(); ctx.fill() }
}

const hpColor = (hp: number) => (hp > 60 ? '#22C55E' : hp > 30 ? '#F59E0B' : '#EF4444')

// 🥊 링: 매트·앞치마·기둥·로프 3줄
function drawRing(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#1E3A5F'; ctx.fillRect(ROPE_L - 40, RING_FLOOR + 14, ROPE_R - ROPE_L + 80, BH - RING_FLOOR) // 링 옆면
  ctx.fillStyle = '#2563EB'; ctx.fillRect(ROPE_L - 30, RING_FLOOR, ROPE_R - ROPE_L + 60, 16) // 매트
  ctx.fillStyle = '#3B82F6'; ctx.fillRect(ROPE_L - 30, RING_FLOOR, ROPE_R - ROPE_L + 60, 4)
  for (const px of [ROPE_L, ROPE_R]) {
    ctx.fillStyle = '#CBD5E1'; roundRect(ctx, px - 6, RING_FLOOR - 120, 12, 124, 4); ctx.fill()
    ctx.fillStyle = '#E11D48'; roundRect(ctx, px - 8, RING_FLOOR - 126, 16, 14, 4); ctx.fill()
  }
  ;(['#DC2626', '#F8FAFC', '#2563EB'] as const).forEach((c, i) => {
    const y = RING_FLOOR - 100 + i * 32
    ctx.strokeStyle = c; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(ROPE_L, y); ctx.quadraticCurveTo((ROPE_L + ROPE_R) / 2, y + 6, ROPE_R, y); ctx.stroke()
  })
}

const pctColor = (p: number) => (p < 40 ? '#FFFFFF' : p < 80 ? '#FDE047' : p < 120 ? '#FB923C' : '#EF4444')

function drawHud(ctx: CanvasRenderingContext2D, s: BrawlState, myId: string) {
  // 위: 남은 시간 + 무너짐 안내
  const left = Math.max(0, Math.ceil((isRing(s.map) ? RING_TIME : TIME_LIMIT) - s.time))
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(15,23,42,0.6)'; roundRect(ctx, BW / 2 - 46, 8, 92, 28, 14); ctx.fill()
  ctx.font = '800 15px system-ui, sans-serif'; ctx.fillStyle = '#fff'
  ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, BW / 2, 27)
  const toCrumble = CRUMBLE_AT - s.time
  const toMelt = CRUMBLE_AT + 20 - s.time
  const warnTxt = isRing(s.map) ? null : toCrumble > 0 && toCrumble < 6 ? (s.map === 'bridge' ? `⚠ ${Math.ceil(toCrumble)}초 뒤 다리가 끊어져요` : s.map === 'isles' ? `⚠ ${Math.ceil(toCrumble)}초 뒤 왼쪽 섬이 가라앉아요` : `⚠ ${Math.ceil(toCrumble)}초 뒤 땅이 무너져요`)
    : toMelt > 0 && toMelt < 6 && s.map === 'ice' ? `⚠ ${Math.ceil(toMelt)}초 뒤 양옆 얼음이 녹아요`
    : toMelt > 0 && toMelt < 6 && s.map === 'isles' ? `⚠ ${Math.ceil(toMelt)}초 뒤 오른쪽 섬이 가라앉아요` : null
  const wn = windAt(s.map, s.time)
  const gustTxt = wn.warn ? `💨 곧 돌풍 ${wn.warn > 0 ? '→' : '←'}` : wn.acc ? `💨 돌풍 ${wn.acc > 0 ? '→→' : '←←'} (↓ 가드로 버티기)` : null
  if (gustTxt) {
    ctx.font = '800 14px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#0C4A6E'
    ctx.strokeText(gustTxt, BW / 2, warnTxt ? 76 : 56); ctx.fillStyle = '#E0F2FE'; ctx.fillText(gustTxt, BW / 2, warnTxt ? 76 : 56)
  }
  if (warnTxt) {
    ctx.font = '800 14px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#7F1D1D'
    const t = warnTxt
    ctx.strokeText(t, BW / 2, 56); ctx.fillStyle = '#FECACA'; ctx.fillText(t, BW / 2, 56)
  }
  // 아래: 사람별 카드
  const n = s.fighters.length, cw = Math.min(170, (BW - 40) / n - 8), gap = 8
  const x0 = BW / 2 - (n * cw + (n - 1) * gap) / 2
  s.fighters.forEach((f, i) => {
    const x = x0 + i * (cw + gap), y = BH - 50
    const dead = f.lives <= 0
    ctx.globalAlpha = dead ? 0.45 : 1
    ctx.fillStyle = 'rgba(15,23,42,0.72)'; roundRect(ctx, x, y, cw, 42, 10); ctx.fill()
    if (f.id === myId) { ctx.strokeStyle = '#FDE047'; ctx.lineWidth = 2; roundRect(ctx, x, y, cw, 42, 10); ctx.stroke() }
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x + 16, y + 21, 9, 0, Math.PI * 2); ctx.fill()
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#E2E8F0'
    ctx.fillText(f.name.length > 7 ? f.name.slice(0, 7) + '…' : f.name, x + 31, y + 17)
    if (isRing(s.map)) {
      const hp = dead ? 0 : Math.max(0, 100 - f.pct)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, x + 31, y + 25, cw - 75, 8, 4); ctx.fill()
      ctx.fillStyle = hpColor(hp); roundRect(ctx, x + 31, y + 25, (cw - 75) * hp / 100, 8, 4); ctx.fill()
      ctx.textAlign = 'right'; ctx.font = '900 17px system-ui, sans-serif'; ctx.fillStyle = dead ? '#94A3B8' : hpColor(hp)
      ctx.fillText(dead ? 'KO' : `${Math.round(hp)}`, x + cw - 9, y + 27)
      if (!dead && !f.downUsed) { ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#94A3B8'; ctx.fillText('다운 1회', x + cw - 9, y + 39) }
    } else {
      ctx.fillStyle = '#F87171'; ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(dead ? '탈락' : '♥'.repeat(Math.min(5, f.lives)), x + 31, y + 33)
      ctx.textAlign = 'right'; ctx.font = '900 20px system-ui, sans-serif'; ctx.fillStyle = dead ? '#94A3B8' : pctColor(f.pct)
      ctx.fillText(dead ? '—' : `${Math.round(f.pct)}%`, x + cw - 9, y + 29)
    }
    ctx.globalAlpha = 1
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
