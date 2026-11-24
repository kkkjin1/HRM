'use client'

// 🪑 차고 '실내' 탭 — 운전석(레이스 중 V키 1인칭) 꾸미기.
// 2026-11-24 개편(사용자: 구단 변주 때문에 특색이 없다 → 구단은 로고로, 차마다 시각적 차별화):
//   왼쪽 = 고른 차 운전석 미리보기(실제 레이스와 같은 그림, CPU가 대신 달림)
//   오른쪽 = 차 고르기(10대) → 그 차 실내 3종(1번 무료 · 2·3번 🪙) → 공통 소품(지붕 장식·인형·손)
//   가진 건 누르면 바로 장착(서버 저장), 없는 건 미리보기 → 🪙 사고 장착 / 🎲 뽑기·선물로만
//   구단 = 선호 구단(차고에서 고름) — 핸들 가운데 로고·소품 색으로 자동

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { H, W } from '@/lib/playground'
import { teamOf } from '@/lib/baseballGear'
import { drawChase, drawRadar, type ChaseCam, type ChaseCar, type ChaseScene } from '@/components/playground/raceChase'
import { COCKPIT_CAM, COCKPIT_RADAR, drawCockpit } from '@/components/playground/raceCockpit'
import { CARS, CAR_BODIES, type CarBody } from '@/lib/raceCars'
import { BASIC_CAR, carOf, type GarageRow } from '@/lib/raceGarage'
import { bump, cpuSteer, kartStep, newCpu, newKart, ranking, rng, type CpuMem, type Kart } from '@/lib/race'
import { COURSES, roadOf, themeOf, trackOf } from '@/lib/raceCourses'
import {
  INTERIOR_DRAW_PRICE, PROPS, TRIMS, cabinOf, ownsProp, ownsTrim, propKey, propOf, trimKey, trimPrice, viewOf,
  type Cabin, type CabinView, type PropSlot,
} from '@/lib/raceInterior'

const COURSE = COURSES.find(c => c.key === 'seongsu') ?? COURSES[0]
const DEMO_COLORS = ['#F59E0B', '#2563EB', '#DC2626', '#16A34A', '#0EA5E9', '#EA580C']
const DEMO_NAMES = ['나', '야근봇', '결재봇', '회의봇', '보고봇', '출장봇']
// 미리보기 = 운전석 그림(1080×320)의 가운데를 잘라 크게
const PW = 560, PH = H
const CROP_X = 220, CROP_W = W - 440
const P_SCALE = PW / CROP_W
const P_TOP = PH - H * P_SCALE

type Draft = { kind: 'trim'; i: number } | { kind: 'prop'; slot: PropSlot; v: string }

