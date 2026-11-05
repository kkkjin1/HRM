'use client'

// 임시 목업(커밋 안 함) — 기본 추격 시점 + V키 운전석 1인칭, 차고 '실내' 탭.
// v2(2026-11-05): 부위마다 (종류, 구단) 따로 · 장착 현황 + 고른 부위만 편집 · 미리보기 클릭으로 부위 선택 · 레이스는 "레이스에서 보기"로

import { useEffect, useMemo, useRef, useState } from 'react'
import { H, W } from '@/lib/playground'
import { drawChase, drawRadar, type ChaseCam, type ChaseCar, type ChaseScene } from '@/components/playground/raceChase'
import { BASIC_CAR } from '@/lib/raceGarage'
import { KBO_TEAMS, logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import { ITEMS, V_BOOST, bump, cpuSteer, kartStep, newCpu, newKart, ranking, rng, type CpuMem, type Kart } from '@/lib/race'
import { COURSES, roadOf, themeOf, trackOf } from '@/lib/raceCourses'

const COURSE = COURSES.find(c => c.key === 'seongsu')!
const COCKPIT_CAM: ChaseCam = { back: 6, h: 32, follow: 1, horizon: 0.36, focal: 330, hideMe: true, carMaxSc: 3.2 }
const COLORS = ['#F59E0B', '#2563EB', '#DC2626', '#16A34A', '#0EA5E9', '#EA580C']
const NAMES = ['나', '진일', '수아', '민준', '지호', '하린']

// ── 실내 꾸미기: 부위 6개 × 종류 여러 개 × 구단 10개 — 부위마다 (종류, 구단)을 따로 고른다 ──
// 아이템 = (부위, 종류, 구단) 한 조합. 무료 종류는 모든 구단 보유, 상점 종류는 구단별로 사고, 뽑기 종류는 랜덤 획득·선물로만.
type SlotKey = 'wheel' | 'dash' | 'screen' | 'charm' | 'frame' | 'doll' | 'hands'
type Get = 'free' | 'shop' | 'random'
type Variant = { key: string; name: string; e: string; get: Get; price?: number }
const SLOTS: { key: SlotKey; name: string; icon: string; variants: Variant[] }[] = [
  { key: 'wheel', name: '핸들', icon: '🛞', variants: [
    { key: 'toy', name: '동글 장난감', e: '🍩', get: 'free' }, { key: 'race', name: '레이싱', e: '🏁', get: 'shop', price: 15 }, { key: 'bus', name: '큰 버스 핸들', e: '🚌', get: 'random' } ] },
  { key: 'dash', name: '대시보드', icon: '🎛️', variants: [
    { key: 'smooth', name: '매끈', e: '⬛', get: 'free' }, { key: 'stitch', name: '스티치 가죽', e: '🧵', get: 'shop', price: 10 }, { key: 'carbon', name: '카본', e: '🕸️', get: 'random' }, { key: 'wood', name: '원목 띠', e: '🪵', get: 'shop', price: 15 } ] },
  { key: 'screen', name: '가운데 화면', icon: '🖥️', variants: [
    { key: 'basic', name: '기본 화면', e: '📱', get: 'free' }, { key: 'led', name: '전광판', e: '🔆', get: 'shop', price: 10 }, { key: 'tv', name: '레트로 TV', e: '📺', get: 'random' }, { key: 'cheer', name: '응원 띠', e: '📣', get: 'shop', price: 10 } ] },
  { key: 'charm', name: '룸미러 장식', icon: '🪞', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'pennant', name: '응원 깃발', e: '🚩', get: 'shop', price: 5 }, { key: 'ball', name: '야구공', e: '⚾', get: 'shop', price: 5 }, { key: 'star', name: '별', e: '⭐', get: 'random' } ] },
  { key: 'frame', name: '거울 테두리', icon: '🪞', variants: [
    { key: 'basic', name: '기본', e: '▫️', get: 'free' }, { key: 'chrome', name: '크롬', e: '🪩', get: 'shop', price: 10 }, { key: 'stripe', name: '구단 줄무늬', e: '🎏', get: 'shop', price: 15 },
    { key: 'neon', name: '네온', e: '💡', get: 'random' }, { key: 'gold', name: '금테', e: '👑', get: 'random' } ] },
  { key: 'doll', name: '인형', icon: '🧸', variants: [
    { key: 'none', name: '없음', e: '∅', get: 'free' }, { key: 'dog', name: '강아지', e: '🐶', get: 'shop', price: 10 }, { key: 'penguin', name: '펭귄', e: '🐧', get: 'random' }, { key: 'duck', name: '오리', e: '🦆', get: 'random' } ] },
  { key: 'hands', name: '손', icon: '✋', variants: [
    { key: 'glove', name: '운전 장갑', e: '🧤', get: 'free' }, { key: 'mitt', name: '야구 글러브', e: '🥎', get: 'random' }, { key: 'mitten', name: '벙어리장갑', e: '🧶', get: 'shop', price: 5 } ] },
]
const slotOf = (k: SlotKey) => SLOTS.find(s => s.key === k)!
const variantOf = (k: SlotKey, v: string) => slotOf(k).variants.find(x => x.key === v)!
type Pick = { v: string; team: TeamKey | null }
type Equip = Record<SlotKey, Pick>
// 그리기 함수가 쓰는 납작한 모양(부위 하나의 구단 + 모든 부위 종류)
type Interior = { team: TeamKey | null } & Record<SlotKey, string>
const TEAM_KEYS: (TeamKey | null)[] = [null, ...KBO_TEAMS.map(t => t.key)]
const itemKey = (s: SlotKey, v: string, team: TeamKey | null) => `${s}:${v}:${team ?? 'base'}`
// 목업 보유 데이터(실제 데이터 아님) — 섞어 꾸민 예시 조합 + 랜덤으로 몇 개 모은 상태
const EQUIP0: Equip = {
  wheel: { v: 'race', team: 'kiwoom' }, dash: { v: 'stitch', team: 'samsung' }, charm: { v: 'pennant', team: 'kia' },
  screen: { v: 'tv', team: 'lotte' }, doll: { v: 'penguin', team: 'lg' }, hands: { v: 'mitt', team: 'nc' }, frame: { v: 'chrome', team: 'kt' },
}
// 장착 현황 6칸 — 룸미러 칸은 장식 + 거울 테두리 둘을 묶는다
const GROUPS: { key: SlotKey; label: string; subs: SlotKey[] }[] = [
  { key: 'wheel', label: '핸들', subs: ['wheel'] }, { key: 'dash', label: '대시보드', subs: ['dash'] }, { key: 'screen', label: '가운데 화면', subs: ['screen'] },
  { key: 'charm', label: '룸미러', subs: ['charm', 'frame'] }, { key: 'doll', label: '인형', subs: ['doll'] }, { key: 'hands', label: '손', subs: ['hands'] },
]
const groupOf = (k: SlotKey) => GROUPS.find(g => g.subs.includes(k))!
const OWNED0 = [
  ...Object.entries(EQUIP0).map(([s, p]) => itemKey(s as SlotKey, p.v, p.team)),
  itemKey('wheel', 'race', 'kt'), itemKey('wheel', 'bus', 'hanwha'), itemKey('dash', 'carbon', 'ssg'), itemKey('dash', 'stitch', 'kia'),
  itemKey('charm', 'ball', 'doosan'), itemKey('screen', 'led', 'kt'), itemKey('screen', 'tv', 'kia'), itemKey('doll', 'dog', 'hanwha'),
  itemKey('doll', 'penguin', 'samsung'), itemKey('hands', 'mitt', 'lotte'), itemKey('charm', 'star', 'lg'),
  itemKey('frame', 'neon', 'ssg'), itemKey('frame', 'stripe', 'lg'), itemKey('frame', 'gold', 'kia'),
]
const GIFTED0 = [itemKey('charm', 'star', 'lg'), itemKey('frame', 'gold', 'kia')] // 받은 선물(아직 안 열어 본 것)
const teamShort = (t: TeamKey | null) => (t ? teamOf(t)!.name.split(' ')[0] : '기본')

