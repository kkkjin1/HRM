'use client'

// 🐾 호떡 만나기(2026-11-25) — 1인 하루 1번, 2분. 운동장 야구 캐릭터(내 유니폼)로 마당에 들어가 호떡과 논다.
//  · 같은 시간에 들어와 있는 팀원도 보인다(실시간 채널 pet-meet-{날짜}: presence = 누가 있는지, broadcast = 움직임).
//  · 호떡은 마당에 있는 사람 중 애정도가 제일 높은 사람에게 붙어 다닌다. 1등과 비슷한(차이 작은) 사람이 있으면 그 사이를 왔다갔다.
//    → 호떡 행동은 각 화면이 같은 규칙(애정도·시각)으로 계산한다(따로 방송하지 않음).
//  · 그리기: 사람·호떡 위치는 매 프레임 DOM transform만 바꾸고, React 상태는 따라갈 사람·자세가 바뀔 때만 갱신한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import PetDog, { type Pose } from '@/components/pet/PetDog'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import { createClient } from '@/lib/supabase/client'
import { equipFromSlots, NO_EQUIP, type Equip } from '@/lib/baseballGear'
import { DOODLE_PALETTE } from '@/lib/data'
import { useMembers } from '@/lib/useMembers'
import { affectionOf, likesOf, petAct, type PetState } from '@/lib/pet'

const FW = 760 // 마당 크기(논리 px)
const FH = 320
const TOP = 120 // 걸을 수 있는 땅 위쪽 끝(발 위치 y)
const SPEED = 190
const DOG_SPEED = 230
const SIMILAR = (top: number) => Math.max(3, Math.abs(top) * 0.15) // 1등과 이만큼 안쪽이면 '비슷' → 왔다갔다
const SWITCH_MS = 5000
const SEND_MS = 120

type Pos = { x: number; y: number; f: 1 | -1 }
type Other = Pos & { until: number }

const clampX = (x: number) => Math.max(30, Math.min(FW - 30, x))
const clampY = (y: number) => Math.max(TOP, Math.min(FH - 14, y))

