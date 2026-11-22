'use client'

// ⚽ 오늘의 PK 화면 — 슈터 뒤에서 본 골대. 규칙 src/lib/soccerPk.ts.
// 방향키 조준 → Space 누르고 있으면 힘 막대가 오르내림 → 떼면 슛. 키퍼(NPC)는 차는 순간 어디로 뛸지 정한다.
// 슈터는 내 야구 유니폼(soccerKit.playerKit) 등판 + 야구 등번호. 기록(하루 5번)은 부모가 onKick으로 저장한다.

import GameArena, { AR, DPad, HoldButton, Pill, type GameLayout } from '../GameArena'
import { FULL_OVERLAY_STYLE } from '../fullStage'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KidG } from './SoccerKid'
import { GK_KITS, type Kit } from '@/lib/soccerKit'
import { mulberry32 } from '@/lib/soccer'
import {
  OUTCOME_TEXT, PK_KICKS, diveOf, judgePk, keeperAt, keeperOf, powerAt, shotOf,
  type Dive, type PkOutcome, type Shot,
} from '@/lib/soccerPk'
import { useFitBox } from './SoccerGame'

const SW = 800, SH = 460
const GCX = 400, GHW = 170, GB = 262, GH = 144 // 골대 화면 위치
const BALL0 = { x: 400, y: 416 }
const gx = (x: number) => GCX + x * GHW
const gy = (y: number) => GB - y * GH
const AIM_SPEED = 1.25

type Kick = { aim: { x: number; y: number }; power: number; shot: Shot; dive: Dive; outcome: PkOutcome; at: number }