// 구단 → 실내 색. main = 몸 색, accent = 포인트(어두우면 흰색), dash = 대시보드
type Pal = { main: string; accent: string; dash: string; word: string }
function palOf(team: TeamKey | null): Pal {
  const t = teamOf(team)
  if (!t) return { main: '#334155', accent: '#F59E0B', dash: '#1E293B', word: 'HRM' }
  const main = t.primary === '#000000' ? '#1A1A1A' : t.primary
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 }
  const accent = lum(t.secondary) > 70 ? t.secondary : lum(main) > 70 ? main : '#F8FAFC'
  return { main, accent, dash: shade(main, -0.4), word: t.wordmark }
}

// 미리보기 = 운전석 그림(1080×320)의 가운데를 잘라 크게
const PW = 600, PH = H
const CROP_X = 200, CROP_W = W - 400
const P_SCALE = PW / CROP_W
const P_TOP = PH - H * P_SCALE

export default function CockpitMock() {
  const course = COURSE
  const seed = 4242
  const road = useMemo(() => roadOf(seed, course), [course])
  const track = useMemo(() => trackOf(seed, course, 6), [course])
  const theme = themeOf(course)
  const raceCv = useRef<HTMLCanvasElement | null>(null)
  const garageCv = useRef<HTMLCanvasElement | null>(null)

  const [mode, setMode] = useState<'edit' | 'race'>('edit')
  const [view, setView] = useState<'chase' | 'cockpit'>('cockpit')
  const [equip, setEquip] = useState<Equip>(EQUIP0) // 실제 장착
  const [slot, setSlot] = useState<SlotKey>('wheel') // 편집 중인 부위
  const [draft, setDraft] = useState<Pick | null>(null) // 미보유 미리보기(장착 아님)
  const [owned, setOwned] = useState<Set<string>>(() => new Set(OWNED0))
  const [gifted, setGifted] = useState<Set<string>>(() => new Set(GIFTED0))
  const [coins, setCoins] = useState(40)
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<Equip | null>(null)
  const [hoverSlot, setHoverSlot] = useState<SlotKey | null>(null)

  const isOwned = (s: SlotKey, v: string, t: TeamKey | null) => variantOf(s, v).get === 'free' || owned.has(itemKey(s, v, t))
  const shown: Equip = draft ? { ...equip, [slot]: draft } : equip // 미리보기에 그릴 조합
  const live = useRef({ mode, view, shown, equip, slot, hl: hoverSlot ?? slot })
  useEffect(() => { live.current = { mode, view, shown, equip, slot, hl: hoverSlot ?? slot } })

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'KeyV' && live.current.mode === 'race') setView(v => (v === 'chase' ? 'cockpit' : 'chase')) }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

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
      const cars: ChaseCar[] = karts.map((k, i) => ({ id: `k${i}`, name: NAMES[i], color: COLORS[i], car: BASIC_CAR, x: k.x, y: k.y, fx: fx(k), fin: k.finishedAt, isMe: i === 0 }))
      const wall = Date.now()
      const rank = ranking(karts.map((k, i) => ({ ...k, i }))).findIndex(o => o.i === 0) + 1
      const scene = (cam?: ChaseCam): ChaseScene => ({ w: W, h: H, me: { x: me.x, y: me.y, v: me.v, fx: fx(me) }, cars, things: track.filter(th => !(th.kind === 'box' && gone.has(th.id))), bananas: [], mails: [], wall, shake: 0, t, theme, road, cam })
      const ov = { me, steer: steerVis, karts, rank, wall }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const L = live.current
      const paint = (cv: HTMLCanvasElement, m: 'chase' | 'cockpit', eq: Equip, hl: SlotKey | null) => {
        const ctx = cv.getContext('2d')!
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        if (m === 'cockpit') { const sc = scene(COCKPIT_CAM); drawChase(ctx, sc); drawCockpit(ctx, eq, ov, hl); drawRadar(ctx, W - 96, 24, 56, 150, sc) }
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

  // ── 고르기 ──
  const chooseSlot = (k: SlotKey) => { setSlot(k); setDraft(null); setNote(null) }
  // 보유한 조합이면 바로 장착, 아니면 미리보기(장착 안 됨)
  const tryPick = (v: string, team: TeamKey | null) => {
    setNote(null)
    if (isOwned(slot, v, team)) {
      setEquip(e => ({ ...e, [slot]: { v, team } })); setDraft(null)
      setGifted(g => { const n = new Set(g); n.delete(itemKey(slot, v, team)); return n })
    } else setDraft({ v, team })
  }
  const pickVariant = (v: string) => {
    const cur = draft ?? equip[slot]
    // 지금 구단으로 있으면 그대로, 없으면 이 종류 중 가진 구단, 그것도 없으면 지금 구단으로 미리보기
    if (isOwned(slot, v, cur.team)) return tryPick(v, cur.team)
    const have = TEAM_KEYS.find(t => isOwned(slot, v, t))
    tryPick(v, have === undefined ? cur.team : have)
  }
  const buy = () => {
    if (!draft) return
    const vv = variantOf(slot, draft.v)
    if (vv.get !== 'shop' || coins < (vv.price ?? 0)) return
    setCoins(c => c - (vv.price ?? 0)) // 목업 안에서만(실제 코인 아님)
    setOwned(o => new Set(o).add(itemKey(slot, draft.v, draft.team)))
    setEquip(e => ({ ...e, [slot]: draft })); setDraft(null)
    setNote(`🪙 ${vv.price} — ${teamShort(draft.team)} ${vv.name} 장착(목업: 실제 코인 차감 없음)`)
  }
  // 🎨 전부 이 구단으로 — 가진 조합만 바꾸고, 없는 부위는 그대로 둔다(되돌리기 가능)
  const matchAll = () => {
    const team = (draft ?? equip[slot]).team
    const next = { ...equip }
    const skipped: string[] = []
    for (const s of SLOTS) {
      if (isOwned(s.key, equip[s.key].v, team)) next[s.key] = { v: equip[s.key].v, team }
      else skipped.push(s.name)
    }
    setUndo(equip); setEquip(next); setDraft(null)
    setNote(`🎨 ${teamShort(team)}으로 ${SLOTS.length - skipped.length}개 맞춤${skipped.length ? ` · ${skipped.join('·')}는 ${teamShort(team)} 아이템이 없어 그대로` : ''}`)
  }
  // 미리보기 클릭 → 부위
  const slotAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = CROP_X + (e.clientX - r.left) / P_SCALE, y = (e.clientY - r.top - P_TOP) / P_SCALE
    return hitSlot(shown, x, y)
  }

  const cur = draft ?? equip[slot]
  const curV = variantOf(slot, cur.v)
  const previewing = !!draft
  const st = (s: SlotKey, v: string, t: TeamKey | null): 'on' | 'have' | 'shop' | 'random' =>
    equip[s].v === v && equip[s].team === t ? 'on' : isOwned(s, v, t) ? 'have' : variantOf(s, v).get === 'shop' ? 'shop' : 'random'
  const giftCount = gifted.size

  return (
    <div className="min-h-screen bg-[#0B1220] p-6 text-white">
      <div className="mx-auto" style={{ width: W }}>
        <div className="mb-3">
          <h1 className="text-[20px] font-black">운전석 꾸미기 목업 v2 — 부위 6개 × 종류 × 구단 10개, 부위마다 따로</h1>
          <p className="text-[12.5px] text-white/55">실제 차고 크기(1080×320) · 보유·코인은 목업 데이터(실제 데이터·구매 아님) · 미리보기의 부위를 눌러도 골라져요</p>
        </div>

        {mode === 'race' ? (
          <div className="relative overflow-hidden rounded-xl ring-1 ring-white/15" style={{ width: W, height: H }}>
            <canvas ref={raceCv} style={{ width: W, height: H, display: 'block' }} />
            <div className="absolute left-2 top-2 flex gap-1.5">
              <button onClick={() => setMode('edit')} className="rounded-full bg-[#FACC15] px-3 py-1 text-[12px] font-black text-[#0F172A]">← 꾸미기로</button>
              <button onClick={() => setView(v => (v === 'chase' ? 'cockpit' : 'chase'))} className="flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1.5 pr-3 text-[12px] font-bold backdrop-blur hover:bg-black/70">
                <span className="rounded-full bg-white/90 px-1.5 text-[10.5px] font-black text-[#0F172A]">V</span>{view === 'chase' ? '🎥 추격 시점' : '🧑‍✈️ 운전석'}
              </button>
            </div>
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] text-white/75">레이스에선 실제 장착한 조합만 보여요</span>
          </div>
        ) : (
          <div className="flex overflow-hidden rounded-xl bg-[#111827] ring-1 ring-white/15" style={{ width: W, height: H }}>
            {/* 왼쪽: 운전석 미리보기(중심) */}
            <div className="relative shrink-0" style={{ width: PW, height: PH }}>
              <canvas ref={garageCv} style={{ width: PW, height: PH, display: 'block', cursor: hoverSlot ? 'pointer' : 'default' }} aria-label="운전석 미리보기"
                onMouseMove={e => setHoverSlot(slotAt(e))} onMouseLeave={() => setHoverSlot(null)}
                onClick={e => { const k = slotAt(e); if (k) chooseSlot(k) }} />
              <div className="pointer-events-none absolute inset-x-0 top-2.5 text-center">
                <p className="text-[14px] font-black">🪑 내 운전석</p>
                <p className="text-[10.5px] text-white/60">{hoverSlot ? `${slotOf(hoverSlot).icon} ${slotOf(hoverSlot).name} — 눌러서 고르기` : '부위를 눌러서 골라도 돼요'}</p>
              </div>
              {previewing && (
                <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full bg-[#0F172A]/90 px-3 py-1 text-[11.5px] font-bold text-[#FDE68A] ring-1 ring-[#FDE68A]/60">
                  👀 미리보기 중 — {slotOf(slot).name}은 아직 장착 전
                </div>
              )}
              <button onClick={() => { setDraft(null); setMode('race') }} className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-[11.5px] font-bold backdrop-blur hover:bg-black/75">🏎 레이스에서 보기</button>
            </div>

            {/* 오른쪽: 장착 현황 → 고른 부위 편집 */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-black tracking-tight text-white/85">장착 현황 <span className="font-semibold text-white/40">· 🪙 {coins}</span></p>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-white/55" title="기존 부품 상점(외관)">🛒 부품</span>
                  <span className="relative rounded-md bg-white/5 px-2 py-0.5 text-white/55" title="받은 선물">🎁 선물{giftCount > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#DC2626]" />}</span>
                  <span className="rounded-md bg-white/90 px-2 py-0.5 font-semibold text-[#1F2933]">광장으로</span>
                </div>
              </div>
              {/* 6개 부위 — 한 줄짜리 작은 칸 */}
              <div className="grid grid-cols-3 gap-1">
                {GROUPS.map(gr => {
                  const s = { key: gr.subs.includes(slot) ? slot : gr.key, name: gr.label }
                  const p = s.key === slot && draft ? draft : equip[s.key]
                  const v = variantOf(s.key, p.v)
                  const on = gr.subs.includes(slot)
                  const extra = gr.subs.length > 1 ? gr.subs.filter(k => k !== s.key).map(k => variantOf(k, equip[k].v).name).join('') : ''
                  return (
                    <button key={s.key} onClick={() => chooseSlot(s.key)} onMouseEnter={() => setHoverSlot(s.key)} onMouseLeave={() => setHoverSlot(null)}
                      className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors ${on ? 'bg-white/[0.12] ring-1 ring-[#FACC15]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px]" style={{ background: `${palOf(p.team).main}55` }}>{v.e}</span>
                      <span className="min-w-0 flex-1 leading-[1.15]">
                        <span className={`block text-[10px] font-semibold ${on ? 'text-[#FDE68A]' : 'text-white/45'}`}>{s.name}{on && draft ? ' · 👀 미리보기' : ''}</span>
                        <span className="block truncate text-[11px] font-bold">{v.name}{extra && <span className="font-semibold text-white/45"> + {extra}</span>}</span>
                      </span>
                      <TeamDot team={p.team} size={18} />
                    </button>
                  )
                })}
              </div>

              {/* 고른 부위 편집 */}
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-lg bg-black/20 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11.5px] font-black text-[#FDE68A]">{slotOf(slot).icon} {groupOf(slot).label}</p>
                    {groupOf(slot).subs.length > 1 ? groupOf(slot).subs.map(k => (
                      <button key={k} onClick={() => chooseSlot(k)} className={`rounded-md px-1.5 py-[1px] text-[10.5px] font-bold ${k === slot ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{k === 'frame' ? '테두리(사이드미러 포함)' : '장식'}</button>
                    )) : <span className="text-[11px] font-semibold text-white/45">— 종류</span>}
                  </div>
                  <button onClick={matchAll} className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold text-white/55 hover:bg-white/10 hover:text-white" title="가진 조합만 바꾸고 없는 부위는 그대로">🎨 6개 다 {teamShort(cur.team)}으로</button>
                </div>
                <div className="flex gap-1">
                  {slotOf(slot).variants.map(v => {
                    const on = cur.v === v.key
                    const n = TEAM_KEYS.filter(t => isOwned(slot, v.key, t)).length
                    const eq = equip[slot].v === v.key
                    return (
                      <button key={v.key} onClick={() => pickVariant(v.key)}
                        className={`flex min-w-0 flex-1 flex-col items-center rounded-md py-1 leading-tight transition-colors ${on ? 'bg-white/[0.14] ring-1 ring-[#FACC15]' : 'bg-white/[0.04] hover:bg-white/[0.09]'}`}>
                        <span className="text-[17px]">{v.e}</span>
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
                      <button key={t ?? 'base'} onClick={() => tryPick(cur.v, t)} title={`${teamShort(t)} · ${s2 === 'on' ? '장착 중' : s2 === 'have' ? '보유' : s2 === 'shop' ? '구매 가능' : '미보유(뽑기)'}`}
                        className={`relative rounded-full p-[2px] ${sel ? 'ring-2 ring-[#FACC15]' : ''}`}>
                        <span className={s2 === 'random' || s2 === 'shop' ? 'opacity-35 grayscale-[60%]' : ''}><TeamDot team={t} size={24} /></span>
                        {s2 === 'on' && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#FACC15]" />}
                        {s2 === 'have' && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#86EFAC]" />}
                        {gift && <span className="absolute -right-1 -top-1 text-[9px]">🎁</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  {(() => {
                    if (!previewing) return <p className="flex-1 truncate text-[11px] text-white/60">{note ?? <><span className="text-[#FACC15]">●</span> 장착 중 · <span className="text-[#86EFAC]">●</span> 보유(누르면 장착) · 흐린 것 = 미보유(눌러서 미리보기)</>}</p>
                    const vv = variantOf(slot, draft!.v)
                    return (
                      <>
                        <p className="flex-1 truncate text-[11px] font-semibold text-[#FDE68A]">👀 {teamShort(draft!.team)} {vv.name} — 미보유</p>
                        {vv.get === 'shop'
                          ? <button onClick={buy} disabled={coins < (vv.price ?? 0)} className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-black disabled:bg-white/10 disabled:text-white/40">🪙 {vv.price} 사고 장착</button>
                          : <span className="rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-semibold text-white/60">🎲 뽑기·선물로만 얻어요</span>}
                        <button onClick={() => setDraft(null)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/10">취소</button>
                      </>
                    )
                  })()}
                  {undo && !previewing && <button onClick={() => { setEquip(undo); setUndo(null); setNote('되돌렸어요') }} className="rounded-md px-2 py-1 text-[11px] font-semibold text-white/60 hover:bg-white/10">↩ 되돌리기</button>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamDot({ team, size }: { team: TeamKey | null; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white" style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${palOf(team).main}` }}>
      {team
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl(team)} alt="" style={{ width: size * 0.72, height: size * 0.72 }} className="object-contain" />
        : <span className="font-black text-[#334155]" style={{ fontSize: size * 0.5 }}>H</span>}
    </span>
  )
}

// ── 운전석 그리기 ──
type Ov = { me: Kart; steer: number; karts: Kart[]; rank: number; wall: number }
const kmh = (v: number) => Math.round(v / 4)
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))))
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(c => c.toString(16).padStart(2, '0')).join('')
}
const imgs = new Map<string, HTMLImageElement>()
function img(src: string) {
  let i = imgs.get(src)
  if (!i) { i = new Image(); i.src = src; imgs.set(src, i) }
  return i.complete && i.naturalWidth > 0 ? i : null
}
// 구단 로고(없으면 H) — 흰 원 배지 위에
function badge(ctx: CanvasRenderingContext2D, team: TeamKey | null, cx: number, cy: number, r: number, pal: Pal, ring = true) {
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  if (ring) { ctx.strokeStyle = pal.accent; ctx.lineWidth = Math.max(1, r * 0.14); ctx.stroke() }
  const lg = team ? img(logoUrl(team)) : null
  if (lg) ctx.drawImage(lg, cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44)
  else { ctx.fillStyle = pal.main; ctx.font = `900 ${Math.round(r * 0.9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', cx, cy + 1) }
}
function emojiAt(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, px: number) {
  ctx.font = `${px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y)
}

// n = 부위별 (종류, 구단). 부위마다 색·로고를 따로 쓴다. hl = 강조할 부위(꾸미기 중 고른 부위)
function drawCockpit(ctx: CanvasRenderingContext2D, n: Equip, o: Ov, hl: SlotKey | null = null) {
  const w = W, h = H
  const L = (k: SlotKey): Interior => ({ team: n[k].team, wheel: n.wheel.v, dash: n.dash.v, screen: n.screen.v, charm: n.charm.v, frame: n.frame.v, doll: n.doll.v, hands: n.hands.v })
  const it = L('dash')
  const pal = palOf(n.dash.team) // 대시보드 구단 = 지붕·기둥·거울 틀·송풍구 색
  const top = h * 0.6
  // 지붕·A필러
  const pillar = shade(pal.dash, -0.35)
  ctx.fillStyle = pillar
  ctx.fillRect(0, 0, w, 12)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(80, 0); ctx.lineTo(34, top + 2); ctx.lineTo(0, top + 14); ctx.fill()
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - 80, 0); ctx.lineTo(w - 34, top + 2); ctx.lineTo(w, top + 14); ctx.fill()
  // 룸미러 + 장식
  const mx = w / 2 - 95, my = 16, mw = 190, mh = 38
  const fs: FrameStyle = { v: n.frame.v, team: n.frame.team, pal: palOf(n.frame.team), base: pillar }
  mirror(ctx, mx, my, mw, mh, o, 0, fs)
  drawCharm(ctx, L('charm'), palOf(n.charm.team), w / 2 + 70, my + mh + 2, o)

  // ── 대시보드(종류별 질감, 색은 구단) ──
  const dashPath = () => { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, top + 26); ctx.quadraticCurveTo(w / 2, top - 46, w, top + 26); ctx.lineTo(w, h); ctx.closePath() }
  const dg = ctx.createLinearGradient(0, top - 30, 0, h)
  dg.addColorStop(0, shade(pal.dash, 0.18)); dg.addColorStop(0.35, pal.dash); dg.addColorStop(1, shade(pal.dash, -0.5))
  ctx.fillStyle = dg; dashPath(); ctx.fill()
  ctx.save(); dashPath(); ctx.clip()
  if (it.dash === 'carbon') {
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    for (let x = -h; x < w; x += 9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke() }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    for (let x = 0; x < w + h; x += 9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x - h, 0); ctx.stroke() }
  } else if (it.dash === 'wood') {
    const by = top + 34
    const wg = ctx.createLinearGradient(0, by - 30, 0, by + 30); wg.addColorStop(0, '#B45309'); wg.addColorStop(1, '#78350F')
    ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(0, by + 26); ctx.quadraticCurveTo(w / 2, by - 44, w, by + 26); ctx.lineTo(w, by + 48); ctx.quadraticCurveTo(w / 2, by - 22, 0, by + 48); ctx.fill()
    ctx.strokeStyle = 'rgba(253,230,138,0.25)'; ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, by + 30 + i * 5); ctx.quadraticCurveTo(w / 2, by - 40 + i * 5, w, by + 30 + i * 5); ctx.stroke() }
  }
  ctx.restore()
  if (it.dash === 'stitch' || it.dash === 'wood') {
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 5])
    ctx.beginPath(); ctx.moveTo(0, top + 40); ctx.quadraticCurveTo(w / 2, top - 30, w, top + 40); ctx.stroke(); ctx.setLineDash([])
  }
  // 위 테두리 포인트 선(모든 종류)
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(0, top + 26); ctx.quadraticCurveTo(w / 2, top - 46, w, top + 26); ctx.stroke()

  // 사이드미러
  mirror(ctx, 40, top + 4, 120, 46, o, -1, fs)
  mirror(ctx, w - 160, top + 4, 120, 46, o, 1, fs)
  // 송풍구
  for (const vx of [w / 2 - 330, w / 2 - 270]) {
    ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.roundRect(vx, top + 44, 44, 24, 8); ctx.fill()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(vx + 4, top + 44 + i * 6); ctx.lineTo(vx + 40, top + 44 + i * 6); ctx.stroke() }
  }
  // 인형(대시보드 위, 왼쪽)
  drawDoll(ctx, L('doll'), palOf(n.doll.team), w / 2 + 120, top - 10, o)
  // 가운데 화면
  drawScreen(ctx, L('screen'), palOf(n.screen.team), w / 2 + 175, top + 18, 170, 84, o)
  // 계기판(핸들 왼쪽 — 핸들 가운데 로고가 보이게 비켜 둠)
  const gx = w / 2 - 175, gy = top + 98
  ctx.fillStyle = shade(pal.dash, -0.6); ctx.beginPath(); ctx.ellipse(gx, gy + 2, 52, 40, 0, Math.PI, Math.PI * 2); ctx.fill()
  gauge(ctx, gx, gy, 34, o.me.v, pal.accent)
  if (o.me.v > V_BOOST - 60) { ctx.fillStyle = '#FDBA74'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('🚀 BOOST', gx, gy - 44) }
  // 핸들 + 손
  drawWheel(ctx, L('wheel'), palOf(n.wheel.team), o, L('hands'), palOf(n.hands.team))
  if (hl) drawHighlight(ctx, n, hl, o)
}

