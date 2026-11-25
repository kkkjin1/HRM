'use client'

// 🐾 호떡 만나기(2026-11-25) — 1인 하루 1번, 3분. 운동장 야구 캐릭터(내 유니폼)로 마당에 들어가 호떡과 논다.
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
const FAKE_GO = 1600 // 서운한 사람: 가다가(ms)
const FAKE_HUFF = 900 //  "흥" 멈춤
const FAKE_MS = 3600 //  돌아서 1등에게 가기까지 합
const MEET_MS = 180_000 // 3분

// 한 바퀴 일정: 애정도 높은 순으로 들르고, 많이 좋아할수록 오래(4~14초, 다 같으면 6초). 서운한 사람은 맨 끝에 '가다가 돌아서기'.
function visitPlan(sorted: string[], sulky: string | null, aff: Map<string, number>) {
  const real = sorted.filter(id => id !== sulky)
  const vals = real.map(id => aff.get(id) ?? 0)
  const hi = Math.max(...vals), lo = Math.min(...vals)
  const plan: { id: string; ms: number; fake: boolean }[] = real.map((id, i) => ({ id, ms: hi === lo ? 6000 : Math.round(4000 + 10000 * (vals[i] - lo) / (hi - lo)), fake: false }))
  if (sulky) plan.push({ id: sulky, ms: FAKE_MS, fake: true })
  return plan
}
const SEND_MS = 120

type Pos = { x: number; y: number; f: 1 | -1 }
type Other = Pos & { until: number }

const clampX = (x: number) => Math.max(30, Math.min(FW - 30, x))
const clampY = (y: number) => Math.max(TOP, Math.min(FH - 14, y))