export default function PetMeet({ state, nameOf, memberIds, onClose }: { state: PetState; nameOf: (id: string) => string; memberIds: string[]; onClose: () => void }) {
  const pet = state.pet!
  const me = state.me
  const { members } = useMembers()
  const [phase, setPhase] = useState<'loading' | 'in' | 'over' | 'error'>('loading')
  const [err, setErr] = useState<string | null>(null)
  const [until, setUntil] = useState(0)
  const [left, setLeft] = useState(120)
  const [equips, setEquips] = useState<Map<string, Equip>>(new Map())
  const [present, setPresent] = useState<string[]>([]) // 나 말고 들어와 있는 사람
  const [dogView, setDogView] = useState<{ target: string | null; pose: Pose; mode: 'stick' | 'swing' | 'alone'; group: string[] }>({ target: null, pose: 'stand', mode: 'alone', group: [] })

  const myPos = useRef<Pos>({ x: 200 + (me.charCodeAt(0) % 12) * 10, y: 230, f: 1 }) // 시작 자리는 사람마다 조금씩 다르게
  const others = useRef(new Map<string, Other>())
  const dog = useRef({ x: FW / 2, y: 260, f: 1 as 1 | -1 })
  const keys = useRef(new Set<string>())
  const goal = useRef<{ x: number; y: number } | null>(null) // 탭·클릭한 곳
  const els = useRef(new Map<string, HTMLDivElement>())
  const dogEl = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const aff = useMemo(() => affectionOf(state, memberIds), [state, memberIds])
  const affRef = useRef(aff)
  useEffect(() => { affRef.current = aff }, [aff])

  // 들어가기 — 하루 1번(2분 안이면 다시 들어올 수 있음)
  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await petAct('meet')
      if (!alive) return
      if (!r.ok) { setErr(r.error); setPhase('error'); return }
      setUntil(Date.parse(r.until as string))
      setPhase('in')
    })()
    void createClient().from('baseball_equip').select('member_id, slots').then(({ data }) => {
      if (!alive) return
      setEquips(new Map(((data ?? []) as { member_id: string; slots: unknown }[]).map(r => [r.member_id, equipFromSlots(r.slots)])))
    })
    return () => { alive = false }
  }, [])

  // 마당 폭에 맞춰 줄이기
  useEffect(() => {
    const el = fieldRef.current?.parentElement
    if (!el) return
    const fit = () => setScale(Math.min(1, el.clientWidth / FW))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // 남은 시간
  useEffect(() => {
    if (phase !== 'in') return
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(s)
      if (s <= 0) setPhase('over')
    }, 250)
    return () => clearInterval(id)
  }, [phase, until])

  // 실시간: 누가 있는지 + 움직임
  const sendRef = useRef<(p: Pos) => void>(() => {})
  useEffect(() => {
    if (phase !== 'in') return
    const supabase = createClient()
    const ch = supabase.channel(`pet-meet-${state.today}`, { config: { presence: { key: me }, broadcast: { self: false } } })
    const sync = () => {
      const st = ch.presenceState() as Record<string, { until?: number; x?: number; y?: number }[]>
      const now = Date.now()
      const ids: string[] = []
      for (const [id, metas] of Object.entries(st)) {
        if (id === me) continue
        const m = metas[metas.length - 1]
        if (!m?.until || m.until <= now) continue
        ids.push(id)
        if (!others.current.has(id)) others.current.set(id, { x: m.x ?? 400, y: m.y ?? 230, f: 1, until: m.until })
        else others.current.get(id)!.until = m.until
      }
      for (const id of [...others.current.keys()]) if (!ids.includes(id)) others.current.delete(id)
      setPresent(ids)
    }
    ch.on('presence', { event: 'sync' }, sync)
      .on('broadcast', { event: 'mv' }, ({ payload }) => {
        const p = payload as { id: string; x: number; y: number; f: 1 | -1 }
        const o = others.current.get(p.id)
        if (o) { o.x = p.x; o.y = p.y; o.f = p.f }
      })
      .subscribe(st => { if (st === 'SUBSCRIBED') void ch.track({ until, x: myPos.current.x, y: myPos.current.y }) })
    let last = 0
    sendRef.current = (p: Pos) => {
      const now = Date.now()
      if (now - last < SEND_MS) return
      last = now
      void ch.send({ type: 'broadcast', event: 'mv', payload: { id: me, x: Math.round(p.x), y: Math.round(p.y), f: p.f } })
    }
    // 2분 지난 사람은 presence가 남아 있어도 뺀다
    const sweep = setInterval(sync, 2000)
    return () => { clearInterval(sweep); sendRef.current = () => {}; void ch.untrack(); void supabase.removeChannel(ch) }
  }, [phase, until, me, state.today])

  // 키보드
  useEffect(() => {
    if (phase !== 'in') return
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') { onClose(); return }
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) { e.preventDefault(); keys.current.add(k); goal.current = null }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [phase, onClose])

  // 프레임 루프: 내 이동 · 호떡 따라가기 · DOM 위치
  useEffect(() => {
    if (phase !== 'in') return
    let raf = 0
    let last = performance.now()
    let shown = ''
    const place = (el: HTMLElement | null | undefined, x: number, y: number, f: 1 | -1) => {
      if (!el) return
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      const inner = el.firstElementChild as HTMLElement | null
      if (inner) inner.style.transform = `scaleX(${f})`
      el.style.zIndex = String(Math.round(y))
    }
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      // 나
      const k = keys.current
      let dx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0)
      let dy = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0)
      const g = goal.current
      if (!dx && !dy && g) {
        const gx = g.x - myPos.current.x, gy = g.y - myPos.current.y
        const d = Math.hypot(gx, gy)
        if (d < 4) goal.current = null
        else { dx = gx / d; dy = gy / d }
      }
      if (dx || dy) {
        const n = Math.hypot(dx, dy) || 1
        const p = myPos.current
        p.x = clampX(p.x + (dx / n) * SPEED * dt)
        p.y = clampY(p.y + (dy / n) * SPEED * 0.7 * dt)
        if (dx) p.f = dx > 0 ? 1 : -1
        sendRef.current(p)
      }
      // 호떡: 있는 사람 중 애정도 1등에게. 1등과 비슷한 사람들이면 SWITCH_MS마다 번갈아
      const now = Date.now()
      const here = [me, ...[...others.current.entries()].filter(([, o]) => o.until > now).map(([id]) => id)]
      const aff = affRef.current
      const sorted = [...here].sort((a, b) => (aff.get(b) ?? 0) - (aff.get(a) ?? 0) || a.localeCompare(b))
      const top = aff.get(sorted[0]) ?? 0
      const group = sorted.filter(id => top - (aff.get(id) ?? 0) <= SIMILAR(top))
      const target = group.length > 1 ? group[Math.floor(now / SWITCH_MS) % group.length] : sorted[0]
      const tp = target === me ? myPos.current : others.current.get(target)
      const d0 = dog.current
      let pose: Pose = 'sit'
      if (tp) {
        const side = d0.x <= tp.x ? -1 : 1 // 사람의 가까운 쪽 옆에
        const tx = clampX(tp.x + side * 46), ty = clampY(tp.y + 4)
        const ddx = tx - d0.x, ddy = ty - d0.y
        const dd = Math.hypot(ddx, ddy)
        if (dd > 6) {
          const step = Math.min(dd, DOG_SPEED * dt)
          d0.x += (ddx / dd) * step; d0.y += (ddy / dd) * step
          if (Math.abs(ddx) > 2) d0.f = ddx > 0 ? 1 : -1
          pose = 'walk'
        } else { d0.f = tp.x >= d0.x ? 1 : -1; pose = Math.floor(now / 1800) % 3 === 0 ? 'jump' : 'sit' }
      }
      const mode: 'stick' | 'swing' | 'alone' = here.length === 1 ? 'alone' : group.length > 1 ? 'swing' : 'stick'
      const key = `${target}|${pose}|${mode}|${group.join(',')}`
      if (key !== shown) { shown = key; setDogView({ target, pose, mode, group }) }
      place(els.current.get(me), myPos.current.x, myPos.current.y, myPos.current.f)
      for (const [id, o] of others.current) place(els.current.get(id), o.x, o.y, o.f)
      place(dogEl.current, d0.x, d0.y, d0.f)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, me])

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const look = (id: string) => ({ equip: equips.get(id) ?? NO_EQUIP, palette: DOODLE_PALETTE[(memberMap.get(id)?.color_key ?? 0) % 8] })
  const { best, worst } = likesOf(state, memberIds)
  const people = [me, ...present]

  const onFieldDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    goal.current = { x: clampX((e.clientX - r.left) / scale), y: clampY((e.clientY - r.top) / scale) }
  }

  const status = dogView.mode === 'alone' ? `${pet.name}가 나만 졸졸 따라와요 🐾`
    : dogView.mode === 'swing' ? `${dogView.group.map(nameOf).join(' · ')} — 다 좋아서 왔다갔다 🔁`
    : `${dogView.target === me ? '나' : nameOf(dogView.target ?? '')}한테 딱 붙어 있어요 💛`

  return (
    <div className="fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[800px] p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[15px] font-bold text-[#1F1F1D]">🐾 {pet.name} 만나기 <span className="text-[12px] font-medium text-[#9C9C96]">하루 1번 · 2분</span></p>
          <span className="flex items-center gap-2">
            {phase === 'in' && <span className={`text-[13px] font-bold tabular-nums ${left <= 15 ? 'text-[#E0605A]' : 'text-[#6B5B3E]'}`}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
            <button onClick={onClose} className="text-[12px] px-2.5 py-1 rounded-full border border-[#E8E8E4] hover:bg-[#F7F7F5]">닫기</button>
          </span>
        </div>
        <p className="mb-2 text-[12px] text-[#6B6B66]">
          {best && <>💛 제일 좋아하는 사람 <b className="text-[#C27A2C]">{nameOf(best)}</b></>}
          {best && worst && ' · '}
          {worst && <>💢 제일 서운한 사람 <b>{nameOf(worst)}</b></>}
          {!best && !worst && '아직 다 비슷하게 좋아해요'}
        </p>
        {phase === 'loading' && <div className="h-[320px] rounded-xl bg-[#F4F4F1] animate-pulse" />}
        {phase === 'error' && <div className="h-[200px] rounded-xl bg-[#F7F7F5] flex items-center justify-center text-[13px] text-[#8A6A3A]">{err}</div>}
        {(phase === 'in' || phase === 'over') && (
          <div className="relative w-full overflow-hidden rounded-xl" style={{ height: FH * scale }}>
            <div ref={fieldRef} onPointerDown={phase === 'in' ? onFieldDown : undefined}
              className="absolute left-0 top-0 origin-top-left select-none touch-none"
              style={{ width: FW, height: FH, transform: `scale(${scale})`, background: 'linear-gradient(#EAF4FF 0 34%, #CDEBB8 34% 100%)' }}>
              <span className="absolute left-[8%] top-4 text-[26px] opacity-60" aria-hidden>☁️</span>
              <span className="absolute left-[62%] top-8 text-[18px] opacity-45" aria-hidden>☁️</span>
              <span className="absolute left-3 text-[46px]" style={{ top: TOP - 74 }} aria-hidden>🌳</span>
              <span className="absolute right-4 text-[40px]" style={{ top: TOP - 64 }} aria-hidden>🏡</span>
              {['🌼', '🌷', '🌼', '🌸', '🌷'].map((f, i) => <span key={i} className="absolute text-[13px] opacity-80" style={{ left: 90 + i * 140, top: TOP + 30 + (i % 2) * 120 }} aria-hidden>{f}</span>)}
              {people.map(id => {
                const l = look(id)
                return (
                  <div key={id} ref={el => { if (el) els.current.set(id, el); else els.current.delete(id) }} className="absolute left-0 top-0 will-change-transform" style={{ marginLeft: -24, marginTop: -64 }}>
                    <div><CharacterSprite equip={l.equip} name={nameOf(id)} size={48} colorBg={l.palette.bg} colorFg={l.palette.fg} /></div>
                    <span className={`absolute left-1/2 -translate-x-1/2 -top-4 whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-bold ${id === me ? 'bg-[#E0A526] text-white' : 'bg-white/90 text-[#1F2933]'}`}>
                      {id === me ? '나' : nameOf(id)} <span className="font-medium opacity-80">❤{aff.get(id) ?? 0}</span>
                    </span>
                    {dogView.target === id && <span className="absolute -right-2 top-0 text-[14px]" aria-hidden>💛</span>}
                  </div>
                )
              })}
              <div ref={dogEl} className="absolute left-0 top-0 will-change-transform" style={{ marginLeft: -40, marginTop: -66, width: 80, zIndex: 999 }}>
                <div><PetDog breed="shiba" age={Math.max(1, pet.age)} mood={dogView.mode === 'alone' || dogView.target === me ? 'happy' : 'normal'} pose={dogView.pose} outfit={pet.outfit as never} /></div>
              </div>
              {phase === 'over' && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/35">
                  <div className="rounded-2xl bg-white px-6 py-4 text-center shadow-xl">
                    <p className="text-[16px] font-bold">⏰ 2분 끝!</p>
                    <p className="mt-1 text-[13px] text-[#6B6B66]">{pet.name}: 내일 또 놀아 줘요 멍 🐾</p>
                    <button onClick={onClose} className="mt-3 rounded-full bg-[#F0A24A] px-4 py-1.5 text-[13px] font-semibold text-white">닫기</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-[12px] text-[#6B5B3E]">{phase === 'in' ? status : ' '}</p>
        <p className="text-[11px] text-[#9C9C96]">←→↑↓(WASD)로 걷거나 마당을 눌러 이동 · 같이 들어온 사람 중 애정도 높은 사람에게 붙어요 · 비슷하면 왔다갔다</p>
      </div>
    </div>
  )
}