function drawWheel(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, o: Ov, hIt: Interior, hPal: Pal) {
  const w = W, h = H
  ctx.save(); ctx.translate(w / 2, h + 24); ctx.rotate(o.steer * 0.55)
  ctx.lineCap = 'round'
  let R = 128, handY = -70, handX = R - 4
  const stroke = (lw: number, color: string, path: () => void) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); path(); ctx.stroke() }
  if (it.wheel === 'toy') {
    // 동글 장난감 — 아주 두툼한 고리 + 굵은 살 + 큰 버튼
    const ring = () => ctx.arc(0, 0, R, Math.PI * 1.04, Math.PI * 1.96)
    stroke(34, shade(pal.main, -0.35), ring); stroke(28, pal.main, ring); stroke(6, 'rgba(255,255,255,0.28)', () => ctx.arc(0, 0, R + 6, Math.PI * 1.12, Math.PI * 1.5))
    stroke(22, pal.main, () => { ctx.moveTo(-R + 14, -40); ctx.lineTo(-30, -44); ctx.moveTo(R - 14, -40); ctx.lineTo(30, -44) })
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.arc(0, -40, 40, 0, Math.PI * 2); ctx.fill()
    badge(ctx, it.team, 0, -42, 25, pal)
    ctx.fillStyle = pal.accent
    for (const a of [0.2, 0.4, 0.6, 0.8]) { ctx.beginPath(); ctx.arc(Math.cos(Math.PI * (1 + a)) * R, Math.sin(Math.PI * (1 + a)) * R, 4, 0, Math.PI * 2); ctx.fill() }
  } else if (it.wheel === 'race') {
    // 레이싱 — D컷 + 12시 포인트 + 작은 허브
    const arcs = () => { ctx.arc(0, 0, R, Math.PI * 1.06, Math.PI * 1.36); ctx.moveTo(Math.cos(Math.PI * 1.64) * R, Math.sin(Math.PI * 1.64) * R); ctx.arc(0, 0, R, Math.PI * 1.64, Math.PI * 1.94) }
    const flat = () => { ctx.moveTo(Math.cos(Math.PI * 1.36) * R, Math.sin(Math.PI * 1.36) * R); ctx.lineTo(Math.cos(Math.PI * 1.64) * R, Math.sin(Math.PI * 1.64) * R) }
    stroke(22, shade(pal.main, 0.3), arcs); stroke(22, shade(pal.main, 0.3), flat)
    stroke(17, '#111827', arcs); stroke(17, '#111827', flat)
    stroke(5, pal.accent, () => { ctx.moveTo(0, -R - 10); ctx.lineTo(0, -R + 9) })
    stroke(12, '#111827', () => { ctx.moveTo(-R + 10, -44); ctx.lineTo(-30, -44); ctx.moveTo(R - 10, -44); ctx.lineTo(30, -44) })
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(0, -40, 32, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = pal.main; ctx.lineWidth = 4; ctx.stroke()
    badge(ctx, it.team, 0, -40, 20, pal, false)
  } else {
    // 큰 버스 핸들 — 크고 얇게, 살 여러 개
    R = 172; handY = -112; handX = R - 30
    const ring = () => ctx.arc(0, 0, R, Math.PI * 1.08, Math.PI * 1.92)
    stroke(14, shade(pal.main, -0.4), ring); stroke(10, shade(pal.main, 0.35), ring)
    for (const a of [1.25, 1.5, 1.75]) stroke(7, shade(pal.main, 0.15), () => { ctx.moveTo(0, -40); ctx.lineTo(Math.cos(Math.PI * a) * R, Math.sin(Math.PI * a) * R) })
    ctx.fillStyle = shade(pal.main, 0.15); ctx.beginPath(); ctx.arc(0, -40, 30, 0, Math.PI * 2); ctx.fill()
    badge(ctx, it.team, 0, -40, 20, pal)
  }
  for (const sx of [-1, 1]) drawHand(ctx, hIt, hPal, sx * handX, handY, sx)
  ctx.restore()
}