export default function PenaltyKick(props: {
  day: string
  kit: Kit
  number: number
  name: string
  practice: boolean
  done: string // 오늘 이미 찬 기록(OX), 연습이면 ''
  onKick?: (goal: boolean) => Promise<string | null> // 기록 저장(실패하면 에러 문구)
  onClose: () => void
  arena?: { layout: GameLayout; onWindow?: () => void } // 풀화면 게임 화면(GameArena)으로 그리기
}) {
  const keeper = useState(() => keeperOf(props.day))[0]
  const gk = GK_KITS[keeper.kit % GK_KITS.length]
  const [phase, setPhase] = useState<'aim' | 'power' | 'fly' | 'show' | 'done'>(() => (!props.practice && props.done.length >= PK_KICKS ? 'done' : 'aim'))
  const [aim, setAim] = useState({ x: 0, y: 0.5 })
  const [now, setNow] = useState(0)
  const [kick, setKick] = useState<Kick | null>(null)
  const [record, setRecord] = useState<string>(props.practice ? '' : props.done)
  const [err, setErr] = useState<string | null>(null)
  const keys = useRef(new Set<string>())
  const [powerStart, setPowerStart] = useState(0)
  const rnd = useRef<(() => number) | null>(null)
  const st = useRef({ phase, aim, kick, record, powerStart })
  useEffect(() => { st.current = { phase, aim, kick, record, powerStart } })
  const onKickRef = useRef(props.onKick)
  useEffect(() => { onKickRef.current = props.onKick })

  // 키
  useEffect(() => {
    const shoot = () => {
      const a = st.current.aim
      const power = powerAt((performance.now() - st.current.powerStart) / 1000)
      rnd.current ??= mulberry32(Math.floor(performance.now() * 1000) & 0xffffffff)
      const shot = shotOf(a, power, rnd.current)
      const dive = diveOf(keeper, a, rnd.current)
      const outcome = judgePk(keeper, shot, dive)
      setKick({ aim: a, power, shot, dive, outcome, at: performance.now() })
      setPhase('fly')
      const goal = outcome === 'goal'
      setRecord(r => r + (goal ? 'O' : 'X'))
      if (!props.practice && onKickRef.current) void onKickRef.current(goal).then(e => { if (e) setErr(e) })
    }
    const down = (e: KeyboardEvent) => {
      const c = e.code
      if (c.startsWith('Arrow') || c === 'Space' || c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') { e.preventDefault(); e.stopPropagation() }
      if (c === 'Escape') { e.preventDefault(); e.stopPropagation(); if (st.current.phase !== 'fly') props.onClose(); return }
      if (e.repeat) return
      keys.current.add(c)
      if (c === 'Space' && st.current.phase === 'aim') {
        const t = performance.now()
        st.current.powerStart = t
        st.current.phase = 'power'
        setPowerStart(t)
        setPhase('power')
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
      if (e.code === 'Space' && st.current.phase === 'power') { st.current.phase = 'fly'; shoot() }
    }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 루프: 조준 이동 · 시간 진행 · 다음 킥
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      setNow(t)
      const s = st.current
      if (s.phase === 'aim' || s.phase === 'power') {
        const k = keys.current
        const dx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0)
        const dy = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0)
        const sp = s.phase === 'power' ? AIM_SPEED * 0.35 : AIM_SPEED
        if (dx || dy) setAim(a => ({ x: Math.max(-1.3, Math.min(1.3, a.x + dx * sp * dt)), y: Math.max(0, Math.min(1.3, a.y + dy * sp * dt)) }))
      }
      if (s.kick && (s.phase === 'fly' || s.phase === 'show')) {
        const el = (t - s.kick.at) / 1000
        if (s.phase === 'fly' && el > s.kick.shot.flight + 0.35) setPhase('show')
        if (s.phase === 'show' && el > s.kick.shot.flight + 1.9) {
          if (!props.practice && s.record.length >= PK_KICKS) setPhase('done')
          else { setKick(null); setAim({ x: 0, y: 0.5 }); setPhase('aim') }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 그리기 값
  const el = kick ? (now - kick.at) / 1000 : 0
  const power = phase === 'power' ? powerAt((now - powerStart) / 1000) : kick?.power ?? 0
  const kp = kick ? keeperAt(keeper, kick.dive, Math.min(el, kick.shot.flight + 0.3)) : { x: 0, y: 0.45, prog: 0 }
  const ball = ballPos(kick, el)
  const goals = record.split('').filter(c => c === 'O').length
  const { ref, scale, h } = useFitBox(860)
  const sway = phase === 'aim' || phase === 'power' ? Math.sin(now / 260) * 0.05 * (keeper.bias || 0.5) : 0

  // 경기장 그림(관중석·골대·키퍼·공·슈터·힘 막대·기록·결과) — 예전 창과 풀화면이 같이 쓴다
  const field = (
            <svg width={SW + 20} height={SH} viewBox={`0 0 ${SW + 20} ${SH}`} style={{ display: 'block' }}>
              <defs>
                <linearGradient id="pk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1E3A5F" /><stop offset="1" stopColor="#3B6EA5" /></linearGradient>
                <pattern id="pk-net" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0 L10 10 M10 0 L0 10" stroke="#fff" strokeWidth="0.8" opacity="0.5" /></pattern>
                <pattern id="pk-crowd" width="14" height="12" patternUnits="userSpaceOnUse">
                  <circle cx="4" cy="5" r="3" fill="#F87171" opacity="0.7" /><circle cx="11" cy="8" r="3" fill="#FDE68A" opacity="0.6" />
                </pattern>
              </defs>
              <rect width={SW + 20} height={SH} fill="url(#pk-sky)" />
              {/* 관중석 */}
              <rect x={0} y={20} width={SW + 20} height={84} fill="#334155" />
              <rect x={0} y={20} width={SW + 20} height={84} fill="url(#pk-crowd)" />
              <rect x={0} y={100} width={SW + 20} height={10} fill="#1E293B" />
              {/* 잔디 */}
              <path d={`M0 110 L${SW + 20} 110 L${SW + 20} ${SH} L0 ${SH} Z`} fill="#3E9A4C" />
              {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M0 ${110 + i * 60} L${SW + 20} ${110 + i * 60} L${SW + 20} ${140 + i * 60} L0 ${140 + i * 60} Z`} fill="#45A653" />)}
              {/* 페널티 박스 선 */}
              <g fill="none" stroke="#fff" strokeWidth="3" opacity="0.85">
                <path d={`M40 ${GB + 6} L${SW - 20} ${GB + 6}`} />
                <path d={`M140 ${GB + 6} L60 ${SH} M${SW - 120} ${GB + 6} L${SW} ${SH}`} />
                <path d={`M250 ${GB + 6} L230 ${GB + 44} L${SW - 210} ${GB + 44} L${SW - 230} ${GB + 6}`} />
              </g>
              <ellipse cx={BALL0.x} cy={BALL0.y + 4} rx={6} ry={2.5} fill="#fff" opacity={0.9} />
              {/* 골대: 그물 → 키퍼 → 기둥 */}
              <rect x={gx(-1)} y={gy(1)} width={GHW * 2} height={GH} fill="rgba(255,255,255,0.15)" />
              <rect x={gx(-1)} y={gy(1)} width={GHW * 2} height={GH} fill="url(#pk-net)" />
              {kick?.outcome === 'goal' && el > kick.shot.flight && el < kick.shot.flight + 0.6 && (
                <ellipse cx={gx(kick.shot.x)} cy={gy(kick.shot.y)} rx={30} ry={20} fill="none" stroke="#fff" strokeWidth="2" opacity={1 - (el - kick.shot.flight) / 0.6} />
              )}
              {/* 키퍼 */}
              <g transform={`translate(${gx(kp.x + sway) - 44} ${gy(kp.y) - 70 + (1 - kp.prog) * 18}) rotate(${(kick?.dive.x ?? 0) * -80 * kp.prog} 44 70)`}>
                <g transform="scale(2.2)">
                  <KidG kit={gk} number={1} pose="cheer" facing={(kick?.dive.x ?? 0) < 0 ? -1 : 1} />
                </g>
              </g>
              <path d={`M${gx(-1)} ${GB} L${gx(-1)} ${gy(1)} L${gx(1)} ${gy(1)} L${gx(1)} ${GB}`} fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
              {/* 조준점 */}
              {(phase === 'aim' || phase === 'power') && (
                <g transform={`translate(${gx(aim.x)} ${gy(aim.y)})`}>
                  <circle r={14} fill="none" stroke="#FACC15" strokeWidth={2.5} />
                  <circle r={3} fill="#FACC15" />
                  <path d="M-22 0 L-16 0 M16 0 L22 0 M0 -22 L0 -16 M0 16 L0 22" stroke="#FACC15" strokeWidth={2.5} />
                </g>
              )}
              {/* 공 */}
              <ellipse cx={ball.sx} cy={ball.shadowY} rx={ball.r * 0.9} ry={ball.r * 0.35} fill="rgba(0,0,0,0.25)" />
              <g transform={`translate(${ball.sx} ${ball.sy}) rotate(${el * 900}) scale(${ball.r / 7})`}>
                <circle r={7} fill="#fff" stroke="#1F2937" strokeWidth={0.8} />
                <polygon points="0,-2.6 2.5,-0.8 1.5,2.1 -1.5,2.1 -2.5,-0.8" fill="#1F2937" />
                {[0, 72, 144, 216, 288].map(a => <circle key={a} cx={Math.sin((a * Math.PI) / 180) * 6} cy={-Math.cos((a * Math.PI) / 180) * 6} r={1.3} fill="#1F2937" />)}
              </g>
              {/* 슈터(뒷모습, 야구 유니폼 등판) */}
              <g transform={`translate(${BALL0.x - 128} ${SH - 150}) scale(2.7)`}>
                <KidG kit={props.kit} number={props.number} name={props.name} back pose={phase === 'fly' && el < 0.25 ? 'kick' : phase === 'show' && kick?.outcome === 'goal' ? 'cheer' : 'stand'} />
              </g>
              {/* 힘 막대 */}
              <g transform={`translate(${SW - 40} 250)`}>
                <rect x={0} y={0} width={18} height={150} rx={9} fill="rgba(15,23,42,0.55)" />
                <rect x={0} y={3} width={18} height={144 * 0.18} fill="rgba(239,68,68,0.35)" />
                <rect x={3} y={3 + 144 * (1 - power)} width={12} height={144 * power} rx={6} fill={power > 0.82 ? '#EF4444' : power > 0.5 ? '#F59E0B' : '#FACC15'} />
                <text x={9} y={168} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">힘</text>
              </g>
              {/* 기록 점 */}
              <g transform="translate(16 122)">
                {(props.practice ? record.slice(-10) : record.padEnd(PK_KICKS, '·')).split('').map((c, i) => (
                  <g key={i} transform={`translate(${i * 24} 0)`}>
                    <circle r={9} cx={9} cy={9} fill={c === 'O' ? '#22C55E' : c === 'X' ? '#EF4444' : 'rgba(255,255,255,0.3)'} />
                    <text x={9} y={13} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">{c === 'O' ? '⚽' : c === 'X' ? '✕' : ''}</text>
                  </g>
                ))}
              </g>
              {/* 결과 글자 */}
              {phase === 'show' && kick && (
                <text x={SW / 2 + 10} y={200} textAnchor="middle" fontSize={56} fontWeight={900} fill={kick.outcome === 'goal' ? '#FACC15' : '#fff'} stroke="#0F172A" strokeWidth={3} paintOrder="stroke" className="pk-pop">
                  {OUTCOME_TEXT[kick.outcome]}
                </text>
              )}
              {phase === 'done' && (
                <g>
                  <rect x={0} y={0} width={SW + 20} height={SH} fill="rgba(15,23,42,0.6)" />
                  <text x={SW / 2 + 10} y={190} textAnchor="middle" fontSize={22} fontWeight={800} fill="#E2E8F0">오늘의 PK 끝!</text>
                  <text x={SW / 2 + 10} y={250} textAnchor="middle" fontSize={54} fontWeight={900} fill="#FACC15">{goals} / {PK_KICKS} 골</text>
                  <text x={SW / 2 + 10} y={290} textAnchor="middle" fontSize={14} fontWeight={700} fill="#CBD5E1">내일 새 골키퍼가 와요 · 연습은 언제든</text>
                </g>
              )}
            </svg>
  )

  if (props.arena) {
    // ── 풀화면(야구식 게임 화면) ── 터치 버튼은 키보드 신호를 흉내(기존 키 처리 그대로)
    const lay = props.arena.layout
    const fireKey = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { key: code === 'Space' ? ' ' : code, code, bubbles: true, cancelable: true }))
    const DIR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const
    const canAim = phase === 'aim' || phase === 'power'
    const onDir = (d: 'up' | 'down' | 'left' | 'right', v: boolean) => fireKey(v ? 'keydown' : 'keyup', DIR[d])
    const shootBtn = (size: number) => (
      <HoldButton tone="red" ariaLabel="슛" disabled={!canAim} onHold={v => fireKey(v ? 'keydown' : 'keyup', 'Space')}
        className="flex-col rounded-full border-[3px] leading-tight shadow-[0_6px_18px_rgba(0,0,0,0.35)]" style={{ width: size, height: size, borderColor: 'rgba(255,255,255,0.85)', fontSize: Math.round(size * 0.16) }}>
        <span style={{ fontSize: Math.round(size * 0.3) }}>⚽</span>{phase === 'power' ? '떼면 슛!' : '꾹 → 슛'}
      </HoldButton>
    )
    const status = (
      <>
        <Pill tone="hot">🥅 {keeper.name}</Pill>
        <Pill>{keeper.tip}</Pill>
        {props.practice ? <Pill>연습 {goals}골 / {record.length}번</Pill> : <Pill tone="blue">⚽ {goals}골 · 남은 기회 {Math.max(0, PK_KICKS - record.length)}번</Pill>}
        {err && <Pill tone="warn">⚠ 기록 저장 실패</Pill>}
      </>
    )
    const help = '방향키 조준(구석일수록 좋지만 기둥·아웃 위험) · Space 꾹 → 떼면 슛 — 너무 세면(빨강) 뜨고, 약하면 키퍼가 잡아요'
    const deck = lay === 'wide' ? (
      <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: AR.card }}>
        <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: AR.sub }}>{help}</span>
      </div>
    ) : (
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[12.5px] leading-relaxed" style={{ color: AR.muted }}>{help}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div className="mb-2 ml-3"><DPad size={62} disabled={!canAim} onDir={onDir} /></div>
          {shootBtn(112)}
        </div>
      </div>
    )
    return (
      <>
        <style>{`@keyframes pk-pop { from { opacity: 0; transform: scale(0.5) } to { opacity: 1; transform: scale(1) } } .pk-pop { transform-box: fill-box; transform-origin: center; animation: pk-pop 240ms cubic-bezier(.2,1.4,.4,1) }`}</style>
        <GameArena layout={lay} title={props.practice ? '⚽ PK 연습' : '⚽ 오늘의 PK'} sub="오늘의 골키퍼와 1:1"
          backLabel="나가기" onBack={props.onClose} onClose={props.onClose} onWindow={props.arena.onWindow}
          world={{ w: SW + 20, h: SH }} scene={<div className="absolute inset-0">{field}</div>} status={status} portraitFit
          deck={lay === 'landscape' ? undefined : deck}
          sides={{ left: <DPad size={52} disabled={!canAim} onDir={onDir} />, right: shootBtn(96) }} />
      </>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B1220]" style={FULL_OVERLAY_STYLE}>
      <div style={{ width: 860 * scale, height: h * scale }}>
        <div ref={ref} className="rounded-2xl bg-[#F8FAFC] p-3 shadow-2xl" style={{ width: 860, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="mb-2 flex items-center gap-3">
            <p className="text-[17px] font-extrabold text-[#0F172A]">⚽ {props.practice ? 'PK 연습' : '오늘의 PK'}</p>
            <span className="rounded-full bg-[#ECFCCB] px-2.5 py-0.5 text-[11.5px] font-bold text-[#365314]">🥅 오늘의 골키퍼 {keeper.name} · {keeper.tip}</span>
            <div className="flex-1" />
            <button type="button" onClick={props.onClose} className="rounded-lg bg-[#F1F5F9] px-3 py-1 text-[12.5px] font-bold text-[#0F172A] hover:bg-[#E2E8F0]">나가기</button>
          </div>
          <div className="relative overflow-hidden rounded-2xl">
            {field}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-[#475569]">
            <span><b>방향키</b> 조준(골대 구석일수록 좋지만 기둥·아웃 위험) · <b>Space</b> 누르고 있다가 떼면 슛 — 힘이 너무 세면(빨강) 뜨고, 약하면 키퍼가 잡아요</span>
            <div className="flex-1" />
            {props.practice ? <span className="font-bold">연습 {goals}골 / {record.length}번</span> : <span className="font-bold">남은 기회 {Math.max(0, PK_KICKS - record.length)}번</span>}
          </div>
          {err && <p className="mt-1 text-[12px] font-bold text-[#DC2626]">⚠ 기록 저장 실패: {err}</p>}
          <style>{`@keyframes pk-pop { from { opacity: 0; transform: scale(0.5) } to { opacity: 1; transform: scale(1) } } .pk-pop { transform-box: fill-box; transform-origin: center; animation: pk-pop 240ms cubic-bezier(.2,1.4,.4,1) }`}</style>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 공 위치(화면): 날아가는 동안 원근(작아짐) + 살짝 포물선, 도착 뒤엔 결과별로(그물 안 · 튕김 · 계속 날아감)
function ballPos(kick: Kick | null, el: number) {
  if (!kick) return { sx: BALL0.x, sy: BALL0.y, r: 11, shadowY: BALL0.y + 4 }
  const { shot } = kick
  const tx = gx(shot.x), ty = gy(shot.y)
  const f = shot.flight
  if (el <= f) {
    const k = el / f
    const sx = BALL0.x + (tx - BALL0.x) * k
    const sy = BALL0.y + (ty - BALL0.y) * k - Math.sin(Math.PI * k) * 26
    return { sx, sy, r: 11 - 6 * k, shadowY: BALL0.y + 4 + (GB + 4 - BALL0.y - 4) * k }
  }
  const a = Math.min(1, (el - f) / 0.5)
  const out = kick.outcome
  if (out === 'goal') return { sx: tx + (tx - GCX) * 0.08 * a, sy: ty - 6 * a + 30 * a * a * (shot.y > 0.2 ? 1 : 0), r: 5 - 1 * a, shadowY: GB }
  if (out === 'save' || out === 'post') {
    const dir = shot.x >= 0 ? 1 : -1
    return { sx: tx + dir * 120 * a, sy: ty + 60 * a - Math.sin(Math.PI * a) * 40, r: 5 + 2 * a, shadowY: GB + 30 * a }
  }
  // 아웃: 계속 날아감
  return { sx: tx + (tx - BALL0.x) * 0.4 * a, sy: ty + (ty - BALL0.y) * 0.4 * a, r: 5 - 2 * a, shadowY: GB }
}