export default function RaceInterior(props: {
  row: GarageRow | null
  missing: boolean // race_garage 자체가 없음
  isAdmin: boolean
  members: { id: string; name: string }[]
  header: ReactNode // 차고 탭 버튼 + 광장으로
  buy: (key: string) => Promise<string | null>
  draw: () => Promise<{ err: string | null; got: string | null }>
  save: (cabin: Cabin) => Promise<string | null>
  gift: (to: string, key: string) => Promise<string | null>
}) {
  const { row } = props
  const disabled = props.missing
  const team = teamOf(row?.team ?? null)?.key ?? null
  const myBody = carOf(row).body
  const saved = useMemo(() => cabinOf(row), [row])
  const [local, setLocal] = useState<Cabin | null>(null) // 저장 중 바로 보이게
  const cabin = local ?? saved
  const [body, setBody] = useState<CarBody>(myBody) // 실내를 고르는 차(기본 = 지금 타는 차)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'edit' | 'race'>('edit')
  const [view, setView] = useState<'chase' | 'cockpit'>('cockpit')
  const [giftTo, setGiftTo] = useState(props.members[0]?.id ?? '')
  const coins = row?.coins ?? 0
  const gifted = new Set(row?.interior_gifts ?? [])

  const shownCabin: Cabin = !draft ? cabin
    : draft.kind === 'trim' ? { ...cabin, trims: { ...cabin.trims, [body]: draft.i } }
    : { ...cabin, [draft.slot]: draft.v }
  const shown: CabinView = viewOf(shownCabin, body, team)
  const real: CabinView = viewOf(cabin, myBody, team) // 레이스에서 보기 = 실제 장착(지금 타는 차)

  const road = useMemo(() => roadOf(4242, COURSE), [])
  const track = useMemo(() => trackOf(4242, COURSE, 6), [])
  const theme = themeOf(COURSE)
  const raceCv = useRef<HTMLCanvasElement | null>(null)
  const garageCv = useRef<HTMLCanvasElement | null>(null)
  const live = useRef({ mode, view, shown, real, body, myBody })
  useEffect(() => { live.current = { mode, view, shown, real, body, myBody } })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || live.current.mode !== 'race') return
      const tg = e.target as HTMLElement | null
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return
      setView(v => (v === 'chase' ? 'cockpit' : 'chase'))
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  // 미리보기용 데모 레이스(CPU 6대, 내 차 = 0번이 맨 뒤 출발, 25초마다 다시)
  useEffect(() => {
    const rand = rng(7)
    const fresh = () => [5, 0, 1, 2, 3, 4].map(newKart)
    let karts: Kart[] = fresh()
    let mems: CpuMem[] = karts.map(() => newCpu(rand))
    const gone = new Set<number>()
    let t = -800, last = performance.now(), acc = 0, raf = 0
    let steerVis = 0, mySteer = 0
    let prevRank = 0
    const react = { passAt: -1e9, firstAt: -1e9 } // 운전석 실내 반응 시연
    const off = document.createElement('canvas')
    const loop = (now: number) => {
      acc = Math.min(acc + (now - last), 200); last = now
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60; t += 1000 / 60
        const order = ranking(karts.map((k, i) => ({ ...k, i })))
        karts = karts.map((k, i) => {
          const opts = { road, gone }
          const cs = cpuSteer(k, mems[i], t, track, [], rand, opts)
          if (i === 0) mySteer = cs.steer
          const st = kartStep(k, cs.steer, t, 1000 / 60, track, [], order.findIndex(o => o.i === i), 6, rand, opts)
          for (const e of st.events) if (e.type === 'box') gone.add(e.id)
          return cs.use ? { ...st.k, item: null } : st.k
        })
        karts = karts.map((k, i) => bump(k, karts.filter((o, j) => j !== i && o.finishedAt === null && t >= o.spinUntil).map(o => ({ x: o.x, y: o.y, v: o.v, boost: t < o.boostUntil, heavy: t < o.shieldUntil })), t, road).k)
        if (t > 25000) { karts = fresh(); mems = karts.map(() => newCpu(rand)); gone.clear(); t = -800 }
      }
      steerVis += (mySteer - steerVis) * 0.15
      const me = karts[0]
      const fx = (k: Kart): ChaseCar['fx'] => (t < k.stunUntil ? 'stun' : t < k.spinUntil ? 'spin' : t < k.slipUntil ? 'slip' : t < k.boostUntil ? 'boost' : t < k.shieldUntil ? 'shield' : '')
      const cars: ChaseCar[] = karts.map((k, i) => ({ id: `k${i}`, name: DEMO_NAMES[i], color: DEMO_COLORS[i], car: BASIC_CAR, x: k.x, y: k.y, fx: fx(k), fin: k.finishedAt, isMe: i === 0 }))
      const wall = Date.now()
      const rank = ranking(karts.map((k, i) => ({ ...k, i }))).findIndex(o => o.i === 0) + 1
      const scene = (cam?: ChaseCam): ChaseScene => ({ w: W, h: H, me: { x: me.x, y: me.y, v: me.v, fx: fx(me) }, cars, things: track.filter(th => !(th.kind === 'box' && gone.has(th.id))), bananas: [], mails: [], wall, shake: 0, t, theme, road, cam })
      if ((prevRank && rank < prevRank) || wall - react.passAt > 7000) { react.passAt = wall; if (rank === 1) react.firstAt = wall } // 미리보기는 7초마다 추월 연출을 보여 준다
      prevRank = rank
      const ov = { me: { x: me.x, y: me.y, v: me.v, item: me.item }, steer: steerVis, others: karts.slice(1).map((k, i) => ({ x: k.x, y: k.y, color: DEMO_COLORS[i + 1] })), rank, total: 6, wall, react }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const L = live.current
      const paint = (cv: HTMLCanvasElement, m: 'chase' | 'cockpit', cab: CabinView, b: CarBody) => {
        const ctx = cv.getContext('2d')
        if (!ctx) return
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const ride = CARS[b].ride
        if (m === 'cockpit') {
          const sc = scene({ ...COCKPIT_CAM, h: ride.camH, focal: ride.focal })
          drawChase(ctx, sc); drawCockpit(ctx, cab.eq, ov, null, { ...ride, skin: cab.skin })
          drawRadar(ctx, COCKPIT_RADAR.x, COCKPIT_RADAR.y, COCKPIT_RADAR.w, COCKPIT_RADAR.h, sc)
        } else { const sc = scene(); drawChase(ctx, sc); drawRadar(ctx, W - 92, 50, 70, 226, sc) }
      }
      if (L.mode === 'race' && raceCv.current) paint(raceCv.current, L.view, L.real, L.myBody)
      const gv = garageCv.current, gtx = gv?.getContext('2d')
      if (L.mode === 'edit' && gv && gtx) {
        paint(off, 'cockpit', L.shown, L.body)
        if (gv.width !== PW * dpr) { gv.width = PW * dpr; gv.height = PH * dpr }
        gtx.setTransform(1, 0, 0, 1, 0, 0)
        gtx.fillStyle = '#0B1220'; gtx.fillRect(0, 0, gv.width, gv.height)
        gtx.drawImage(off, CROP_X * dpr, 0, CROP_W * dpr, H * dpr, 0, P_TOP * dpr, PW * dpr, H * P_SCALE * dpr)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [road, track, theme])

  const run = async (fn: () => Promise<string | null>, ok: string | null) => {
    if (busy) return false
    setBusy(true)
    const err = await fn()
    setBusy(false)
    setNote(err ?? ok)
    return !err
  }
  const saveCabin = async (next: Cabin, ok: string | null) => {
    setLocal(next)
    const done = await run(() => props.save(next), ok)
    setLocal(null)
    return done
  }

  // ── 고르기: 가진 건 바로 장착, 없는 건 미리보기 ──
  const pickTrim = (i: number) => {
    setNote(null)
    if (ownsTrim(row, body, i)) { setDraft(null); if ((cabin.trims[body] ?? 0) !== i) void saveCabin({ ...cabin, trims: { ...cabin.trims, [body]: i } }, `${CARS[body].name} 실내 — ${TRIMS[body][i].name}`) }
    else setDraft({ kind: 'trim', i })
  }
  const pickProp = (slot: PropSlot, v: string) => {
    setNote(null)
    if (ownsProp(row, slot, v)) { setDraft(null); if (cabin[slot] !== v) void saveCabin({ ...cabin, [slot]: v }, null) }
    else setDraft({ kind: 'prop', slot, v })
  }
  const draftKey = draft ? (draft.kind === 'trim' ? trimKey(body, draft.i) : propKey(draft.slot, draft.v)) : null
  const draftName = draft ? (draft.kind === 'trim' ? `${CARS[body].name} ${TRIMS[body][draft.i].name}` : propOf(draft.slot, draft.v)?.name ?? '') : ''
  const draftPrice = draft ? (draft.kind === 'trim' ? trimPrice(body, draft.i) : propOf(draft.slot, draft.v)?.get === 'shop' ? propOf(draft.slot, draft.v)?.price ?? 0 : 0) : 0
  const buy = async () => {
    if (!draft || !draftKey || draftPrice <= 0) return
    if (await run(() => props.buy(draftKey), `🪙 ${draftPrice} — ${draftName} 장착!`)) setDraft(null)
  }
  const draw = async () => {
    if (busy) return
    setBusy(true)
    const r = await props.draw()
    setBusy(false)
    if (r.err || !r.got) { setNote(r.err); return }
    const [s, v] = r.got.split(':') as [PropSlot, string]
    setDraft({ kind: 'prop', slot: s, v })
    setNote(`🎉 ${propOf(s, v)?.e} ${propOf(s, v)?.name} 획득! 장착하기를 누르면 달려요`)
  }

  if (mode === 'race') {
    return (
      <div className="absolute inset-0 z-[46] overflow-hidden bg-[#111827] text-white" style={{ width: W, height: H }}>
        <canvas ref={raceCv} style={{ width: W, height: H, display: 'block' }} />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setMode('edit')} className="rounded-full bg-[#FACC15] px-3 py-1 text-[12px] font-black text-[#0F172A]">← 꾸미기로</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setView(v => (v === 'chase' ? 'cockpit' : 'chase'))} className="flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1.5 pr-3 text-[12px] font-bold backdrop-blur hover:bg-black/70">
            <span className="rounded-full bg-white/90 px-1.5 text-[10.5px] font-black text-[#0F172A]">V</span>{view === 'chase' ? '🎥 추격 시점' : '🧑‍✈️ 운전석'}
          </button>
        </div>
        <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] text-white/75">지금 타는 {CARS[myBody].name} · 실제 장착한 실내 · 레이스 중에도 V로 바꿔요</span>
      </div>
    )
  }

  const curTrim = cabin.trims[body] ?? 0
  return (
    <div className="absolute inset-0 z-[46] flex overflow-hidden bg-[#111827] text-white" style={{ width: W, height: H }}>
      {/* 왼쪽: 운전석 미리보기 */}
      <div className="relative shrink-0" style={{ width: PW, height: PH }}>
        <canvas ref={garageCv} style={{ width: PW, height: PH, display: 'block' }} aria-label="운전석 미리보기" />
        <div className="pointer-events-none absolute inset-x-0 top-2.5 text-center">
          <p className="text-[14px] font-black">🪑 {CARS[body].emoji} {CARS[body].name} 운전석</p>
          <p className="text-[10.5px] text-white/60">핸들 로고 = {team ? teamOf(team)?.name.split(' ')[0] : '선호 구단 없음(차종 탭 옆 부품 탭에서 고르기)'}</p>
        </div>
        {draft && (
          <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full bg-[#0F172A]/90 px-3 py-1 text-[11.5px] font-bold text-[#FDE68A] ring-1 ring-[#FDE68A]/60">
            👀 미리보기 — {draftName}
          </div>
        )}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setDraft(null); setMode('race') }} className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-[11.5px] font-bold backdrop-blur hover:bg-black/75">🏎 레이스에서 보기</button>
      </div>

      {/* 오른쪽: 차 → 실내 3종 → 소품 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2">
        {props.header}
        {disabled && <p className="rounded-md bg-[#7F1D1D] px-2 py-1 text-[11px]">차고 저장 테이블이 아직 없어요 — 미리보기만 돼요</p>}
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
          🚗 차
          <select value={body} onChange={e => { setBody(e.target.value as CarBody); setDraft(null); setNote(null) }} aria-label="실내를 볼 차"
            className="rounded-md border border-white/20 bg-[#1F2937] px-2 py-0.5 text-[12px] font-bold text-white">
            {CAR_BODIES.map((b, i) => <option key={b} value={b}>{i + 1}. {CARS[b].emoji} {CARS[b].name}{b === myBody ? ' (타는 차)' : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {TRIMS[body].map((tr, i) => {
            const have = ownsTrim(row, body, i)
            const on = curTrim === i
            const pv = draft?.kind === 'trim' && draft.i === i
            const isNew = gifted.has(trimKey(body, i))
            return (
              <button key={i} type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => pickTrim(i)}
                className={`relative flex flex-col items-start gap-0.5 overflow-hidden rounded-lg p-1.5 text-left ring-1 transition-colors ${on ? 'ring-2 ring-[#FACC15]' : pv ? 'ring-2 ring-[#60A5FA]' : 'ring-white/10 hover:ring-white/30'}`}
                style={{ background: `linear-gradient(135deg, ${tr.base} 0%, ${tr.base} 55%, ${tr.wheelC} 100%)` }}>
                <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full" style={{ background: tr.amb === 'rainbow' ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : tr.amb ?? tr.accent, boxShadow: `0 0 8px ${tr.amb && tr.amb !== 'rainbow' ? tr.amb : tr.accent}` }} />
                <span className="text-[18px] leading-none">{tr.e}</span>
                <span className="rounded bg-black/45 px-1 text-[11.5px] font-black">{tr.name}</span>
                <span className={`rounded bg-black/45 px-1 text-[10px] font-bold ${on ? 'text-[#FACC15]' : have ? 'text-[#86EFAC]' : 'text-white/80'}`}>
                  {on ? '장착 중' : i === 0 ? '무료' : have ? '보유' : `🪙 ${trimPrice(body, i)}`}{isNew ? ' 🎁' : ''}
                </span>
              </button>
            )
          })}
        </div>
        {PROPS.map(p => (
          <div key={p.key} className="flex items-center gap-1">
            <span className="w-[58px] shrink-0 text-[10.5px] font-bold text-white/55">{p.icon} {p.name}</span>
            {p.variants.map(v => {
              const have = ownsProp(row, p.key, v.key)
              const on = cabin[p.key] === v.key
              const pv = draft?.kind === 'prop' && draft.slot === p.key && draft.v === v.key
              return (
                <button key={v.key} type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => pickProp(p.key, v.key)} title={v.name}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${on ? 'bg-white/15 ring-1 ring-[#FACC15]' : pv ? 'bg-white/10 ring-1 ring-[#60A5FA]' : 'bg-white/[0.05] hover:bg-white/10'} ${have ? '' : 'opacity-60'}`}>
                  <span>{v.e}</span>{v.name}
                  <span className={on ? 'text-[#FACC15]' : have ? 'text-[#86EFAC]' : 'text-white/50'}>{on ? '●' : have ? '' : v.get === 'shop' ? `🪙${v.price}` : '🎲'}</span>
                  {gifted.has(propKey(p.key, v.key)) && <span className="text-[9px]">🎁</span>}
                </button>
              )
            })}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-1.5">
          {draft ? (
            <>
              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#FDE68A]">👀 {draftName}{draftKey && (draft.kind === 'trim' ? ownsTrim(row, body, draft.i) : ownsProp(row, draft.slot, draft.v)) ? '' : ' — 미보유'}</p>
              {draftKey && (draft.kind === 'trim' ? ownsTrim(row, body, draft.i) : ownsProp(row, draft.slot, draft.v))
                ? <button type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => { const d = draft; setDraft(null); void saveCabin(d.kind === 'trim' ? { ...cabin, trims: { ...cabin.trims, [body]: d.i } } : { ...cabin, [d.slot]: d.v }, '장착했어요') }} className="rounded-md bg-[#FACC15] px-2.5 py-1 text-[11px] font-black text-[#0F172A]">장착하기</button>
                : draftPrice > 0
                  ? <button type="button" disabled={disabled || busy || coins < draftPrice} onMouseDown={e => e.preventDefault()} onClick={() => void buy()} className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-black disabled:bg-white/10 disabled:text-white/40">🪙 {draftPrice} 사고 장착</button>
                  : <span className="rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-semibold text-white/60">🎲 뽑기·선물로만</span>}
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setDraft(null)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/10">취소</button>
              {props.isAdmin && draftKey && draftPrice >= 0 && !(draft.kind === 'trim' && draft.i === 0) && (
                <span className="flex items-center gap-1">
                  <select value={giftTo} onChange={e => setGiftTo(e.target.value)} className="max-w-[72px] rounded bg-white/10 px-1 py-0.5 text-[10.5px]">
                    {props.members.map(m => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
                  </select>
                  <button type="button" disabled={busy || !giftTo} onMouseDown={e => e.preventDefault()}
                    onClick={() => void run(() => props.gift(giftTo, draftKey), `🎁 ${props.members.find(m => m.id === giftTo)?.name}님께 ${draftName} 선물!`)}
                    className="rounded-md bg-[#DB2777] px-1.5 py-1 text-[10.5px] font-bold disabled:opacity-40" title="관리자: 지금 미리보는 것 선물">🎁</button>
                </span>
              )}
            </>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[11px] text-white/60">{note ?? <><span className="text-[#FACC15]">●</span> 장착 중 · 가진 건 누르면 장착 · 없는 건 눌러서 미리보기 · 🪙 {coins}</>}</p>
          )}
          <button type="button" disabled={disabled || busy || coins < INTERIOR_DRAW_PRICE} onMouseDown={e => e.preventDefault()} onClick={() => void draw()}
            className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-40" title="아직 없는 소품 중 하나">🎲 소품 뽑기 🪙{INTERIOR_DRAW_PRICE}</button>
        </div>
      </div>
    </div>
  )
}