function drawHand(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, sx: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(sx * 0.45)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5
  if (it.hands === 'mitt') {
    // 야구 글러브 — 갈색 큰 장갑 + 구단 색 끈 + 로고 패치
    ctx.fillStyle = '#9A5B2A'; ctx.beginPath(); ctx.ellipse(0, -4, 22, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -26); ctx.lineTo(i * 7, -14); ctx.stroke() }
    badge(ctx, it.team, 0, 4, 8, pal)
  } else if (it.hands === 'mitten') {
    // 벙어리장갑 — 구단 색 + 흰 털 소매
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(0, -6, 17, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(-sx * 14, -2, 7, 10, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.roundRect(-16, 10, 32, 10, 5); ctx.fill()
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(0, -8, 4, 0, Math.PI * 2); ctx.fill()
  } else {
    // 운전 장갑 — 포인트 색 + 손등 로고
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(-14, 12, 28, 8, 3); ctx.fill()
    badge(ctx, it.team, 0, -2, 7, pal, false)
  }
  ctx.restore()
}

function drawScreen(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, dx: number, dy: number, dw: number, dh: number, o: Ov) {
  const item = o.me.item ? ITEMS[o.me.item].emoji : ''
  const rankTxt = `${o.rank}등`
  if (it.screen === 'tv') {
    // 레트로 TV — 구단 색 두꺼운 틀 + 안테나
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(dx + dw / 2, dy - 4); ctx.lineTo(dx + dw / 2 - 26, dy - 26); ctx.moveTo(dx + dw / 2, dy - 4); ctx.lineTo(dx + dw / 2 + 22, dy - 28); ctx.stroke()
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 6, dw + 16, dh + 12, 18); ctx.fill()
    ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.roundRect(dx + 4, dy + 4, dw - 40, dh - 8, 14); ctx.fill()
    badge(ctx, it.team, dx + 4 + (dw - 40) / 2, dy + dh / 2 - 8, 22, pal)
    ctx.fillStyle = '#FDE68A'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(rankTxt, dx + 4 + (dw - 40) / 2, dy + dh - 8)
    ctx.fillStyle = pal.accent; for (const yy of [dy + 18, dy + 38]) { ctx.beginPath(); ctx.arc(dx + dw - 16, yy, 6, 0, Math.PI * 2); ctx.fill() }
    if (item) emojiAt(ctx, item, dx + dw - 16, dy + 62, 16)
    return
  }
  ctx.fillStyle = '#020617'; ctx.beginPath(); ctx.roundRect(dx - 4, dy - 4, dw + 8, dh + 8, 12); ctx.fill()
  if (it.screen === 'led') { drawLed(ctx, it.team, pal, dx, dy, dw, dh, o, item); return }
  if (it.screen === 'cheer') {
    // 응원 띠 — 구단 색 바탕에 글씨가 흐름
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.clip()
    const msg = `${pal.word} 화이팅! ★ `
    ctx.font = '900 18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF'
    const tw = ctx.measureText(msg).width
    const off = (o.wall / 20) % tw
    for (let x = dx - off; x < dx + dw; x += tw) ctx.fillText(msg, x, dy + 24)
    ctx.restore()
    badge(ctx, it.team, dx + 26, dy + 60, 16, pal)
    ctx.fillStyle = '#FDE68A'; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(rankTxt, dx + 50, dy + 61)
    if (item) emojiAt(ctx, item, dx + dw - 22, dy + 61, 18)
    return
  }
  // 기본 화면
  const sg = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh); sg.addColorStop(0, '#0F172A'); sg.addColorStop(1, shade(pal.main, -0.5))
  ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 9); ctx.fill()
  badge(ctx, it.team, dx + 40, dy + 42, 28, pal)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FDE68A'; ctx.font = '900 24px sans-serif'; ctx.fillText(rankTxt, dx + 82, dy + 38)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 10px sans-serif'; ctx.fillText('/ 6대', dx + 128, dy + 38)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(dx + 82, dy + 46, 30, 30, 7); ctx.stroke()
  if (item) emojiAt(ctx, item, dx + 97, dy + 62, 20)
}

