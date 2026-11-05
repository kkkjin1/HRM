'use client'

// 🪑 차고 '실내' 탭 — 운전석(레이스 중 V키 1인칭) 꾸미기. 2026-11-05 목업(/mock/cockpit v2)을 옮김.
//   왼쪽 = 운전석 미리보기(실제 레이스와 같은 그림, CPU가 대신 달림) · 부위를 눌러서 고를 수 있다
//   오른쪽 위 = 장착 현황 6칸(룸미러 칸 = 장식 + 거울 테두리) / 아래 = 고른 부위의 종류 → 구단
//   가진 조합은 누르면 바로 장착(서버 저장), 없는 조합은 미리보기만(🪙 사기 / 🎲 뽑기·선물로만)
//   🎨 6개 다 같은 구단으로 = 가진 조합만 바꾸고 나머지는 그대로(되돌리기 가능)

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { H, W } from '@/lib/playground'
import { logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { drawChase, drawRadar, type ChaseCam, type ChaseCar, type ChaseScene } from '@/components/playground/raceChase'
import { COCKPIT_CAM, COCKPIT_RADAR, drawCockpit, hitSlot } from '@/components/playground/raceCockpit'
import { BASIC_CAR, type GarageRow } from '@/lib/raceGarage'
import { bump, cpuSteer, kartStep, newCpu, newKart, ranking, rng, type CpuMem, type Kart } from '@/lib/race'
import { COURSES, roadOf, themeOf, trackOf } from '@/lib/raceCourses'
import {
  GROUPS, INTERIOR_DRAW_PRICE, SLOTS, TEAM_KEYS, groupOf, interiorOf, itemKey, ownsInterior, palOf, slotOf, teamShort, variantOf,
  type Equip, type Pick, type SlotKey,
} from '@/lib/raceInterior'

const COURSE = COURSES.find(c => c.key === 'seongsu') ?? COURSES[0]
const DEMO_COLORS = ['#F59E0B', '#2563EB', '#DC2626', '#16A34A', '#0EA5E9', '#EA580C']
const DEMO_NAMES = ['나', '야근봇', '결재봇', '회의봇', '보고봇', '출장봇']
// 미리보기 = 운전석 그림(1080×320)의 가운데를 잘라 크게
const PW = 600, PH = H
const CROP_X = 200, CROP_W = W - 400
const P_SCALE = PW / CROP_W
const P_TOP = PH - H * P_SCALE

export default function RaceInterior(props: {
  row: GarageRow | null
  missing: boolean // race_garage 자체가 없음
  isAdmin: boolean
  members: { id: string; name: string }[]
  header: ReactNode // 차고 탭 버튼 + 광장으로
  buy: (slot: SlotKey, v: string, team: TeamKey | null) => Promise<string | null>
  draw: () => Promise<{ err: string | null; got: string | null }>
  save: (eq: Equip) => Promise<string | null>
  gift: (to: string, slot: SlotKey, v: string, team: TeamKey | null) => Promise<string | null>
}) {
  const { row } = props
  const noColumns = !props.missing && !!row && !('interior_owned' in row) // add_race_interior.sql 실행 전
  const disabled = props.missing || noColumns
  const saved = useMemo(() => interiorOf(row), [row])
  const road = useMemo(() => roadOf(4242, COURSE), [])
  const track = useMemo(() => trackOf(4242, COURSE, 6), [])
  const theme = themeOf(COURSE)
  const raceCv = useRef<HTMLCanvasElement | null>(null)
  const garageCv = useRef<HTMLCanvasElement | null>(null)

  const [mode, setMode] = useState<'edit' | 'race'>('edit')
  const [view, setView] = useState<'chase' | 'cockpit'>('cockpit')
  const [local, setLocal] = useState<Equip | null>(null) // 저장 중 바로 보이게(서버 응답 오면 지움)
  const equip = local ?? saved
  const [slot, setSlot] = useState<SlotKey>('wheel')
  const [draft, setDraft] = useState<Pick | null>(null) // 미보유 미리보기(장착 아님)
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<Equip | null>(null)
  const [hoverSlot, setHoverSlot] = useState<SlotKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [giftTo, setGiftTo] = useState(props.members[0]?.id ?? '')

  const coins = row?.coins ?? 0
  const gifted = new Set(row?.interior_gifts ?? [])
  const isOwned = (s: SlotKey, v: string, t: TeamKey | null) => ownsInterior(row, s, v, t)
  const shown: Equip = draft ? { ...equip, [slot]: draft } : equip
  const live = useRef({ mode, view, shown, equip, hl: hoverSlot ?? slot as SlotKey | null })
  useEffect(() => { live.current = { mode, view, shown, equip, hl: hoverSlot ?? slot } })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || live.current.mode !== 'race') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
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
      const ov = { me: { x: me.x, y: me.y, v: me.v, item: me.item }, steer: steerVis, others: karts.slice(1).map((k, i) => ({ x: k.x, y: k.y, color: DEMO_COLORS[i + 1] })), rank, total: 6, wall }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const L = live.current
      const paint = (cv: HTMLCanvasElement, m: 'chase' | 'cockpit', eq: Equip, hl: SlotKey | null) => {
        const ctx = cv.getContext('2d')
        if (!ctx) return
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        if (m === 'cockpit') { const sc = scene(COCKPIT_CAM); drawChase(ctx, sc); drawCockpit(ctx, eq, ov, hl); drawRadar(ctx, COCKPIT_RADAR.x, COCKPIT_RADAR.y, COCKPIT_RADAR.w, COCKPIT_RADAR.h, sc) }
        else { const sc = scene(); drawChase(ctx, sc); drawRadar(ctx, W - 92, 50, 70, 226, sc) }
      }
      if (L.mode === 'race' && raceCv.current) paint(raceCv.current, L.view, L.equip, null) // 레이스 = 실제 장착만
      const gv = garageCv.current, gtx = gv?.getContext('2d')
      if (L.mode === 'edit' && gv && gtx) {
        paint(off, 'cockpit', L.shown, L.hl)
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
  const saveEquip = async (next: Equip, ok: string | null) => {
    setLocal(next)
    const done = await run(() => props.save(next), ok)
    setLocal(null)
    return done
  }

  // ── 고르기 ──
  const chooseSlot = (k: SlotKey) => { setSlot(k); setDraft(null); setNote(null) }
  // 가진 조합이면 바로 장착, 아니면 미리보기(장착 안 됨)
  const tryPick = (v: string, team: TeamKey | null) => {
    setNote(null)
    if (isOwned(slot, v, team)) { setDraft(null); if (equip[slot].v !== v || equip[slot].team !== team) void saveEquip({ ...equip, [slot]: { v, team } }, null) }
    else setDraft({ v, team })
  }
  const pickVariant = (v: string) => {
    const cur = draft ?? equip[slot]
    // 지금 구단으로 있으면 그대로, 없으면 이 종류 중 가진 구단, 그것도 없으면 지금 구단으로 미리보기
    if (isOwned(slot, v, cur.team)) return tryPick(v, cur.team)
    const have = TEAM_KEYS.find(t => isOwned(slot, v, t))
    tryPick(v, have === undefined ? cur.team : have)
  }
  const buy = async () => {
    if (!draft) return
    const vv = variantOf(slot, draft.v)
    if (!vv || vv.get !== 'shop') return
    const d = draft
    if (await run(() => props.buy(slot, d.v, d.team), `🪙 ${vv.price} — ${teamShort(d.team)} ${vv.name} 장착!`)) setDraft(null)
  }
  const draw = async () => {
    if (busy) return
    setBusy(true)
    const r = await props.draw()
    setBusy(false)
    if (r.err || !r.got) { setNote(r.err); return }
    const [s, v, t] = r.got.split(':') as [SlotKey, string, string]
    const team = t === 'base' ? null : (t as TeamKey)
    setSlot(s); setDraft({ v, team })
    setNote(`🎉 ${teamShort(team)} ${variantOf(s, v)?.name ?? v} 획득! (${slotOf(s).name})`)
  }
  // 🎨 전부 이 구단으로 — 가진 조합만 바꾸고, 없는 부위는 그대로
  const matchAll = () => {
    const team = (draft ?? equip[slot]).team
    const next = { ...equip }
    const skipped: string[] = []
    for (const s of SLOTS) {
      if (isOwned(s.key, equip[s.key].v, team)) next[s.key] = { v: equip[s.key].v, team }
      else skipped.push(s.name)
    }
    setUndo(equip); setDraft(null)
    void saveEquip(next, `🎨 ${teamShort(team)}으로 ${SLOTS.length - skipped.length}개 맞춤${skipped.length ? ` · ${skipped.join('·')}는 ${teamShort(team)} 아이템이 없어 그대로` : ''}`)
  }
  const slotAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return hitSlot(shown, CROP_X + (e.clientX - r.left) / P_SCALE, (e.clientY - r.top - P_TOP) / P_SCALE)
  }

  const cur = draft ?? equip[slot]
  const curV = variantOf(slot, cur.v) ?? slotOf(slot).variants[0]
  const previewing = !!draft && !isOwned(slot, draft.v, draft.team)
  const st = (s: SlotKey, v: string, t: TeamKey | null): 'on' | 'have' | 'shop' | 'random' =>
    equip[s].v === v && equip[s].team === t ? 'on' : isOwned(s, v, t) ? 'have' : variantOf(s, v)?.get === 'shop' ? 'shop' : 'random'

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
        <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] text-white/75">레이스에선 실제 장착한 조합만 보여요 · 레이스 중에도 V로 바꿔요</span>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-[46] flex overflow-hidden bg-[#111827] text-white" style={{ width: W, height: H }}>
      {/* 왼쪽: 운전석 미리보기(중심) */}
      <div className="relative shrink-0" style={{ width: PW, height: PH }}>
        <canvas ref={garageCv} style={{ width: PW, height: PH, display: 'block', cursor: hoverSlot ? 'pointer' : 'default' }} aria-label="운전석 미리보기"
          onMouseMove={e => setHoverSlot(slotAt(e))} onMouseLeave={() => setHoverSlot(null)}
          onClick={e => { const k = slotAt(e); if (k) chooseSlot(k) }} />
        <div className="pointer-events-none absolute inset-x-0 top-2.5 text-center">
          <p className="text-[14px] font-black">🪑 내 운전석</p>
          <p className="text-[10.5px] text-white/60">{hoverSlot ? `${slotOf(hoverSlot).icon} ${slotOf(hoverSlot).name} — 눌러서 고르기` : '부위를 눌러서 골라도 돼요 · 레이스 중 V = 운전석 시점'}</p>
        </div>
        {previewing && (
          <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full bg-[#0F172A]/90 px-3 py-1 text-[11.5px] font-bold text-[#FDE68A] ring-1 ring-[#FDE68A]/60">
            👀 미리보기 중 — {slotOf(slot).name}은 아직 장착 전
          </div>
        )}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setDraft(null); setMode('race') }} className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-[11.5px] font-bold backdrop-blur hover:bg-black/75">🏎 레이스에서 보기</button>
      </div>

      {/* 오른쪽: 장착 현황 → 고른 부위 편집 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2">
        {props.header}
        {disabled && <p className="rounded-md bg-[#7F1D1D] px-2 py-1 text-[11px]">{props.missing ? '차고 저장 테이블이 아직 없어요 — add_race_garage.sql 실행이 필요해요' : '실내 저장 칸이 아직 없어요 — supabase/add_race_interior.sql 실행이 필요해요(미리보기만 돼요)'}</p>}
        <div className="flex items-center justify-between">
          <p className="text-[11.5px] font-black tracking-tight text-white/80">장착 현황 <span className="font-semibold text-white/40">· 🪙 {coins}</span></p>
          <button type="button" disabled={disabled || busy || coins < INTERIOR_DRAW_PRICE} onMouseDown={e => e.preventDefault()} onClick={() => void draw()}
            className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-40" title="아직 없는 상점·뽑기 아이템 중 하나(구단도 무작위)">🎲 실내 뽑기 🪙{INTERIOR_DRAW_PRICE}</button>
        </div>
        {/* 6개 부위 — 작은 칸 */}
        <div className="grid grid-cols-3 gap-1">
          {GROUPS.map(gr => {
            const key = gr.subs.includes(slot) ? slot : gr.key
            const p = key === slot && draft ? draft : equip[key]
            const v = variantOf(key, p.v) ?? slotOf(key).variants[0]
            const on = gr.subs.includes(slot)
            const extra = gr.subs.length > 1 ? gr.subs.filter(k => k !== key).map(k => variantOf(k, equip[k].v)?.name ?? '').join('') : ''
            const hasNew = gr.subs.some(k => [...gifted].some(g => g.startsWith(`${k}:`)))
            return (
              <button key={gr.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => chooseSlot(key)} onMouseEnter={() => setHoverSlot(key)} onMouseLeave={() => setHoverSlot(null)}
                className={`relative flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors ${on ? 'bg-white/[0.12] ring-1 ring-[#FACC15]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px]" style={{ background: `${palOf(p.team).main}55` }}>{v.e}</span>
                <span className="min-w-0 flex-1 leading-[1.15]">
                  <span className={`block text-[10px] font-semibold ${on ? 'text-[#FDE68A]' : 'text-white/45'}`}>{gr.label}{on && previewing ? ' · 👀 미리보기' : ''}</span>
                  <span className="block truncate text-[11px] font-bold">{v.name}{extra && <span className="font-semibold text-white/45"> + {extra}</span>}</span>
                </span>
                <TeamDot team={p.team} size={18} />
                {hasNew && <span className="absolute -right-0.5 -top-0.5 text-[9px]">🎁</span>}
              </button>
            )
          })}
        </div>

        {/* 고른 부위 편집 */}
        <div className="flex min-h-0 flex-1 flex-col gap-1 rounded-lg bg-black/20 px-2 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-[11.5px] font-black text-[#FDE68A]">{slotOf(slot).icon} {groupOf(slot).label}</p>
              {groupOf(slot).subs.length > 1 ? groupOf(slot).subs.map(k => (
                <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => chooseSlot(k)} className={`rounded-md px-1.5 py-[1px] text-[10.5px] font-bold ${k === slot ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{k === 'frame' ? '테두리(사이드미러 포함)' : '장식'}</button>
              )) : <span className="text-[11px] font-semibold text-white/45">— 종류</span>}
            </div>
            <button type="button" disabled={disabled || busy} onMouseDown={e => e.preventDefault()} onClick={matchAll} className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40" title="가진 조합만 바꾸고 없는 부위는 그대로">🎨 6개 다 {teamShort(cur.team)}으로</button>
          </div>
          <div className="flex gap-1">
            {slotOf(slot).variants.map(v => {
              const on = cur.v === v.key
              const n = TEAM_KEYS.filter(t => isOwned(slot, v.key, t)).length
              const eq = equip[slot].v === v.key
              return (
                <button key={v.key} type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => pickVariant(v.key)}
                  className={`flex min-w-0 flex-1 flex-col items-center rounded-md py-1 leading-tight transition-colors ${on ? 'bg-white/[0.14] ring-1 ring-[#FACC15]' : 'bg-white/[0.04] hover:bg-white/[0.09]'}`}>
                  <span className="text-[16px]">{v.e}</span>
                  <span className="w-full truncate px-1 text-center text-[10.5px] font-bold">{v.name}</span>
                  <span className={`text-[9.5px] font-semibold ${eq ? 'text-[#FACC15]' : n ? 'text-[#86EFAC]' : 'text-white/40'}`}>
                    {eq ? '장착 중' : v.get === 'free' ? '무료' : n ? `${n}구단 보유` : v.get === 'shop' ? `🪙${v.price}` : '🎲 뽑기'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[10.5px] font-semibold text-white/45">구단 <span className="text-white/30">— {curV.name}에만 적용</span></p>
          <div className="flex items-center gap-[3px]">
            {TEAM_KEYS.map(t => {
              const s2 = st(slot, cur.v, t)
              const sel = cur.team === t
              const gift = gifted.has(itemKey(slot, cur.v, t))
              return (
                <button key={t ?? 'base'} type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => tryPick(cur.v, t)}
                  title={`${teamShort(t)} · ${s2 === 'on' ? '장착 중' : s2 === 'have' ? '보유(누르면 장착)' : s2 === 'shop' ? '구매 가능' : '미보유(뽑기·선물)'}`}
                  className={`relative rounded-full p-[2px] ${sel ? 'ring-2 ring-[#FACC15]' : ''}`}>
                  <span className={s2 === 'random' || s2 === 'shop' ? 'opacity-35 grayscale-[60%]' : ''}><TeamDot team={t} size={24} /></span>
                  {s2 === 'on' && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#FACC15]" />}
                  {s2 === 'have' && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#86EFAC]" />}
                  {gift && <span className="absolute -right-1 -top-1 text-[9px]">🎁</span>}
                </button>
              )
            })}
          </div>
          <div className="mt-auto flex items-center gap-1.5">
            {previewing && draft ? (() => {
              const vv = variantOf(slot, draft.v)
              return (
                <>
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#FDE68A]">👀 {teamShort(draft.team)} {vv?.name} — 미보유</p>
                  {vv?.get === 'shop'
                    ? <button type="button" disabled={disabled || busy || coins < (vv.price ?? 0)} onMouseDown={e => e.preventDefault()} onClick={() => void buy()} className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-black disabled:bg-white/10 disabled:text-white/40">🪙 {vv.price} 사고 장착</button>
                    : <span className="rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-semibold text-white/60">🎲 뽑기·선물로만</span>}
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setDraft(null)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/10">취소</button>
                </>
              )
            })() : (
              <p className="min-w-0 flex-1 truncate text-[11px] text-white/60">{note ?? <><span className="text-[#FACC15]">●</span> 장착 중 · <span className="text-[#86EFAC]">●</span> 보유(누르면 장착) · 흐린 것 = 미보유(눌러서 미리보기)</>}</p>
            )}
            {draft && !previewing && <button type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => { const d = draft; setDraft(null); void saveEquip({ ...equip, [slot]: d }, '장착했어요') }} className="rounded-md bg-[#FACC15] px-2.5 py-1 text-[11px] font-black text-[#0F172A]">장착하기</button>}
            {undo && !previewing && !draft && <button type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => { const u = undo; setUndo(null); void saveEquip(u, '되돌렸어요') }} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/10">↩ 되돌리기</button>}
            {props.isAdmin && curV.get !== 'free' && (
              <span className="flex items-center gap-1">
                <select value={giftTo} onChange={e => setGiftTo(e.target.value)} className="max-w-[72px] rounded bg-white/10 px-1 py-0.5 text-[10.5px]">
                  {props.members.map(m => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
                </select>
                <button type="button" disabled={disabled || busy || !giftTo} onMouseDown={e => e.preventDefault()}
                  onClick={() => void run(() => props.gift(giftTo, slot, cur.v, cur.team), `🎁 ${props.members.find(m => m.id === giftTo)?.name}님께 ${teamShort(cur.team)} ${curV.name} 선물!`)}
                  className="rounded-md bg-[#DB2777] px-1.5 py-1 text-[10.5px] font-bold disabled:opacity-40" title="관리자: 지금 고른 종류·구단을 선물">🎁 선물</button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamDot({ team, size }: { team: TeamKey | null; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white" style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${palOf(team).main}` }}>
      {team
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl(team)} alt={teamOf(team)?.name ?? ''} style={{ width: size * 0.72, height: size * 0.72 }} className="object-contain" />
        : <span className="font-black text-[#334155]" style={{ fontSize: size * 0.5 }}>H</span>}
    </span>
  )
}