export default function PetMeet({ state, nameOf, memberIds, onClose, demo }: { state: PetState; nameOf: (id: string) => string; memberIds: string[]; onClose: () => void; demo?: string[] }) {
  const pet = state.pet!
  const me = state.me
  const { members } = useMembers()
  const [phase, setPhase] = useState<'loading' | 'in' | 'over' | 'error'>('loading')
  const [err, setErr] = useState<string | null>(null)
  const [until, setUntil] = useState(0)
  const [left, setLeft] = useState(MEET_MS / 1000)
  const [equips, setEquips] = useState<Map<string, Equip>>(new Map())
  const [present, setPresent] = useState<string[]>([]) // 나 말고 들어와 있는 사람
  const [dogView, setDogView] = useState<{ target: string | null; visit: string | null; pose: Pose; mode: 'alone' | 'visit' | 'fake'; fake: 'go' | 'huff' | 'back' | null; secs: number }>({ target: null, visit: null, pose: 'stand', mode: 'alone', fake: null, secs: 0 })

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
  const worst = useMemo(() => likesOf(state, memberIds).worst, [state, memberIds])
  const worstRef = useRef(worst)
  useEffect(() => { worstRef.current = worst }, [worst])

  // 들어가기 — 하루 1번(3분 안이면 다시 들어올 수 있음)
  useEffect(() => {
    let alive = true
    if (demo) { // 목업: 서버·채널 없이 다른 사람을 가짜로 넣는다
      const t = Date.now() + MEET_MS
      demo.forEach((id, i) => others.current.set(id, { x: 420 + i * 90, y: 200 + i * 30, f: -1, until: t }))
      queueMicrotask(() => { setUntil(t); setPresent(demo); setPhase('in') })
      return () => { alive = false }
    }
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
  }, [demo])

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
    if (phase !== 'in' || demo) return
    const supabase = createClient()
    const topic = `pet-meet-${state.today}`
    let dead = false
    let ch: ReturnType<typeof supabase.channel> | null = null
    let sweep: ReturnType<typeof setInterval> | null = null
    // 닫았다 바로 다시 열면 같은 이름의 예전 채널이 아직 정리 중일 수 있다 → 그대로 받으면 구독 뒤라 콜백이 안 붙어 화면이 멈춘다(새로고침해야 뜸).
    // 예전 채널을 다 치운 뒤에 새로 만든다.
    void (async () => {
      for (const old of supabase.getChannels()) if (old.topic === `realtime:${topic}`) await supabase.removeChannel(old)
      if (dead) return
      const c = supabase.channel(topic, { config: { presence: { key: me }, broadcast: { self: false } } })
      ch = c
      const sync = () => {
        const st = c.presenceState() as Record<string, { until?: number; x?: number; y?: number }[]>
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
      c.on('presence', { event: 'sync' }, sync)
        .on('broadcast', { event: 'mv' }, ({ payload }) => {
          const p = payload as { id: string; x: number; y: number; f: 1 | -1 }
          const o = others.current.get(p.id)
          if (o) { o.x = p.x; o.y = p.y; o.f = p.f }
        })
        .subscribe(st => { if (st === 'SUBSCRIBED') void c.track({ until, x: myPos.current.x, y: myPos.current.y }) })
      let last = 0
      sendRef.current = (p: Pos) => {
        const now = Date.now()
        if (now - last < SEND_MS) return
        last = now
        void c.send({ type: 'broadcast', event: 'mv', payload: { id: me, x: Math.round(p.x), y: Math.round(p.y), f: p.f } })
      }
      // 3분 지난 사람은 presence가 남아 있어도 뺀다
      sweep = setInterval(sync, 2000)
    })()
    return () => {
      dead = true
      if (sweep) clearInterval(sweep)
      sendRef.current = () => {}
      if (ch) { const c = ch; void c.untrack(); void supabase.removeChannel(c) }
    }
  }, [phase, until, me, state.today, demo])

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
      // 호떡: 있는 사람을 애정도 순으로 한 바퀴씩 돈다(좋아할수록 오래 머묾). 제일 서운한 사람에겐 가다가 "흥" 하고 돌아선다.
      //  → 순서·시간은 모두 같은 규칙 + 시계로 정해서 각 화면이 따로 계산해도 거의 같게 보인다.
      const now = Date.now()
      const here = [me, ...[...others.current.entries()].filter(([, o]) => o.until > now).map(([id]) => id)]
      const aff = affRef.current
      const sorted = [...here].sort((a, b) => (aff.get(b) ?? 0) - (aff.get(a) ?? 0) || a.localeCompare(b))
      const top = sorted[0]
      const sulky = sorted.length > 1 && worstRef.current && sorted.includes(worstRef.current) && worstRef.current !== top ? worstRef.current : null
      const plan = visitPlan(sorted, sulky, aff)
      const cycle = plan.reduce((a, v) => a + v.ms, 0)
      let at = now % cycle, seg = plan[0]
      for (const v of plan) { if (at < v.ms) { seg = v; break } at -= v.ms }
      let target = seg.id
      let fake: 'go' | 'huff' | 'back' | null = null
      let stopShort = 0
      if (seg.fake) {
        fake = at < FAKE_GO ? 'go' : at < FAKE_GO + FAKE_HUFF ? 'huff' : 'back'
        if (fake === 'back') target = top
        else stopShort = 120 // 다 가지 않고 중간쯤에서 멈춤
      }
      const tp = target === me ? myPos.current : others.current.get(target)
      const d0 = dog.current
      let pose: Pose = 'sit'
      if (tp) {
        const side = d0.x <= tp.x ? -1 : 1 // 사람의 가까운 쪽 옆에
        const tx = clampX(tp.x + side * (46 + stopShort)), ty = clampY(tp.y + 4)
        const ddx = tx - d0.x, ddy = ty - d0.y
        const dd = Math.hypot(ddx, ddy)
        if (fake === 'huff') { d0.f = tp.x >= d0.x ? -1 : 1; pose = 'stand' } // 고개 홱 돌림
        else if (dd > 6) {
          const step = Math.min(dd, DOG_SPEED * (fake ? 1.25 : 1) * dt)
          d0.x += (ddx / dd) * step; d0.y += (ddy / dd) * step
          if (Math.abs(ddx) > 2) d0.f = ddx > 0 ? 1 : -1
          pose = 'walk'
        } else if (fake === 'go') { pose = 'sniff' }
        else { d0.f = tp.x >= d0.x ? 1 : -1; pose = Math.floor(now / 1800) % 3 === 0 ? 'jump' : 'sit' }
      }
      const mode: 'alone' | 'visit' | 'fake' = here.length === 1 ? 'alone' : seg.fake ? 'fake' : 'visit'
      const secs = seg.fake ? 0 : Math.max(1, Math.ceil((seg.ms - at) / 1000))
      const key = `${seg.id}|${target}|${pose}|${mode}|${fake}|${secs}`
      if (key !== shown) { shown = key; setDogView({ target, visit: seg.id, pose, mode, fake, secs }) }
      place(els.current.get(me), myPos.current.x, myPos.current.y, myPos.current.f)
      for (const [id, o] of others.current) place(els.current.get(id), o.x, o.y, o.f)
      place(dogEl.current, d0.x, d0.y, d0.f)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, me])

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const look = (id: string) => ({ equip: equips.get(id) ?? NO_EQUIP, palette: DOODLE_PALETTE[(memberMap.get(id)?.color_key ?? 0) % 8] })
  const { best } = likesOf(state, memberIds)
  const people = [me, ...present]

  const onFieldDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    goal.current = { x: clampX((e.clientX - r.left) / scale), y: clampY((e.clientY - r.top) / scale) }
  }

  const who = (id: string | null) => (id === me ? '나' : nameOf(id ?? ''))
  const status = dogView.mode === 'alone' ? `${pet.name}가 나만 졸졸 따라와요 🐾`
    : dogView.mode === 'fake' ? (dogView.fake === 'go' ? `${who(dogView.visit)}한테 가는 줄 알았는데…` : dogView.fake === 'huff' ? `흥! ${who(dogView.visit)}한테 아직 서운하대요 💨` : `…홱 돌아서 가 버렸어요 💢`)
    : `${who(dogView.visit)}한테 놀러 왔어요 💛 (${dogView.secs}초 더)`

  return (
    <div className="fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[800px] p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[15px] font-bold text-[#1F1F1D]">🐾 {pet.name} 만나기 <span className="text-[12px] font-medium text-[#9C9C96]">하루 1번 · 3분</span></p>
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
                    {dogView.mode !== 'fake' && dogView.target === id && <span className="absolute -right-2 top-0 text-[14px]" aria-hidden>💛</span>}
                    {dogView.mode === 'fake' && dogView.fake !== 'go' && dogView.visit === id && <span className="absolute -right-3 top-0 text-[14px]" aria-hidden>💔</span>}
                  </div>
                )
              })}
              <div ref={dogEl} className="absolute left-0 top-0 will-change-transform" style={{ marginLeft: -40, marginTop: -66, width: 80, zIndex: 999 }}>
                <div><PetDog breed="shiba" age={Math.max(1, pet.age)} mood={dogView.fake === 'huff' ? 'sad' : dogView.mode === 'alone' || dogView.target === me ? 'happy' : 'normal'} pose={dogView.pose} outfit={pet.outfit as never} /></div>
                {dogView.fake === 'huff' && <span className="absolute left-1/2 -translate-x-1/2 -top-5 whitespace-nowrap rounded-full bg-white px-2 text-[12px] font-bold text-[#D9473F] shadow">흥! 💨</span>}
              </div>
              {phase === 'over' && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/35">
                  <div className="rounded-2xl bg-white px-6 py-4 text-center shadow-xl">
                    <p className="text-[16px] font-bold">⏰ 3분 끝!</p>
                    <p className="mt-1 text-[13px] text-[#6B6B66]">{pet.name}: 내일 또 놀아 줘요 멍 🐾</p>
                    <button onClick={onClose} className="mt-3 rounded-full bg-[#F0A24A] px-4 py-1.5 text-[13px] font-semibold text-white">닫기</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-[12px] text-[#6B5B3E]">{phase === 'in' ? status : ' '}</p>
        <p className="text-[11px] text-[#9C9C96]">←→↑↓(WASD)로 걷거나 마당을 눌러 이동 · 같이 들어온 사람을 한 명씩 들러요 — 친할수록 오래 · 제일 서운한 사람한텐 가다가 홱</p>
      </div>
    </div>
  )
}