function drawCharm(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, o: Ov) {
  if (it.charm === 'none') return
  const sw = Math.sin(o.wall / 260) * 0.25 + o.steer * -0.35
  ctx.save(); ctx.translate(x, y); ctx.rotate(sw)
  ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke()
  if (it.charm === 'pennant') {
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(-16, 18); ctx.lineTo(16, 18); ctx.lineTo(0, 56); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.stroke()
    badge(ctx, it.team, 0, 30, 9, pal, false)
  } else {
    emojiAt(ctx, it.charm === 'ball' ? '⚾' : '⭐', 0, 34, 28)
    badge(ctx, it.team, 10, 44, 8, pal)
  }
  ctx.restore()
}

function drawDoll(ctx: CanvasRenderingContext2D, it: Interior, pal: Pal, x: number, y: number, o: Ov) {
  if (it.doll === 'none') return
  const e = it.doll === 'dog' ? '🐶' : it.doll === 'penguin' ? '🐧' : '🦆'
  // 받침 + 스프링
  ctx.fillStyle = shade(pal.dash, -0.5); ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2
  ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(x + (i % 2 ? 4 : -4), y + 4 - i * 2.4); ctx.stroke()
  // 고개가 까딱
  ctx.save(); ctx.translate(x, y - 12); ctx.rotate(Math.sin(o.wall / 140) * 0.22 + o.steer * -0.3)
  emojiAt(ctx, e, 0, -14, 34)
  // 구단 모자
  ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(0, -28, 15, 10, 0, Math.PI, Math.PI * 2); ctx.fill()
  ctx.fillRect(-2, -29, 20, 3)
  badge(ctx, it.team, 0, -33, 5, pal, false)
  ctx.restore()
}

