'use client'

// 운동장 💥 결재 포격전 화면 — 차례대로 각도·힘을 정해 쏘는 포물선 포격(1:1 / 2:2, 빈자리는 🤖 CPU).
// 방장(host) PC가 판정: 차례인 사람이 fire를 보내면 resolveShot()으로 결과를 계산해 shot(이전 상태·발사값·다음 상태)을 방송한다.
// 모두가 같은 발사값으로 궤적을 다시 계산해 그린 뒤 다음 상태로 넘어간다(결과 숫자는 방장 것을 그대로 씀).
// CPU 차례·시간 초과·나간 사람(CPU로 대신)도 방장이 처리한다. 잦은 메시지(조준)는 전용 채널 fort-{fid}로만.
// 조작: ←→ 이동(연료만큼) · ↑↓ 각도 · Space 꾹 눌러 힘 모으고 떼면 발사 · 1~6 무기(1 기본 · 2~5 이번 판 랜덤 4개 · 6 내 필살기) · A/D 화면 둘러보기.
// 맵(v2, 2026-11-09): 2D 칸 지도(터널·동굴·섬) + 넓은 맵 → 세로를 화면에 맞춰 줄이고 카메라가 차례인 사람·날아가는 포탄을 따라감, 위에 미니맵.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSideChannel } from '@/lib/useSideChannel'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import type { Equip } from '@/lib/baseballGear'
import {
  BODY_H, CELL, CHARGE_MS, ELEV_MIN, SCENERY, WH, footAt, mapOfSeed, type Scenery, type Terrain, ELEV_SPEED, FUEL, MAX_HP, MOVE_SPEED, TEAM_COLOR, TEAM_NAME, THEMES, WEAPONS, ammoOf, armsOf, firesShot, isSpecial, weaponLook,
  cpuPlan, moveAlong, mulberry32, muzzle, resolveShot, skipTurn, terrainOf, toCpu, trailAt,
  type Crater, type FortPlayer, type FortState, type FortTheme, type ArmKey, type Shot, type ShotResult, type SkinKey, type Team,
} from '@/lib/fort'
import { H, W } from '@/lib/playground'

export type FortLook = { name: string; equip: Equip; palette: { bg: string; fg: string } }
export type Aim = { x: number; y: number; facing: 1 | -1; elev: number; power: number; weapon: ArmKey }
// 꾹 누를 필요 없이 바로 쓰는 것(쏘지 않는 것 + 힘이 상관없는 ⚡ 일직선)
const instant = (w: ArmKey) => !firesShot(w) || w === 'bolt'
export type FortGameMsg =
  | { type: 'aim'; fid: string; id: string; turnNo: number; aim: Aim }
  | { type: 'fire'; fid: string; turnNo: number; shot: Shot }
  | { type: 'shot'; fid: string; turnNo: number; prev: FortState; shot: Shot; next: FortState }
  | { type: 'state'; fid: string; s: FortState }
  | { type: 'quit'; fid: string; id: string }

type Anim = { prev: FortState; shot: Shot; result: ShotResult; next: FortState; start: number }
type View = { s: FortState; anim: Anim | null; elapsed: number; myAim: Aim | null; charging: boolean; fuelLeft: number; aims: Record<string, Aim>; now: number; local: number; lost: boolean; thinking: boolean; lastPower: number | null; cam: number; zoom: number; intro: number | null }

const AIM_EVERY_MS = 160
const STATE_EVERY_MS = 3000
const HOST_LOST_MS = 10000
const CPU_THINK_MS = 1300
const ANIM_TAIL_MS = 650
const ZOOM = H / WH // 맵 세로(440)를 화면(320)에 맞춤
const VIEW_W = W / ZOOM // 화면에 보이는 맵 너비
const PAN_SPEED = 900 // A/D 둘러보기(px/초)
// 🗺 시작할 때 맵 전체를 한 번 보여 주고(INTRO_HOLD) 첫 차례인 사람 쪽으로 다가감(INTRO_MOVE). 차례 시간은 START_DELAY_MS(2.5초) 뒤부터라 손해 없음
const INTRO_HOLD = 1700
const INTRO_MOVE = 900