// 거울: side 0 = 룸미러(뒤 전체), -1 = 왼쪽, 1 = 오른쪽
// 거울 테두리 — 기본(차 안 색) / 크롬 / 구단 줄무늬 / 네온(포인트 색 빛) / 금테(+로고). 룸미러·양쪽 사이드미러에 똑같이
type FrameStyle = { v: string; team: TeamKey | null; pal: Pal; base: string }
function mirror(ctx: CanvasRenderingContext2D, x: number, y: number, mw: number, mh: number, o: Ov, side: -1 | 0 | 1, fs: FrameStyle) {
  const fx = x - 5, fy = y - 5, fw = mw + 10, fh = mh + 10
  const rr = () => { ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, 13) }
  if (fs.v === 'chrome') {
    const g = ctx.createLinearGradient(fx, fy, fx, fy + fh); g.addColorStop(0, '#F8FAFC'); g.addColorStop(0.45, '#94A3B8'); g.addColorStop(0.55, '#CBD5E1'); g.addColorStop(1, '#475569')
    ctx.fillStyle = g; rr(); ctx.fill()
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, mw + 4, mh + 4, 10); ctx.stroke() // 구단 색 가는 테
  } else if (fs.v === 'stripe') {
    ctx.save(); rr(); ctx.clip()
    ctx.fillStyle = fs.pal.main; ctx.fillRect(fx, fy, fw, fh)
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 4
    for (let k = -fh; k < fw; k += 11) { ctx.beginPath(); ctx.moveTo(fx + k, fy + fh); ctx.lineTo(fx + k + fh, fy); ctx.stroke() }
    ctx.restore()
  } else if (fs.v === 'neon') {
    ctx.fillStyle = '#0B0F19'; rr(); ctx.fill()
    ctx.save(); ctx.shadowColor = fs.pal.accent; ctx.shadowBlur = 12 + Math.sin(o.wall / 300) * 4
    ctx.strokeStyle = fs.pal.accent; ctx.lineWidth = 2.5; rr(); ctx.stroke(); ctx.restore()
  } else if (fs.v === 'gold') {
    const g = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh); g.addColorStop(0, '#FDE68A'); g.addColorStop(0.35, '#D4A017'); g.addColorStop(0.6, '#FEF3C7'); g.addColorStop(1, '#A16207')
    ctx.fillStyle = g; rr(); ctx.fill()
  } else { ctx.fillStyle = fs.base; rr(); ctx.fill() }
  const g = ctx.createLinearGradient(0, y, 0, y + mh); g.addColorStop(0, '#BAE6FD'); g.addColorStop(0.5, '#94A3B8'); g.addColorStop(1, '#475569')
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, mw, mh, 9); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, mw, mh, 9); ctx.clip()
  o.karts.forEach((k, i) => {
    if (i === 0) return
    const back = o.me.x - k.x, dy = k.y - o.me.y
    if (back < -30 || back > 420) return
    if (side === -1 && dy > -8) return
    if (side === 1 && dy < 8) return
    const sc = Math.max(0.35, 1 - Math.max(0, back) / 480)
    const px = side === 0 ? x + mw / 2 - dy * 0.5 : x + mw / 2 - side * 20 + side * Math.min(mw / 2 - 14, Math.abs(dy) * 0.2)
    ctx.fillStyle = COLORS[i]
    ctx.beginPath(); ctx.roundRect(px - 10 * sc, y + mh - 10 - 18 * sc, 20 * sc, 13 * sc, 3); ctx.fill()
  })
  // 유리 반사광
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(x + mw * 0.15, y); ctx.lineTo(x + mw * 0.3, y); ctx.lineTo(x + mw * 0.12, y + mh); ctx.lineTo(x - 2, y + mh); ctx.fill()
  ctx.restore()
  if ((fs.v === 'gold' || fs.v === 'stripe') && side === 0) badge(ctx, fs.team, x + mw + 1, y + mh / 2, 11, fs.pal)
}

function gauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, accent: string) {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke()
  const p = Math.min(1, v / V_BOOST)
  ctx.strokeStyle = p > 0.75 ? '#F97316' : accent
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * (1 + p)); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = '900 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(kmh(v)), cx, cy - 4)
  ctx.font = '700 8px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('km/h', cx, cy + 6)
}

// ── 부위 위치(운전석 그림 좌표) — 강조 그리기와 미리보기 클릭 판정이 같이 쓴다 ──
const TOP = H * 0.6
const wheelGeom = (v: string) => (v === 'bus' ? { R: 172, handX: 142, handY: -112 } : { R: 128, handX: 124, handY: -70 })
function handSpots(n: Equip) { const g = wheelGeom(n.wheel.v); return [-1, 1].map(sx => ({ x: W / 2 + sx * g.handX, y: H + 24 + g.handY })) }
function hitSlot(n: Equip, x: number, y: number): SlotKey | null {
  if (x >= W / 2 + 165 && x <= W / 2 + 355 && y >= TOP + 8 && y <= TOP + 112) return 'screen'
  if ((x >= W / 2 - 100 && x <= W / 2 + 100 && y >= 10 && y <= 58) || (y >= TOP - 2 && y <= TOP + 56 && (x <= 166 || x >= W - 166))) return 'frame'
  if (Math.hypot(x - (W / 2 + 70), y - 86) < 34) return 'charm'
  if (Math.hypot(x - (W / 2 + 120), y - (TOP - 40)) < 30) return 'doll'
  if (handSpots(n).some(p => Math.hypot(x - p.x, y - p.y) < 30)) return 'hands'
  const g = wheelGeom(n.wheel.v), d = Math.hypot(x - W / 2, y - (H + 24))
  if (y > TOP - 10 && (Math.abs(d - g.R) < 22 || d < 75)) return 'wheel'
  if (y > TOP - 10 && y <= H) return 'dash'
  return null
}
function drawHighlight(ctx: CanvasRenderingContext2D, n: Equip, k: SlotKey, o: Ov) {
  const a = 0.55 + Math.sin(o.wall / 180) * 0.35
  ctx.save()
  ctx.strokeStyle = `rgba(250,204,21,${a})`; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.shadowColor = 'rgba(250,204,21,0.8)'; ctx.shadowBlur = 10
  ctx.beginPath()
  if (k === 'screen') ctx.roundRect(W / 2 + 163, TOP + 6, 194, 108, 14)
  else if (k === 'charm') ctx.arc(W / 2 + 70, 86, 32, 0, Math.PI * 2)
  else if (k === 'frame') { ctx.roundRect(W / 2 - 104, 7, 208, 56, 15); ctx.roundRect(31, TOP - 5, 138, 64, 15); ctx.roundRect(W - 169, TOP - 5, 138, 64, 15) }
  else if (k === 'doll') ctx.arc(W / 2 + 120, TOP - 38, 28, 0, Math.PI * 2)
  else if (k === 'hands') for (const p of handSpots(n)) { ctx.moveTo(p.x + 28, p.y); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2) }
  else if (k === 'wheel') { const g = wheelGeom(n.wheel.v); ctx.arc(W / 2, H + 24, g.R + 24, Math.PI * 1.02, Math.PI * 1.98) }
  else { ctx.moveTo(4, TOP + 22); ctx.quadraticCurveTo(W / 2, TOP - 52, W - 4, TOP + 22) }
  ctx.stroke()
  ctx.restore()
}