export default function FortArena(props: {
  fid: string
  hostId: string
  myId: string
  offset: number
  initial: FortState
  humans: number
  lookOf: (id: string) => FortLook
  send: (msg: FortGameMsg) => void // 전용 채널이 안 붙었을 때(운동장 채널로)
  listen: (fn: ((msg: FortGameMsg) => void) | null) => void
  onEnd: (s: FortState) => void
  onClose: () => void
}) {
  const { fid, hostId, myId, offset, humans } = props
  const isHost = hostId === myId
  const serverNow = () => Date.now() + offset
  const stateRef = useRef<FortState>(props.initial)
  const animRef = useRef<Anim | null>(null)
  const pendingRef = useRef<FortState | null>(null) // 애니메이션 중에 온 새 상태
  const aimsRef = useRef<Record<string, Aim>>({})
  const myAimRef = useRef<{ turnNo: number; aim: Aim; chargeStart: number | null; fuelLeft: number; fired: boolean } | null>(null)
  const keys = useRef({ left: false, right: false, up: false, down: false, panL: false, panR: false })
  const lastHostMsg = useRef(Date.now())
  const endedRef = useRef(false)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  const [view, setView] = useState<View>(() => ({ s: props.initial, anim: null, elapsed: 0, myAim: null, charging: false, fuelLeft: FUEL, aims: {}, now: Date.now() + offset, local: Date.now(), lost: false, thinking: false, lastPower: null, cam: 0, zoom: ZOOM, intro: 0 }))
  const [floats, setFloats] = useState<{ key: string; id: string; text: string; heal: boolean; big: boolean; at: number }[]>([])
  const lastPowerRef = useRef<number | null>(null)

  // ── 통신 ──
  const handleRef = useRef<(m: FortGameMsg) => void>(() => {})
  const sendG = useSideChannel<FortGameMsg>(humans > 1 ? `fort-${fid}` : null, 'g', m => handleRef.current(m), m => propsRef.current.send(m))
  const startAnim = (prev: FortState, shot: Shot, result: ShotResult, next: FortState) => {
    animRef.current = { prev, shot, result, next, start: performance.now() }
    pendingRef.current = null
    const now = Date.now()
    setFloats(f => [...f.filter(x => now - x.at < 3000), ...result.hits.map((h, i) => ({ key: `${prev.turnNo}-${i}`, id: h.id, text: h.dmg > 0 ? `-${h.dmg}` : `+${-h.dmg}`, heal: h.dmg < 0, big: isSpecial(shot.weapon), at: now + h.t }))])
  }
  // 방장: 한 발 판정 → 방송 → 내 화면도 애니메이션
  const hostShoot = (shot: Shot) => {
    const s = stateRef.current
    if (animRef.current || s.winner || shot.id !== s.active) return
    const { result, next } = resolveShot(s, shot, serverNow())
    stateRef.current = next
    if (humans > 1) sendG({ type: 'shot', fid, turnNo: s.turnNo, prev: s, shot, next })
    startAnim(s, shot, result, next)
  }
  const hostSetState = (n: FortState) => {
    stateRef.current = n
    if (humans > 1) sendG({ type: 'state', fid, s: n })
  }
  useEffect(() => {
    handleRef.current = (m: FortGameMsg) => {
      if (m.fid !== fid) return
      if (m.type === 'aim') { if (m.id !== myId) aimsRef.current = { ...aimsRef.current, [m.id]: m.aim }; return }
      if (m.type === 'fire') {
        if (isHost && m.turnNo === stateRef.current.turnNo) hostShoot(m.shot)
        return
      }
      if (m.type === 'quit') {
        if (isHost) hostSetState(toCpu(stateRef.current, m.id))
        return
      }
      if (isHost) return
      lastHostMsg.current = Date.now()
      if (m.type === 'shot') {
        const cur = animRef.current
        if (cur && cur.prev.turnNo === m.turnNo) return
        const { result } = resolveShot(m.prev, m.shot, 0) // 궤적만 다시 계산(결과 숫자는 방장 next 사용)
        stateRef.current = m.prev
        startAnim(m.prev, m.shot, result, m.next)
      } else if (m.type === 'state') {
        if (animRef.current) { if (m.s.turnNo >= animRef.current.next.turnNo) pendingRef.current = m.s; return }
        if (m.s.turnNo >= stateRef.current.turnNo) stateRef.current = m.s
      }
    }
  })
  useEffect(() => {
    props.listen(m => handleRef.current(m))
    return () => props.listen(null)
    // listen은 부모가 안정적으로 넘긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid])

  // ── 키: 포격전 중엔 여기서 먼저 잡는다 ──
  useEffect(() => {
    const ours = (e: KeyboardEvent) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key) || e.code === 'Space' || e.code === 'KeyA' || e.code === 'KeyD' || /^Digit[1-6]$/.test(e.code)
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!ours(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'ArrowLeft') keys.current.left = true
      else if (e.key === 'ArrowRight') keys.current.right = true
      else if (e.key === 'ArrowUp') keys.current.up = true
      else if (e.key === 'ArrowDown') keys.current.down = true
      else if (e.code === 'KeyA') keys.current.panL = true
      else if (e.code === 'KeyD') keys.current.panR = true
      else if (e.code === 'Space' || e.key === ' ') { if (!e.repeat) pressFire() }
      else { const me = stateRef.current.players.find(p => p.id === myId); if (me) pickWeapon(armsOf(me)[Number(e.code.slice(5)) - 1]) }
    }
    function up(e: KeyboardEvent) {
      if (!ours(e)) return
      e.stopImmediatePropagation()
      if (e.key === 'ArrowLeft') keys.current.left = false
      else if (e.key === 'ArrowRight') keys.current.right = false
      else if (e.key === 'ArrowUp') keys.current.up = false
      else if (e.key === 'ArrowDown') keys.current.down = false
      else if (e.code === 'KeyA') keys.current.panL = false
      else if (e.code === 'KeyD') keys.current.panR = false
      else if (e.code === 'Space' || e.key === ' ') releaseFire()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
  })
  const myTurnLive = () => {
    const s = stateRef.current
    const a = myAimRef.current
    return !animRef.current && !s.winner && s.active === myId && !!a && a.turnNo === s.turnNo && !a.fired
  }
  function pressFire() {
    const a = myAimRef.current
    if (!myTurnLive() || !a) return
    if (instant(a.aim.weapon)) { fireNow(); return }
    a.chargeStart = performance.now()
  }
  function releaseFire() {
    const a = myAimRef.current
    if (!a || a.chargeStart === null || !myTurnLive()) return
    a.aim.power = Math.min(1, (performance.now() - a.chargeStart) / CHARGE_MS)
    a.chargeStart = null
    fireNow()
  }
  function fireNow() {
    const a = myAimRef.current
    const s = stateRef.current
    if (!a) return
    a.fired = true
    lastPowerRef.current = instant(a.aim.weapon) ? lastPowerRef.current : a.aim.power
    const shot: Shot = { id: myId, x: a.aim.x, y: a.aim.y, facing: a.aim.facing, elev: a.aim.elev, power: a.aim.power, weapon: a.aim.weapon }
    if (isHost) hostShoot(shot)
    else sendG({ type: 'fire', fid, turnNo: s.turnNo, shot })
  }
  function pickWeapon(w: ArmKey | undefined) {
    const a = myAimRef.current
    if (!w || !a || !myTurnLive() || a.chargeStart !== null) return
    const me = stateRef.current.players.find(p => p.id === myId)
    if (!me || ammoOf(me, w) === 0) return
    a.aim.weapon = w
  }

  // ── 메인 루프 ──
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastAimSent = 0
    let lastStateSent = 0
    let cpuTurn = -1
    let cpuAt = 0
    let terrKey = ''
    let terr: Terrain = terrainOf(stateRef.current.seed, stateRef.current.mode, stateRef.current.craters)
    let cam = -1 // 카메라 왼쪽 끝(맵 x)
    const introStart = performance.now()
    let pan = 0 // A/D로 둘러본 만큼
    let panTurn = -1
    const rng = mulberry32((Date.now() & 0xffff) ^ 0x5eed)
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const now = serverNow()
      let s = stateRef.current
      let anim = animRef.current
      // 애니메이션 끝 → 다음 상태
      if (anim && t - anim.start > anim.result.endMs + ANIM_TAIL_MS) {
        const pend = pendingRef.current
        s = pend && pend.turnNo >= anim.next.turnNo ? pend : anim.next
        stateRef.current = s
        animRef.current = null
        pendingRef.current = null
        anim = null
      }
      const key = `${s.seed}:${s.craters.length}`
      if (key !== terrKey) { terrKey = key; terr = terrainOf(s.seed, s.mode, s.craters) }
      // 내 차례 준비
      const meP = s.players.find(p => p.id === myId)
      if (!anim && !s.winner && s.active === myId && meP?.alive && myAimRef.current?.turnNo !== s.turnNo) {
        const prevW = myAimRef.current?.aim.weapon ?? 'clip'
        myAimRef.current = { turnNo: s.turnNo, aim: { x: meP.x, y: meP.y, facing: meP.facing, elev: meP.elev, power: 0, weapon: ammoOf(meP, prevW) === 0 ? 'clip' : prevW }, chargeStart: null, fuelLeft: FUEL, fired: false }
        keys.current.up = keys.current.down = false
      }
      const mine = myAimRef.current && myAimRef.current.turnNo === s.turnNo && s.active === myId && !anim && !s.winner ? myAimRef.current : null
      if (mine && !mine.fired) {
        const k = keys.current
        const dir = (k.right ? 1 : 0) - (k.left ? 1 : 0)
        if (dir && mine.chargeStart === null) {
          mine.aim.facing = dir > 0 ? 1 : -1
          const want = Math.min(mine.fuelLeft, MOVE_SPEED * dt)
          if (want > 0) {
            const nxy = moveAlong(terr, mine.aim.x, mine.aim.y, dir as 1 | -1, Math.max(1, want))
            mine.fuelLeft = Math.max(0, mine.fuelLeft - Math.abs(nxy.x - mine.aim.x))
            mine.aim.x = nxy.x
            mine.aim.y = nxy.y
            pan = 0 // 움직이면 화면이 다시 나를 따라옴
          }
        }
        const de = (k.up ? 1 : 0) - (k.down ? 1 : 0)
        if (de) mine.aim.elev = Math.max(ELEV_MIN, Math.min(90, mine.aim.elev + de * ELEV_SPEED * dt))
        if (mine.chargeStart !== null) {
          mine.aim.power = Math.min(1, (performance.now() - mine.chargeStart) / CHARGE_MS)
        }
        if (humans > 1 && now - lastAimSent >= AIM_EVERY_MS) { lastAimSent = now; sendG({ type: 'aim', fid, id: myId, turnNo: s.turnNo, aim: { ...mine.aim } }) }
      }
      // 방장: CPU 차례·시간 초과·상태 박동
      if (isHost && !anim && !s.winner) {
        const act = s.players.find(p => p.id === s.active)
        if (act?.cpu) {
          if (cpuTurn !== s.turnNo) { cpuTurn = s.turnNo; cpuAt = Math.max(t + CPU_THINK_MS, introStart + INTRO_HOLD + INTRO_MOVE + 300) } // 시작 연출이 끝난 뒤에 쏨
          if (t >= cpuAt) { cpuAt = Infinity; hostShoot(cpuPlan(s, act.id, rng)) }
        } else if (now > s.turnEndsAt) {
          const la = act?.id === myId ? myAimRef.current?.aim : aimsRef.current[s.active]
          hostSetState(skipTurn(s, la ? { x: la.x, y: la.y, facing: la.facing, elev: la.elev } : null, now))
        }
        if (humans > 1 && now - lastStateSent >= STATE_EVERY_MS) { lastStateSent = now; sendG({ type: 'state', fid, s: stateRef.current }) }
      }
      const lost = !isHost && !s.winner && Date.now() - lastHostMsg.current > HOST_LOST_MS
      // 판 끝
      const shown = stateRef.current
      if (shown.winner && !animRef.current && !endedRef.current) { endedRef.current = true; propsRef.current.onEnd(shown) }
      const cur = animRef.current
      // 📷 카메라: 날아가는 포탄 → 터진 곳 → 차례인 사람(조준 중 위치) 순으로 따라감. A/D로 둘러보기(차례가 바뀌면 원위치)
      const ww = terr.w
      let focus: number | null = null
      if (cur) {
        const el = t - cur.start
        for (const tr of cur.result.trails) { const q = trailAt(tr.pts, el); if (q) { focus = q.x; break } }
        if (focus === null) { const b = [...cur.result.blasts].reverse().find(bb => bb.t <= el); if (b) focus = b.x }
        if (focus === null) focus = cur.shot.x
        pan = 0
      } else {
        const act = shown.players.find(p => p.id === shown.active)
        const la = act ? (act.id === myId ? (mine ? mine.aim : null) : aimsRef.current[act.id]) : null
        focus = la && act && Math.abs(la.x - act.x) <= FUEL + 1 ? la.x : act?.x ?? ww / 2
        if (panTurn !== shown.turnNo) { panTurn = shown.turnNo; pan = 0 }
        pan += ((keys.current.panR ? 1 : 0) - (keys.current.panL ? 1 : 0)) * PAN_SPEED * dt
        pan = Math.max(-ww, Math.min(ww, pan))
      }
      const want = Math.max(0, Math.min(ww - VIEW_W, focus + pan - VIEW_W / 2))
      // 시작 연출: 전체 맵(가로가 화면에 다 들어오게 축소) → 첫 차례 쪽으로 확대하며 이동
      const ie = t - introStart
      const zFit = Math.min(ZOOM, W / ww)
      let zoom = ZOOM
      let intro: number | null = null
      if (ie < INTRO_HOLD + INTRO_MOVE) {
        const k = ie < INTRO_HOLD ? 0 : (ie - INTRO_HOLD) / INTRO_MOVE
        const e = k * k * (3 - 2 * k)
        zoom = zFit + (ZOOM - zFit) * e
        cam = want * e
        intro = ie / (INTRO_HOLD + INTRO_MOVE)
      } else cam = cam < 0 ? want : cam + (want - cam) * Math.min(1, dt * (cur ? 6 : 4))
      setView({
        s: cur ? cur.prev : shown, anim: cur, elapsed: cur ? t - cur.start : 0,
        myAim: mine ? { ...mine.aim } : null, charging: !!mine && mine.chargeStart !== null, fuelLeft: mine?.fuelLeft ?? FUEL,
        aims: aimsRef.current, now, local: Date.now(), lost, lastPower: lastPowerRef.current,
        thinking: !cur && !shown.winner && !!shown.players.find(p => p.id === shown.active)?.cpu,
        cam, zoom, intro,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, isHost, humans, myId])

  const quit = () => {
    if (humans > 1 && !stateRef.current.winner) sendG({ type: 'quit', fid, id: myId })
    props.onClose()
  }

  // ── 그리기 ──
  const { s, anim, elapsed } = view
  // 애니메이션 중엔 폭발 시각이 지난 구덩이만 반영
  const shownCraters: Crater[] = useMemo(() => {
    if (!anim) return s.craters
    const added = anim.next.craters.slice(anim.prev.craters.length)
    return [...anim.prev.craters, ...added.filter((_, i) => (anim.result.craterTimes[i] ?? 0) <= elapsed)]
  }, [s.craters, anim, elapsed])
  const terrKey = `${s.seed}:${s.craters.length}:${shownCraters.length}`
  const terrain = useMemo(() => terrainOf(s.seed, s.mode, shownCraters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [terrKey])
  const WW = terrain.w
  const theme: FortTheme = s.theme ?? 'office'
  const TH = THEMES[theme]
  const fmap = mapOfSeed(s.seed)
  const scen = fmap.scenery ?? null // 바다·하늘·우주면 컨셉 배경 대신 그 배경, 땅도 그 색

  const animDone = anim && elapsed > anim.result.endMs
  const players: FortPlayer[] = anim && animDone ? anim.next.players : s.players
  const active = s.players.find(p => p.id === s.active)
  const isMyTurn = !anim && !s.winner && s.active === myId && !!view.myAim
  const secLeft = Math.max(0, Math.ceil((s.turnEndsAt - view.now) / 1000))
  const me = s.players.find(p => p.id === myId)
  const names = (id: string) => props.lookOf(id).name

  const posOf = (p: FortPlayer) => {
    if (!anim && !s.winner && p.id === s.active) {
      const a = p.id === myId ? view.myAim : view.aims[p.id]
      if (a && Math.abs(a.x - p.x) <= FUEL + 1 && Number.isFinite(a.y)) return { x: a.x, y: a.y, facing: a.facing, elev: a.elev, power: a.power }
    }
    const mv = anim && !animDone ? anim.result.moves?.find(m => m.id === p.id) : null
    if (mv && elapsed >= mv.t0) {
      // 🌀 끌려 들어가는 중: 가속하며 미끄러지고 살짝 떠오름
      const k = Math.min(1, (elapsed - mv.t0) / (mv.t1 - mv.t0))
      const e = k * k * (3 - 2 * k)
      const x = mv.from + (mv.to - mv.from) * e
      return { x, y: mv.fromY + (mv.toY - mv.fromY) * e - Math.sin(k * Math.PI) * 26, facing: p.facing, elev: p.elev, power: 0, spin: mv.spin ? k * 720 : 0 }
    }
    if (anim && !animDone && p.id === anim.shot.id) {
      return { x: anim.shot.x, y: anim.shot.y, facing: anim.shot.facing, elev: anim.shot.elev, power: 0 }
    }
    // 폭발로 발밑이 파이면 떨어지는 모습(다 끝난 뒤 상태가 정답)
    return { x: p.x, y: footAt(terrain, p.x, p.y) ?? p.y, facing: p.facing, elev: p.elev, power: 0 }
  }

  // 🔥 필살기 연출: 터지는 순간 화면 흔들림 + 컷인 배너
  const spAnim = anim && isSpecial(anim.shot.weapon) ? anim : null
  const shakeAge = spAnim ? Math.min(...spAnim.result.blasts.map(b => elapsed - b.t).filter(a => a >= 0 && a < 380), Infinity) : Infinity
  const shake = Number.isFinite(shakeAge) ? (1 - shakeAge / 380) * 7 : 0
  const shakeT = shake ? `translate(${(Math.sin(elapsed * 0.11) * shake).toFixed(1)}px, ${(Math.cos(elapsed * 0.13) * shake).toFixed(1)}px)` : undefined
  const windTxt = s.wind === 0 ? '없음' : `${s.wind < 0 ? '←' : '→'} ${Math.abs(s.wind).toFixed(1)}`
  const turnBanner = s.winner ? null
    : anim ? (elapsed >= anim.result.endMs - 300 ? anim.next.last : `${names(anim.shot.id)} ${isSpecial(anim.shot.weapon) ? '🔥 필살기 ' : ''}${weaponLook(theme, anim.shot.weapon).emoji} ${weaponLook(theme, anim.shot.weapon).name}${firesShot(anim.shot.weapon) ? '!' : '…'}`)
    : active ? `${s.frozenSkip?.length ? `🧊 ${s.frozenSkip.map(names).join('·')} 얼어서 쉼 → ` : ''}${active.id === myId ? '🎯 내 차례!' : `${names(active.id)} 차례${view.thinking ? ' — 🤖 조준 중…' : ''}`}` : null

  return (
    <div className="absolute inset-0 z-[45] overflow-hidden select-none" style={{ background: scen ? SCENE_SKY[scen] : SKY[theme] }}>
      <svg className="absolute inset-0" width={W} height={H} aria-hidden style={{ transform: shakeT }}>
        {scen ? <><ThemeBackdrop theme={theme} place={TH.place(s.seed)} defsOnly /><SceneryBackdrop scen={scen} seed={s.seed} /></> : <ThemeBackdrop theme={theme} place={TH.place(s.seed)} />}
      </svg>
      {/* 맵(지형·포탄·요새·이름표) — 세로를 화면에 맞춰 줄이고, 카메라(view.cam)만큼 왼쪽으로 민다 */}
      <div className="pointer-events-none absolute left-0 top-0" style={{ width: WW, height: WH, transform: `translate(${-Math.round(view.cam * view.zoom)}px, ${Math.round(H - WH * view.zoom)}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
      <TerrainCanvas terrain={terrain} theme={theme} scen={scen} shake={shakeT} />
      <svg className="absolute inset-0" width={WW} height={WH} aria-hidden style={{ transform: shakeT, overflow: 'visible' }}>
        {scen === 'sea' && (
          <g opacity="0.85">
            <rect x={-40} y={WH - 34} width={WW + 80} height={80} fill="#0EA5E9" opacity="0.55" />
            <path d={Array.from({ length: Math.ceil(WW / 40) + 2 }, (_, i) => `${i ? 'Q' : 'M'}${i * 40 - 20} ${WH - 34 + (i % 2 ? -5 : 0)}${i ? ` ${i * 40} ${WH - 34}` : ''}`).join(' ')} fill="none" stroke="#E0F2FE" strokeWidth="2.5" />
          </g>
        )}
        {scen === 'sky' && Array.from({ length: Math.ceil(WW / 230) }, (_, i) => <ellipse key={i} cx={i * 230 + 100} cy={WH - 8 + (i % 2) * 6} rx={100} ry={24} fill="#fff" opacity="0.85" />)}
        {/* 궤적·포탄 */}
        {anim && anim.result.trails.map((tr, i) => {
          const p = trailAt(tr.pts, elapsed)
          const past = tr.pts.filter(q => q.t <= elapsed)
          return (
            <g key={i}>
              {past.length > 1 && <polyline points={past.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} fill="none" stroke="#475569" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.4" />}
              {/* 천장에 붙지 않고 화면 위로 그대로 빠져나갔다가 다시 떨어져 들어온다 */}
              {p && <text x={p.x} y={p.y} fontSize="17" textAnchor="middle" dominantBaseline="central">{tr.emoji}</text>}
            </g>
          )
        })}
        {anim && anim.result.blasts.map((b, i) => {
          const age = elapsed - b.t
          if (age < 0 || age > 450) return null
          const k = age / 450
          return (
            <g key={i}>
              <circle cx={b.x} cy={b.y} r={b.r * (0.35 + 0.65 * k)} fill={b.weapon === 'reject' ? '#FDE68A' : b.weapon === 'wall' ? '#A8957A' : b.weapon === 'warp' ? '#67E8F9' : isSpecial(b.weapon) ? '#F43F5E' : '#FB923C'} opacity={0.75 * (1 - k)} />
              <circle cx={b.x} cy={b.y} r={b.r * (0.2 + 0.4 * k)} fill="#FEF3C7" opacity={0.8 * (1 - k)} />
              {isSpecial(b.weapon) && <circle cx={b.x} cy={b.y} r={b.r + 90 * k} fill="none" stroke="#FACC15" strokeWidth={5 * (1 - k)} opacity={0.9 * (1 - k)} />}
            </g>
          )
        })}
        {anim && anim.shot.weapon === 'vortex' && (() => {
          const ms = anim.result.moves ?? []
          const c = anim.result.blasts.at(-1)
          if (!c) return null
          const t0 = ms.length ? Math.min(...ms.map(m => m.t0)) - 60 : c.t - 500
          const age = elapsed - t0
          if (age < 0 || elapsed > c.t + 120) return null
          const k = Math.min(1, age / 300)
          return (
            <g transform={`rotate(${(-age * 0.9).toFixed(0)} ${c.x.toFixed(1)} ${c.y.toFixed(1)})`} opacity={0.85}>
              {[0, 1, 2].map(i => <circle key={i} cx={c.x} cy={c.y} r={(30 + i * 34) * k} fill="none" stroke="#38BDF8" strokeWidth={4 - i} strokeDasharray="18 12" opacity={1 - i * 0.25} />)}
              <text x={c.x} y={c.y} fontSize={22 + 14 * k} textAnchor="middle" dominantBaseline="central">{weaponLook(theme, 'vortex').emoji}</text>
            </g>
          )
        })()}
        {/* 요새 */}
        {players.map(p => {
          if (!p.alive && !(anim && !animDone)) return null
          const pos = posOf(p)
          const spin = 'spin' in pos ? pos.spin : 0
          return (
            <g key={p.id} transform={spin ? `rotate(${spin.toFixed(0)} ${pos.x.toFixed(1)} ${(pos.y - BODY_H / 2).toFixed(1)})` : undefined}>
              <Fortress theme={theme} skin={p.skin} team={p.team} x={pos.x} y={pos.y} facing={pos.facing} elev={pos.elev} dead={!p.alive} activeNow={!anim && !s.winner && p.id === s.active} />
            </g>
          )
        })}
      </svg>

      {/* 이름표·체력·캐릭터 */}
      {players.map(p => {
        if (!p.alive) return null
        const pos = posOf(p)
        const look = props.lookOf(p.id)
        return (
          <div key={p.id} className="pointer-events-none absolute flex flex-col items-center" style={{ left: pos.x, top: pos.y - BODY_H - 4, transform: 'translate(-50%, -100%)' }}>
            <span className={`mb-[1px] whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-bold shadow ${p.id === myId ? 'bg-[#E0A526] text-white' : 'bg-white/90 text-[#1F2933]'}`}>
              <span style={{ color: p.id === myId ? '#fff' : TEAM_COLOR[p.team] }}>●</span> {look.name}{p.frozen ? ' 🧊' : ''}
            </span>
            <div className="h-[4px] w-[38px] overflow-hidden rounded-full bg-black/20">
              <div className="h-full rounded-full" style={{ width: `${(p.hp / MAX_HP) * 100}%`, background: p.hp > 50 ? '#22C55E' : p.hp > 25 ? '#F59E0B' : '#EF4444' }} />
            </div>
            <div style={{ transform: `scaleX(${pos.facing})`, marginTop: 1 }}>
              <CharacterSprite equip={look.equip} name={look.name} size={24} kind="pitcher" colorBg={look.palette.bg} colorFg={look.palette.fg} />
            </div>
          </div>
        )
      })}
      {/* 🏹 활(방망이 대신) + 내 조준선 — 캐릭터 위에 그린다 */}
      <svg className="pointer-events-none absolute inset-0" width={WW} height={WH} aria-hidden style={{ overflow: 'visible' }}>
        {players.map(p => {
          if (!p.alive) return null
          const pos = posOf(p)
          const aiming = !anim && !s.winner && p.id === s.active
          const aimW = p.id === myId ? view.myAim?.weapon : view.aims[p.id]?.weapon
          const pull = aiming ? (p.id === myId ? (view.charging ? pos.power : 0) : pos.power) : 0
          return <Bow key={p.id} x={pos.x + pos.facing * 9} y={pos.y - BODY_H - 15} facing={pos.facing} elev={pos.elev} pull={pull}
            ammo={aiming && aimW && firesShot(aimW) ? weaponLook(theme, aimW).emoji : null} />
        })}
        {isMyTurn && view.myAim && me && firesShot(view.myAim.weapon) && (() => {
          const a = (view.myAim.elev * Math.PI) / 180
          // ⚡ 일직선은 날아갈 선을 앞쪽 300px까지만 보여 준다(그 뒤는 직접 가늠)
          const m = muzzle({ x: view.myAim.x, y: view.myAim.y, facing: view.myAim.facing, elev: view.myAim.elev })
          const bolt = view.myAim.weapon === 'bolt'
          const bx = bolt ? m.x : view.myAim.x + view.myAim.facing * 9, by = bolt ? m.y : view.myAim.y - BODY_H - 15
          const len = bolt ? 300 : 60
          return <line x1={bx + view.myAim.facing * 14 * Math.cos(a)} y1={by - 14 * Math.sin(a)} x2={bx + view.myAim.facing * len * Math.cos(a)} y2={by - len * Math.sin(a)} stroke={bolt ? '#F59E0B' : '#0F172A'} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.55" />
        })()}
      </svg>
      {/* 피해 숫자 */}
      {floats.map(f => {
        const age = view.local - f.at
        if (age < 0 || age > 1100) return null
        const pl = players.find(q => q.id === f.id)
        if (!pl) return null
        const p = posOf(pl) // 끌려가는 중이면 그 자리 위에
        return (
          <span key={f.key} className={`pointer-events-none absolute font-black drop-shadow ${f.big ? 'text-[26px]' : 'text-[16px]'} ${f.heal ? 'text-[#16A34A]' : f.big ? 'text-[#F59E0B]' : 'text-[#DC2626]'}`}
            style={{ left: p.x, top: p.y - BODY_H - 46 - age / 30, transform: `translateX(-50%) scale(${f.big ? 1 + Math.max(0, 0.6 - age / 250) : 1})`, opacity: 1 - age / 1100, WebkitTextStroke: f.big && !f.heal ? '1px #7C2D12' : undefined }}>{f.text}</span>
        )
      })}

      </div>

      {view.intro !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] flex justify-center" style={{ opacity: view.intro < 0.62 ? 1 : Math.max(0, 1 - (view.intro - 0.62) / 0.3) }}>
          <div className="flex flex-col items-center rounded-2xl bg-[#0F172A]/80 px-7 py-2.5 text-white shadow-2xl">
            <span className="text-[11px] font-bold tracking-widest text-white/70">이번 판 맵</span>
            <span className="text-[24px] font-black">{fmap.emoji} {fmap.name}</span>
            {(fmap.tag || scen) && <span className="text-[11.5px] font-semibold text-[#FDE68A]">{[fmap.tag, scen === 'space' ? '🪶 저중력 · 바람 없음' : null].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
      )}

      {spAnim && elapsed < 1300 && (() => {
        const k = elapsed / 1300
        const who = spAnim.prev.players.find(p => p.id === spAnim.shot.id)
        const lk = weaponLook(theme, spAnim.shot.weapon)
        return (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center" style={{ opacity: k < 0.8 ? 1 : (1 - k) / 0.2 }}>
            <div className="flex items-center gap-3 px-8 py-2 text-white shadow-2xl" style={{ background: `linear-gradient(90deg, transparent, ${who ? TEAM_COLOR[who.team] : '#0F172A'} 18%, ${who ? TEAM_COLOR[who.team] : '#0F172A'} 82%, transparent)`, transform: `translateX(${(1 - Math.min(1, elapsed / 180)) * -120}px) skewX(-8deg)` }}>
              <span className="text-[13px] font-black tracking-widest text-[#FDE68A]">필살기!</span>
              <span className="text-[30px]">{lk.emoji}</span>
              <span className="text-[22px] font-black">{lk.name}</span>
              <span className="text-[12px] font-semibold opacity-80">— {names(spAnim.shot.id)}</span>
            </div>
          </div>
        )
      })()}
      {/* 위: 팀 체력·바람·차례 */}
      <div className="pointer-events-none absolute inset-x-3 top-2 flex items-start justify-between">
        {(['A', 'B'] as Team[]).map(tm => (
          <div key={tm} className="flex items-start gap-2">
          <div className={`flex flex-col gap-0.5 rounded-xl bg-white/85 px-2.5 py-1.5 shadow-sm ${tm === 'B' ? 'items-end' : ''}`}>
            <span className="text-[10.5px] font-extrabold" style={{ color: TEAM_COLOR[tm] }}>{TEAM_NAME[tm]}</span>
            {players.filter(p => p.team === tm).map(p => (
              <span key={p.id} className={`text-[10.5px] font-semibold ${p.alive ? 'text-[#1F2933]' : 'text-[#94A3B8] line-through'}`}>
                {names(p.id)} {p.alive ? p.hp : p.out === 'pushed' ? '밀려남' : p.out === 'fell' ? '추락' : 'KO'}
              </span>
            ))}
          </div>
          {/* 미니맵 — 위쪽 안내 줄(파랑팀 상자 옆)에 두어 경기 화면을 가리지 않게. 시작 연출 중엔 숨김 */}
          {tm === 'A' && view.intro === null && <MiniMap terrain={terrain} players={players.filter(p => p.alive).map(p => ({ id: p.id, x: posOf(p).x, y: posOf(p).y, team: p.team, me: p.id === myId, active: !anim && p.id === s.active }))} cam={view.cam} viewW={W / view.zoom} />}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-xl bg-[#0F172A]/85 px-3 py-1 text-[11.5px] font-bold text-white">
          <span>{scen ? `${SCENE_EMOJI[scen]} ${SCENERY[scen].name}` : `${TH.emoji} ${TH.place(s.seed)}`} · {fmap.emoji} {fmap.name}{scen === 'space' ? ' · 🪶 저중력' : ''} · 🌬 {scen === 'space' ? '바람 없음' : `${TH.wind} ${windTxt}`}</span>
          {!s.winner && !anim && <span className={secLeft <= 5 ? 'text-[#FCA5A5]' : 'text-white/75'}>⏱ {secLeft}초</span>}
          <span className="text-white/60">#{s.turnNo + 1}</span>
        </div>
        {turnBanner && <span className={`rounded-full px-3 py-0.5 text-[12px] font-black shadow ${isMyTurn ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/90 text-[#1F2933]'}`}>{turnBanner}</span>}
      </div>

      {/* 아래: 내 차례 조작판 */}
      {isMyTurn && view.myAim && me && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-6">
          <div className="flex gap-1">
            {armsOf(me).map((w, i) => {
              const left = ammoOf(me, w)
              const on = view.myAim!.weapon === w
              const sp = isSpecial(w)
              return (
                <button key={w} type="button" disabled={left === 0} onMouseDown={e => e.preventDefault()} onClick={() => pickWeapon(w)} title={`${weaponLook(theme, w).name} — ${WEAPONS[w].help}`}
                  className={`relative flex w-[74px] flex-col items-center rounded-lg px-1 py-1 text-[10px] font-bold leading-tight transition-colors ${sp ? 'ring-2 ring-[#F97316]' : ''} ${on ? 'bg-[#FACC15] text-[#1F2933]' : left === 0 ? 'bg-white/20 text-white/40' : 'bg-white/85 text-[#1F2933] hover:bg-white'}`}>
                  {sp && <span className="absolute -top-2 rounded-full bg-[#F97316] px-1.5 text-[8.5px] font-black text-white">필살기</span>}
                  <span className="text-[15px] leading-none">{weaponLook(theme, w).emoji}</span>
                  <span className="max-w-full truncate">{i + 1} {weaponLook(theme, w).name}</span>
                  <span className="max-w-full truncate text-[9px] font-semibold opacity-75">{WEAPONS[w].tag}</span>
                  <span className="text-[9px] font-semibold opacity-60">{left < 0 ? '∞' : `${left}번`}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col items-end gap-1 text-[10.5px] font-bold text-white">
            <span className="max-w-[330px] truncate text-[10px] font-semibold text-white/85">{weaponLook(theme, view.myAim.weapon).emoji} {WEAPONS[view.myAim.weapon].help}</span>
            <div className="flex items-center gap-3">
              <span>각도 {Math.round(view.myAim.elev)}°</span>
              <span>연료 <span className="inline-block h-[6px] w-[50px] overflow-hidden rounded-full bg-white/25 align-middle"><span className="block h-full bg-[#38BDF8]" style={{ width: `${(view.fuelLeft / FUEL) * 100}%` }} /></span></span>
            </div>
            <div className="relative h-[12px] w-[260px] overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full" style={{ width: `${view.myAim.power * 100}%`, background: 'linear-gradient(90deg,#22C55E,#FACC15,#EF4444)' }} />
              {view.lastPower !== null && <div className="absolute top-0 h-full w-[2px] bg-white" style={{ left: `${view.lastPower * 100}%` }} title="지난번 힘" />}
            </div>
            <div className="flex gap-1">
              {([['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼']] as const).map(([k, label]) => (
                <HoldBtn key={k} label={label} on={v => { const kk = keys.current; if (k === 'ArrowLeft') kk.left = v; else if (k === 'ArrowRight') kk.right = v; else if (k === 'ArrowUp') kk.up = v; else kk.down = v }} />
              ))}
              <HoldBtn label={instant(view.myAim.weapon) ? `${weaponLook(theme, view.myAim.weapon).emoji} 쓰기` : view.charging ? '떼면 발사!' : '꾹 → 발사'} wide on={v => (v ? pressFire() : releaseFire())} />
            </div>
          </div>
        </div>
      )}
      {!isMyTurn && !s.winner && (
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] font-semibold text-[#334155]">←→ 이동 · ↑↓ 각도 · Space 꾹 눌러 힘 모으고 떼면 발사 · 1~6 무기(6 = 필살기) · A/D 둘러보기</p>
      )}

      {(s.winner || view.lost) && !anim && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
          {view.lost && !s.winner ? <p className="text-[18px] font-black">📡 방장과 연결이 끊겼어요</p> : (
            <>
              <p className="text-[34px]">{s.winner === 'draw' ? '🤝' : me && s.winner === me.team ? '🏆' : '😵'}</p>
              <p className="text-[20px] font-black">{s.winner === 'draw' ? '무승부' : `${TEAM_NAME[s.winner as Team]} 승리!`}</p>
              <p className="text-[12px] text-white/80">{s.players.filter(p => p.team === s.winner).map(p => names(p.id)).join(' · ')}{s.last?.startsWith('⏱') ? ` — ${s.last}` : ''}</p>
              {humans < 2 && <p className="text-[11px] text-white/60">CPU와 한 판은 전적에 들어가지 않아요</p>}
            </>
          )}
        </div>
      )}
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={quit}
        className="absolute bottom-2 right-2 z-10 rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-[#1F2933] hover:bg-white"
        style={isMyTurn ? { bottom: 'auto', top: 70 } : undefined}>
        {s.winner || view.lost ? '광장으로' : '그만하기'}
      </button>
    </div>
  )
}

function HoldBtn({ label, on, wide = false }: { label: string; on: (down: boolean) => void; wide?: boolean }) {
  const [down, setDown] = useState(false)
  const release = () => { if (!down) return; setDown(false); on(false) }
  return (
    <button type="button" onMouseDown={e => e.preventDefault()}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDown(true); on(true) }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e => e.preventDefault()}
      className={`touch-none rounded-lg py-1 text-[11px] font-black ${wide ? 'px-3' : 'w-8'} ${down ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/85 text-[#1F2933] hover:bg-white'}`}>
      {label}
    </button>
  )
}

// ── 지형 그리기(2D 칸 지도 → 캔버스) ─────────────────
// 땅 칸마다 색: 위가 뚫린 표면 몇 줄은 표면색(잔디·종이 끝 등), 옆·아래가 빈 칸은 테두리색, 나머지는 바탕 + 잔무늬.
const GROUND_LOOK: Record<FortTheme | Scenery, { base: [number, number, number]; dot: [number, number, number]; top: [number, number, number]; edge: [number, number, number]; band: number }> = {
  office: { base: [232, 220, 196], dot: [214, 199, 168], top: [190, 172, 140], edge: [168, 149, 122], band: 2 },
  workshop: { base: [154, 107, 63], dot: [125, 84, 48], top: [76, 175, 80], edge: [63, 155, 63], band: 4 },
  road: { base: [75, 85, 99], dot: [107, 114, 128], top: [55, 65, 81], edge: [40, 48, 60], band: 2 },
  sea: { base: [168, 162, 158], dot: [140, 134, 130], top: [120, 113, 108], edge: [87, 83, 78], band: 2 },
  sky: { base: [248, 250, 252], dot: [226, 232, 240], top: [255, 255, 255], edge: [186, 198, 214], band: 3 },
  space: { base: [100, 116, 139], dot: [71, 85, 105], top: [148, 163, 184], edge: [51, 65, 85], band: 2 },
}
function paintTerrain(cv: HTMLCanvasElement, t: Terrain, look: (typeof GROUND_LOOK)[FortTheme]) {
  const { cols, rows, solid } = t
  cv.width = cols
  cv.height = rows
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(cols, rows)
  const d = img.data
  // 땅속 빈 곳(위에도 아래에도 땅이 있는 칸 = 터널·동굴·벙커 안)은 바탕색을 어둡게 칠해 굴처럼 보이게
  const cave = [Math.round(look.base[0] * 0.45), Math.round(look.base[1] * 0.42), Math.round(look.base[2] * 0.4)]
  for (let c = 0; c < cols; c++) {
    let lastSolid = -1
    for (let r = rows - 1; r >= 0; r--) if (solid[r * cols + c]) { lastSolid = r; break }
    let depth = 0
    let seenSolid = false
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c
      if (!solid[i]) {
        depth = 0
        if (seenSolid && r < lastSolid) { const o = i * 4; d[o] = cave[0]; d[o + 1] = cave[1]; d[o + 2] = cave[2]; d[o + 3] = 215 }
        continue
      }
      seenSolid = true
      depth++
      const side = (c > 0 && !solid[i - 1]) || (c < cols - 1 && !solid[i + 1]) || (r < rows - 1 && !solid[i + cols])
      const col = depth <= 1 ? look.edge : depth <= look.band ? look.top : side ? look.edge : ((c * 7 + r * 13) % 23 === 0 || (r % 4 === 0 && look === GROUND_LOOK.office)) ? look.dot : look.base
      const o = i * 4
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
// 칸 해상도(2px)로 만든 그림을 화면 실제 픽셀(줄인 배율 × 기기 픽셀 밀도) 크기 캔버스에 부드럽게 옮겨 그린다
// — 칸 그림을 그대로 늘리면(pixelated) 경계가 계단처럼 깨져 보임(2026-11-09)
function TerrainCanvas({ terrain, theme, scen, shake }: { terrain: Terrain; theme: FortTheme; scen: Scenery | null; shake?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const srcRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const src = (srcRef.current ??= document.createElement('canvas'))
    paintTerrain(src, terrain, GROUND_LOOK[scen ?? theme])
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const w = Math.round(terrain.cols * CELL * ZOOM * dpr), h = Math.round(terrain.rows * CELL * ZOOM * dpr)
    if (cv.width !== w) cv.width = w
    if (cv.height !== h) cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, w, h)
  }, [terrain, theme, scen])
  return <canvas ref={ref} className="absolute left-0 top-0" style={{ width: terrain.cols * CELL, height: terrain.rows * CELL, transform: shake }} />
}
// 위쪽 미니맵 — 전체 지형 실루엣 + 요새 점 + 지금 보이는 범위
const MINI_W = 180
function MiniMap({ terrain, players, cam, viewW }: { terrain: Terrain; players: { id: string; x: number; y: number; team: Team; me: boolean; active: boolean }[]; cam: number; viewW: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const k = MINI_W / terrain.w
  const mh = Math.round(terrain.h * k)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const step = Math.max(1, Math.round(1 / (k * CELL)))
    cv.width = Math.ceil(terrain.cols / step)
    cv.height = Math.ceil(terrain.rows / step)
    const img = ctx.createImageData(cv.width, cv.height)
    for (let r = 0; r < cv.height; r++) for (let c = 0; c < cv.width; c++) {
      if (!terrain.solid[r * step * terrain.cols + c * step]) continue
      const o = (r * cv.width + c) * 4
      img.data[o] = 71; img.data[o + 1] = 85; img.data[o + 2] = 105; img.data[o + 3] = 230
    }
    ctx.putImageData(img, 0, 0)
  }, [terrain, k])
  return (
    <div className="pointer-events-none relative overflow-hidden rounded-md bg-white/55 shadow-sm ring-1 ring-black/10" style={{ width: MINI_W, height: mh }}>
      <canvas ref={ref} className="absolute inset-0" style={{ width: MINI_W, height: mh }} />
      <div className="absolute top-0 h-full rounded-sm border border-[#0F172A]/60" style={{ left: cam * k, width: Math.min(MINI_W, viewW * k) }} />
      {players.map(p => (
        <span key={p.id} className={`absolute rounded-full ${p.active ? 'ring-2 ring-[#FACC15]' : ''}`}
          style={{ left: p.x * k - 3, top: (p.y - 8) * k - 3, width: 6, height: 6, background: p.me ? '#E0A526' : TEAM_COLOR[p.team] }} />
      ))}
    </div>
  )
}

// ── 컨셉별 그림 ────────────────────────────────────
const SKY: Record<FortTheme, string> = {
  office: 'linear-gradient(#CFE0F1, #EEF3F9 70%)',
  workshop: 'linear-gradient(#9FD4F5, #E3F4FD 75%)',
  road: 'linear-gradient(#C9D5E2, #EEF2F6 75%)',
}

// 🌊 바다·☁ 하늘·🌌 우주 맵 배경(컨셉 배경 대신)
const SCENE_SKY: Record<Scenery, string> = {
  sea: 'linear-gradient(#7DD3FC, #E0F2FE 62%, #38BDF8 63%, #0284C7)',
  sky: 'linear-gradient(#60A5FA, #BFDBFE 60%, #EFF6FF)',
  space: 'radial-gradient(ellipse at 70% 20%, #1E3A8A 0%, #0B1026 55%, #020617 100%)',
}
const SCENE_EMOJI: Record<Scenery, string> = { sea: '🌊', sky: '☁️', space: '🌌' }
function SceneryBackdrop({ scen, seed }: { scen: Scenery; seed: number }) {
  if (scen === 'space') {
    const r = mulberry32(seed ^ 0x51a7)
    return (
      <g>
        {Array.from({ length: 70 }, (_, i) => <circle key={i} cx={r() * W} cy={r() * H * 0.9} r={r() < 0.15 ? 1.6 : 0.8} fill="#fff" opacity={0.4 + r() * 0.6} />)}
        <circle cx={W * 0.78} cy={70} r={34} fill="#F59E0B" opacity="0.9" />
        <ellipse cx={W * 0.78} cy={70} rx={56} ry={10} fill="none" stroke="#FDE68A" strokeWidth="3" opacity="0.8" />
        <circle cx={W * 0.18} cy={52} r={18} fill="#38BDF8" opacity="0.85" />
        <circle cx={W * 0.18 - 5} cy={48} r={7} fill="#22C55E" opacity="0.8" />
      </g>
    )
  }
  if (scen === 'sky') {
    return (
      <g opacity="0.9">
        <circle cx={W - 120} cy={58} r={26} fill="#FEF3C7" />
        {[[120, 70, 60], [380, 40, 46], [640, 90, 70], [900, 50, 50], [260, 150, 80], [780, 170, 64]].map(([x, y, w], i) => (
          <g key={i} fill="#fff" opacity="0.8"><ellipse cx={x} cy={y} rx={w} ry={w * 0.32} /><ellipse cx={x - w * 0.35} cy={y + 4} rx={w * 0.5} ry={w * 0.26} /></g>
        ))}
      </g>
    )
  }
  return (
    <g>
      <circle cx={W - 140} cy={60} r={26} fill="#FDE68A" opacity="0.95" />
      {[[200, 60], [520, 40], [760, 80]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q8 -8 16 0 q8 -8 16 0`} fill="none" stroke="#334155" strokeWidth="1.6" opacity="0.6" />)}
      <path d={`M0 ${H * 0.62} Q ${W * 0.25} ${H * 0.6} ${W * 0.5} ${H * 0.62} T ${W} ${H * 0.62}`} fill="none" stroke="#E0F2FE" strokeWidth="2" opacity="0.7" />
    </g>
  )
}

// 배경(하늘·벽·건물) + 지형 무늬(defs). place = 오늘 장소 이름(표지판). defsOnly = 무늬만(바다·하늘·우주 맵)
function ThemeBackdrop({ theme, place, defsOnly = false }: { theme: FortTheme; place: string; defsOnly?: boolean }) {
  return (
    <>
      <defs>
        <pattern id="fort-ground-office" width="12" height="7" patternUnits="userSpaceOnUse">
          <rect width="12" height="7" fill="#F3EBD9" />
          <line x1="0" y1="6.5" x2="12" y2="6.5" stroke="#DCCFB2" strokeWidth="1" />
        </pattern>
        <pattern id="fort-ground-workshop" width="16" height="12" patternUnits="userSpaceOnUse">
          <rect width="16" height="12" fill="#A9784E" />
          <circle cx="4" cy="3" r="1.2" fill="#8C5E39" /><circle cx="12" cy="9" r="1.4" fill="#8C5E39" /><circle cx="10" cy="2" r="0.8" fill="#C79A6E" />
        </pattern>
        <pattern id="fort-ground-road" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#4B5563" />
          <circle cx="3" cy="3" r="0.7" fill="#6B7280" /><circle cx="8" cy="7" r="0.6" fill="#374151" />
        </pattern>
      </defs>
      {!defsOnly && theme === 'office' && (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i} opacity="0.55">
              <rect x={70 + i * 210} y={22} width={120} height={78} rx={3} fill="#B7CDE6" stroke="#93AFCF" />
              {Array.from({ length: 6 }, (_, j) => <line key={j} x1={70 + i * 210} y1={30 + j * 12} x2={190 + i * 210} y2={30 + j * 12} stroke="#E6EEF8" strokeWidth="3" />)}
            </g>
          ))}
          <g transform={`translate(${W / 2} 40)`} opacity="0.7">
            <circle r="15" fill="#fff" stroke="#64748B" strokeWidth="2" />
            <line x1="0" y1="0" x2="0" y2="-10" stroke="#334155" strokeWidth="2" />
            <line x1="0" y1="0" x2="8" y2="3" stroke="#334155" strokeWidth="2" />
          </g>
        </>
      )}
      {!defsOnly && theme === 'workshop' && (
        <>
          <circle cx={W - 150} cy={62} r={24} fill="#FDE68A" opacity="0.9" />
          <polygon points={`0,170 140,70 260,150 380,60 520,160 640,80 780,150 900,70 ${W},140 ${W},230 0,230`} fill="#A7D3A6" opacity="0.7" />
          <polygon points={`0,200 110,130 230,190 350,120 470,200 610,140 740,200 870,130 ${W},190 ${W},240 0,240`} fill="#7FBF7E" opacity="0.6" />
          {[90, 300, 560, 820, 990].map((x, i) => (
            <g key={i} transform={`translate(${x} ${150 + (i % 2) * 10})`} opacity="0.75">
              <rect x={-2} y={0} width={4} height={14} fill="#7C4A21" />
              <polygon points="0,-26 -11,2 11,2" fill="#2F7D32" />
            </g>
          ))}
          <g transform="translate(430 96)">
            <line x1={0} y1={0} x2={220} y2={0} stroke="#92400E" strokeWidth="1.2" />
            {Array.from({ length: 9 }, (_, i) => <polygon key={i} points={`${8 + i * 25},0 ${20 + i * 25},0 ${14 + i * 25},12`} fill={['#F87171', '#FBBF24', '#34D399', '#60A5FA'][i % 4]} />)}
          </g>
          <text x={540} y={124} textAnchor="middle" fontSize="13" fontWeight="800" fill="#14532D" opacity="0.8">🎉 2026 인사팀 워크샵 · {place}</text>
        </>
      )}
      {!defsOnly && theme === 'road' && (
        <>
          {Array.from({ length: 14 }, (_, i) => {
            const h = 70 + ((i * 37) % 90)
            const x = i * 80 - 10
            return (
              <g key={i} opacity="0.5">
                <rect x={x} y={200 - h} width={64} height={h + 40} fill={i % 3 === 0 ? '#94A3B8' : i % 3 === 1 ? '#A5B4C8' : '#8798AE'} />
                {Array.from({ length: Math.floor(h / 16) }, (_, j) => (
                  <g key={j}>{[0, 1, 2].map(k => <rect key={k} x={x + 8 + k * 18} y={208 - h + j * 16} width={10} height={7} fill="#E2E8F0" opacity="0.8" />)}</g>
                ))}
              </g>
            )
          })}
          <g transform="translate(560 98)">
            <rect x={0} y={0} width={160} height={30} rx={4} fill="#166534" stroke="#F8FAFC" strokeWidth="2" />
            <text x={80} y={20} textAnchor="middle" fontSize="13" fontWeight="800" fill="#F8FAFC">{place}</text>
            <rect x={76} y={30} width={8} height={30} fill="#64748B" />
          </g>
          <g transform="translate(150 150)">
            <rect x={-1.5} y={0} width={3} height={50} fill="#475569" />
            <rect x={-7} y={-26} width={14} height={28} rx={3} fill="#1F2937" />
            <circle cy={-19} r={3.5} fill="#EF4444" /><circle cy={-10} r={3.5} fill="#FACC15" opacity="0.35" /><circle cy={-1} r={3.5} fill="#22C55E" opacity="0.35" />
          </g>
        </>
      )}
    </>
  )
}

// 🏹 활 — (x, y) = 손 위치. pull = 시위 당긴 정도(0~1), ammo = 화살 끝에 단 것(그 판 무기 그림)
function Bow({ x, y, facing, elev, pull, ammo }: { x: number; y: number; facing: 1 | -1; elev: number; pull: number; ammo: string | null }) {
  const rot = facing === 1 ? -elev : 180 + elev
  const back = -3 - pull * 7
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M -1 -11 Q 9 0 -1 11" fill="none" stroke="#7C4A21" strokeWidth="2.2" strokeLinecap="round" />
      <polyline points={`-1,-11 ${back},0 -1,11`} fill="none" stroke="#E5E7EB" strokeWidth="0.9" />
      {ammo && (
        <>
          <line x1={back} y1={0} x2={13} y2={0} stroke="#6B4527" strokeWidth="1.4" />
          <text x={15} y={0} fontSize="9" textAnchor="middle" dominantBaseline="central" transform={`rotate(${-rot} 15 0)`}>{ammo}</text>
        </>
      )}
    </g>
  )
}

// 요새 그림 — (x, y) = 바닥 가운데. 컨셉마다 다른 물건(SkinKey 6단계는 같음). 위에 캐릭터가 활을 들고 선다.
export function Fortress({ theme = 'office', skin, team, x, y, facing, dead = false, activeNow = false }: { theme?: FortTheme; skin: SkinKey; team: Team; x: number; y: number; facing: 1 | -1; elev?: number; dead?: boolean; activeNow?: boolean }) {
  const c = TEAM_COLOR[team]
  return (
    <g transform={`translate(${x} ${y})`} opacity={dead ? 0.35 : 1}>
      {activeNow && <ellipse cx={0} cy={1} rx={22} ry={4} fill={c} opacity="0.35" />}
      <g transform={`scale(${facing} 1)`}>
        {theme === 'office' && <OfficeSkin skin={skin} c={c} />}
        {theme === 'workshop' && <WorkshopSkin skin={skin} c={c} />}
        {theme === 'road' && <RoadSkin skin={skin} c={c} />}
        {/* 팀 깃발 */}
        <line x1={14} y1={-6} x2={14} y2={-27} stroke="#475569" strokeWidth="1.2" />
        <path d="M14 -27 L23 -24 L14 -21 Z" fill={c} />
      </g>
    </g>
  )
}

function OfficeSkin({ skin, c }: { skin: SkinKey; c: string }) {
  switch (skin) {
    case 'desk': return (
      <>
        <rect x={-15} y={-12} width={30} height={3} rx={1} fill="#8B5E3C" />
        <rect x={-13} y={-9} width={2.5} height={9} fill="#6B4527" /><rect x={10.5} y={-9} width={2.5} height={9} fill="#6B4527" />
        <rect x={-12} y={-22} width={11} height={8} rx={1} fill="#1F2937" /><rect x={-11} y={-21} width={9} height={6} fill={c} opacity="0.55" />
        <rect x={-7.5} y={-14} width={2} height={2} fill="#1F2937" />
      </>
    )
    case 'cabinet': return (
      <>
        <rect x={-11} y={-19} width={22} height={19} rx={1.5} fill="#9CA3AF" stroke="#6B7280" />
        {[0, 1, 2].map(i => <g key={i}><line x1={-11} y1={-13 + i * 6} x2={11} y2={-13 + i * 6} stroke="#6B7280" /><rect x={-3} y={-17.5 + i * 6} width={6} height={1.6} fill="#4B5563" /></g>)}
        <rect x={-11} y={-19} width={22} height={2} fill={c} />
      </>
    )
    case 'water': return (
      <>
        <rect x={-8} y={-13} width={16} height={13} rx={2} fill="#F8FAFC" stroke="#CBD5E1" />
        <rect x={-6} y={-24} width={12} height={11} rx={4} fill="#7DD3FC" opacity="0.85" stroke="#38BDF8" />
        <rect x={-3} y={-8} width={2} height={3} fill="#EF4444" /><rect x={1} y={-8} width={2} height={3} fill="#3B82F6" />
        <rect x={-8} y={-2} width={16} height={2} fill={c} />
      </>
    )
    case 'plant': return (
      <>
        <rect x={-15} y={-12} width={30} height={3} rx={1} fill="#A16207" />
        <rect x={-13} y={-9} width={2.5} height={9} fill="#713F12" /><rect x={10.5} y={-9} width={2.5} height={9} fill="#713F12" />
        <rect x={-12} y={-17} width={7} height={5} rx={1} fill="#C2410C" />
        <circle cx={-10} cy={-21} r={4} fill="#16A34A" /><circle cx={-6.5} cy={-23} r={3.5} fill="#22C55E" /><circle cx={-12.5} cy={-24} r={3} fill="#15803D" />
        <rect x={3} y={-16} width={8} height={4} fill={c} opacity="0.7" />
      </>
    )
    case 'copier': return (
      <>
        <rect x={-14} y={-15} width={28} height={15} rx={2} fill="#E5E7EB" stroke="#9CA3AF" />
        <rect x={-14} y={-18} width={20} height={3} rx={1} fill="#D1D5DB" stroke="#9CA3AF" />
        <rect x={-11} y={-8} width={14} height={2} fill="#F8FAFC" stroke="#CBD5E1" />
        <circle cx={9} cy={-11} r={1.6} fill="#22C55E" />
        <rect x={-14} y={-3} width={28} height={2} fill={c} />
      </>
    )
    default: return (
      <>
        <rect x={-10} y={-21} width={20} height={21} rx={1.5} fill="#111827" />
        {[0, 1, 2, 3].map(i => <g key={i}><rect x={-8} y={-19 + i * 5} width={16} height={3.5} fill="#1F2937" /><circle cx={5} cy={-17.2 + i * 5} r={0.9} fill={i % 2 ? '#22C55E' : '#38BDF8'} /></g>)}
        <rect x={-10} y={-21} width={20} height={2} fill={c} />
      </>
    )
  }
}

function WorkshopSkin({ skin, c }: { skin: SkinKey; c: string }) {
  switch (skin) {
    case 'desk': return ( // 돗자리 + 도시락 바구니
      <>
        <rect x={-16} y={-3} width={32} height={3} fill="#FFFFFF" />
        {Array.from({ length: 8 }, (_, i) => <rect key={i} x={-16 + i * 4} y={-3} width={2} height={3} fill={c} opacity="0.75" />)}
        <rect x={-9} y={-13} width={16} height={10} rx={2} fill="#D97706" stroke="#92400E" />
        <path d="M -7 -13 Q -1 -21 5 -13" fill="none" stroke="#92400E" strokeWidth="1.4" />
        <line x1={-9} y1={-8} x2={7} y2={-8} stroke="#92400E" strokeWidth="0.8" />
      </>
    )
    case 'cabinet': return ( // 아이스박스
      <>
        <rect x={-12} y={-15} width={24} height={15} rx={2} fill="#F8FAFC" stroke="#94A3B8" />
        <rect x={-12} y={-18} width={24} height={4} rx={1.5} fill={c} />
        <rect x={-4} y={-21} width={8} height={3} rx={1} fill="none" stroke="#475569" strokeWidth="1.2" />
        <rect x={-8} y={-9} width={16} height={2} fill="#CBD5E1" />
      </>
    )
    case 'water': return ( // 텐트
      <>
        <polygon points="-16,0 0,-24 16,0" fill={c} opacity="0.85" stroke="#1F2937" strokeWidth="0.8" />
        <polygon points="-5,0 0,-12 5,0" fill="#1F2937" opacity="0.7" />
        <line x1={0} y1={-24} x2={0} y2={-28} stroke="#475569" strokeWidth="1.2" />
      </>
    )
    case 'plant': return ( // 캠핑 의자 + 작은 테이블
      <>
        <line x1={-12} y1={0} x2={-4} y2={-12} stroke="#334155" strokeWidth="1.4" /><line x1={-4} y1={0} x2={-12} y2={-12} stroke="#334155" strokeWidth="1.4" />
        <rect x={-14} y={-21} width={12} height={10} rx={1.5} fill={c} opacity="0.85" />
        <rect x={2} y={-9} width={13} height={2} fill="#A16207" />
        <line x1={4} y1={-7} x2={4} y2={0} stroke="#713F12" strokeWidth="1.4" /><line x1={13} y1={-7} x2={13} y2={0} stroke="#713F12" strokeWidth="1.4" />
        <text x={8.5} y={-11} fontSize="7" textAnchor="middle">🍺</text>
      </>
    )
    case 'copier': return ( // 바베큐 그릴
      <>
        <path d="M -12 -14 A 12 9 0 0 0 12 -14 Z" fill="#111827" />
        <line x1={-13} y1={-14} x2={13} y2={-14} stroke="#6B7280" strokeWidth="1.5" />
        <line x1={-7} y1={-7} x2={-11} y2={0} stroke="#374151" strokeWidth="1.5" /><line x1={7} y1={-7} x2={11} y2={0} stroke="#374151" strokeWidth="1.5" />
        <circle cx={-4} cy={-16} r={2} fill="#B45309" /><circle cx={2} cy={-16} r={2} fill="#B45309" />
        <circle cx={-2} cy={-23} r={2.5} fill="#E5E7EB" opacity="0.7" /><circle cx={2} cy={-27} r={2} fill="#E5E7EB" opacity="0.5" />
        <rect x={-12} y={-8} width={24} height={1.6} fill={c} />
      </>
    )
    default: return ( // 캠핑카
      <>
        <rect x={-17} y={-21} width={34} height={17} rx={3} fill="#F8FAFC" stroke="#94A3B8" />
        <rect x={-17} y={-11} width={34} height={3} fill={c} />
        <rect x={-13} y={-18} width={8} height={5} rx={1} fill="#7DD3FC" /><rect x={-2} y={-18} width={8} height={5} rx={1} fill="#7DD3FC" />
        <rect x={9} y={-18} width={6} height={10} rx={1} fill="#CBD5E1" />
        <circle cx={-9} cy={-3} r={3.5} fill="#1F2937" /><circle cx={9} cy={-3} r={3.5} fill="#1F2937" />
      </>
    )
  }
}

function RoadSkin({ skin, c }: { skin: SkinKey; c: string }) {
  const wheels = (a: number, b: number) => (
    <><circle cx={a} cy={-3} r={3.5} fill="#111827" /><circle cx={a} cy={-3} r={1.4} fill="#9CA3AF" /><circle cx={b} cy={-3} r={3.5} fill="#111827" /><circle cx={b} cy={-3} r={1.4} fill="#9CA3AF" /></>
  )
  switch (skin) {
    case 'desk': return ( // 경차
      <>
        <path d="M -13 -4 L -13 -11 Q -10 -19 -2 -19 L 6 -19 Q 12 -19 13 -11 L 13 -4 Z" fill={c} />
        <path d="M -8 -12 Q -6 -17 -1 -17 L 5 -17 Q 9 -17 10 -12 Z" fill="#BAE6FD" />
        {wheels(-8, 8)}
      </>
    )
    case 'cabinet': return ( // 택시
      <>
        <path d="M -15 -4 L -15 -10 L -9 -17 L 9 -17 L 15 -10 L 15 -4 Z" fill="#F59E0B" />
        <path d="M -8 -11 L -5 -15 L 5 -15 L 8 -11 Z" fill="#BAE6FD" />
        <rect x={-5} y={-21} width={10} height={4} rx={1} fill="#FEF3C7" stroke="#92400E" strokeWidth="0.6" />
        <rect x={-15} y={-8} width={30} height={1.6} fill={c} />
        {wheels(-9, 9)}
      </>
    )
    case 'water': return ( // 버스 정류장
      <>
        <rect x={-15} y={-26} width={30} height={3} fill={c} />
        <rect x={-14} y={-23} width={1.6} height={23} fill="#64748B" /><rect x={12.4} y={-23} width={1.6} height={23} fill="#64748B" />
        <rect x={-12} y={-22} width={24} height={14} fill="#BAE6FD" opacity="0.45" />
        <rect x={-10} y={-8} width={20} height={2} fill="#78350F" />
        <rect x={-2} y={-21} width={6} height={8} fill="#F8FAFC" stroke="#94A3B8" strokeWidth="0.5" />
      </>
    )
    case 'plant': return ( // 푸드트럭
      <>
        <rect x={-16} y={-20} width={24} height={16} rx={2} fill="#FDE68A" stroke="#B45309" strokeWidth="0.8" />
        <rect x={8} y={-14} width={8} height={10} rx={2} fill={c} />
        <rect x={-14} y={-17} width={16} height={6} fill="#1F2937" opacity="0.8" />
        {Array.from({ length: 4 }, (_, i) => <polygon key={i} points={`${-16 + i * 6},-20 ${-10 + i * 6},-20 ${-13 + i * 6},-24`} fill={i % 2 ? '#EF4444' : '#FFFFFF'} />)}
        {wheels(-9, 10)}
      </>
    )
    case 'copier': return ( // 광역버스
      <>
        <rect x={-18} y={-22} width={36} height={18} rx={3} fill="#DC2626" />
        {[0, 1, 2, 3].map(i => <rect key={i} x={-15 + i * 8} y={-19} width={6} height={6} rx={1} fill="#BAE6FD" />)}
        <rect x={-18} y={-10} width={36} height={2} fill={c === '#E11D48' ? '#FDE68A' : c} />
        {wheels(-11, 11)}
      </>
    )
    default: return ( // 스포츠카
      <>
        <path d="M -17 -4 L -17 -8 Q -12 -10 -6 -14 L 6 -14 Q 12 -11 17 -9 L 17 -4 Z" fill={c} />
        <path d="M -5 -13 L 5 -13 L 9 -10 L -8 -10 Z" fill="#1F2937" />
        <rect x={-18} y={-12} width={4} height={2} fill="#111827" />
        {wheels(-10, 10)}
      </>
    )
  }
}