// ── 🔆 전광판: 글씨를 작은 버퍼에 그린 뒤 픽셀마다 LED 점으로 ──
let ledBuf: HTMLCanvasElement | null = null
function drawLed(ctx: CanvasRenderingContext2D, team: TeamKey | null, pal: Pal, dx: number, dy: number, dw: number, dh: number, o: Ov, item: string) {
  // 금속 베젤 + 볼트
  const bz = ctx.createLinearGradient(dx, dy - 8, dx, dy + dh + 8); bz.addColorStop(0, '#4B5563'); bz.addColorStop(0.5, '#1F2937'); bz.addColorStop(1, '#111827')
  ctx.fillStyle = bz; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 8, dw + 16, dh + 16, 10); ctx.fill()
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(dx - 8, dy - 8, dw + 16, dh + 16, 10); ctx.stroke()
  ctx.fillStyle = '#9CA3AF'
  for (const [bx, by] of [[dx - 3, dy - 3], [dx + dw + 3, dy - 3], [dx - 3, dy + dh + 3], [dx + dw + 3, dy + dh + 3]]) { ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#05070A'; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 4); ctx.fill()
  // 점 판
  const P = 3, cellW = 34 // 오른쪽 아이템 칸
  const cols = Math.floor((dw - cellW - 6) / P), rows = Math.floor((dh - 6) / P)
  if (!ledBuf) ledBuf = document.createElement('canvas')
  if (ledBuf.width !== cols || ledBuf.height !== rows) { ledBuf.width = cols; ledBuf.height = rows }
  const b = ledBuf.getContext('2d', { willReadFrequently: true })!
  b.clearRect(0, 0, cols, rows)
  b.textBaseline = 'top'; b.textAlign = 'left'
  // 위 줄: 구단 이름이 흐른다
  b.font = '700 10px Arial, sans-serif'; b.fillStyle = pal.accent
  const msg = `${pal.word} ★ `
  const tw = Math.ceil(b.measureText(msg).width)
  const off = Math.floor(o.wall / 70) % tw
  for (let x = -off; x < cols; x += tw) b.fillText(msg, x, 1)
  // 아래 줄: 순위(호박색)
  b.font = '700 11px Arial, sans-serif'; b.fillStyle = '#FBBF24'
  b.fillText(`${o.rank}등`, 2, 13)
  b.fillStyle = '#F87171'; b.fillText('/6', 2 + Math.ceil(b.measureText(`${o.rank}등`).width) + 2, 13)
  const px = b.getImageData(0, 0, cols, rows).data
  const ox = dx + 3 + P / 2, oy = dy + 3 + P / 2
  // 꺼진 점 한 번에
  ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.beginPath()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (px[(r * cols + c) * 4 + 3] < 110) { ctx.moveTo(ox + c * P + 1.1, oy + r * P); ctx.arc(ox + c * P, oy + r * P, 1.1, 0, Math.PI * 2) }
  ctx.fill()
  // 켜진 점: 번짐 + 알맹이
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = (r * cols + c) * 4
    if (px[i + 3] < 110) continue
    const col = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`
    ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + c * P, oy + r * P, 2.3, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(ox + c * P, oy + r * P, 1.25, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  // 아이템 칸 + 구단 로고(작게)
  const cx = dx + dw - cellW + 2
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 3, dy + 6); ctx.lineTo(cx - 3, dy + dh - 6); ctx.stroke()
  badge(ctx, team, cx + cellW / 2 - 3, dy + 20, 11, pal)
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx + 2, dy + 40, cellW - 10, cellW - 10, 5); ctx.stroke()
  if (item) emojiAt(ctx, item, cx + cellW / 2 - 3, dy + 52, 16)
}
