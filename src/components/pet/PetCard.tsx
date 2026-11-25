'use client'

// 🐶 홈 2행 3칸 — 팀 강아지(호떡). 박스 안 마당을 돌아다니고, 밥·똥은 팀 공용, 간식·놀기·쓰담·산책은 사람마다.
// 가볍게: 그림은 SVG 한 장, 걷기·꼬리는 CSS(transform)만. 다음 행동은 2~5초에 한 번만 정하고,
// 박스가 화면 밖이거나 탭이 숨으면 멈춘다. 상태는 lib/pet 의 공용 저장소(실시간 1채널)를 쓴다.
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PetDog, { type Mood, type Outfit, type Pose } from '@/components/pet/PetDog'
import { useMembers } from '@/lib/useMembers'
import { displayName } from '@/lib/members'
import {
  LIMITS, SEARCH_GOAL, SHOP, hhmm, unlockLeft, walkLeft, SLOT_LABEL, kstHour, learnedTricks, openMealSlot, petAct, reloadPet, stageOf, usePet,
  type PetState, type ShopKey, type ToyKey, type TrickKey,
} from '@/lib/pet'

const PetWalkGame = dynamic(() => import('@/components/pet/PetWalkGame'), { ssr: false })
const PetRoom = dynamic(() => import('@/components/pet/PetRoom'), { ssr: false })
const PetShop = dynamic(() => import('@/components/pet/PetShop'), { ssr: false })

type Float = { id: number; text: string }

function useWander(boxRef: React.RefObject<HTMLDivElement | null>, dogW: number, still: boolean, hasHouse: boolean) {
  const [st, setSt] = useState<{ x: number; dir: 1 | -1; pose: Pose; ms: number }>({ x: 60, dir: 1, pose: 'stand', ms: 0 })
  const posRef = useRef(st) // 위치는 step 안에서만 바뀐다
  useEffect(() => {
    const box = boxRef.current
    if (!box || still) return
    // 다음 행동 타이머는 언제나 하나만. (예전엔 타이머를 setState 갱신 함수 안에서 걸어서, 렌더 전엔 비어 보였다 →
    // 탭 복귀 때 '보임' 신호가 겹치면 행동 줄이 여러 개로 불어나 호떡이 폭주했다.)
    let timer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    let visible = true
    let restNext = false // 집 앞에 도착했으면 다음 행동은 집에서 쉬기
    const schedule = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(step, ms) }
    const resume = () => { if (alive && !timer && visible && !document.hidden) schedule(400) }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume() })
    io.observe(box)
    const onVis = () => resume()
    document.addEventListener('visibilitychange', onVis)
    function step() {
      timer = null
      if (!alive || document.hidden || !visible) return // 안 보이면 다음 행동을 정하지 않는다(멈춤)
      const W = Math.max(0, box!.clientWidth - dogW)
      const s = posRef.current
      const r = Math.random()
      if (restNext) {
        restNext = false
        const next = { ...s, dir: 1 as const, pose: 'sleep' as Pose, ms: 0 }
        posRef.current = next
        setSt(next)
        schedule(6000 + Math.random() * 4000)
        return
      }
      // 집이 있으면 가끔(15%) 오른쪽 끝 집으로 걸어가 들어가서 쉰다
      if (hasHouse && W > 0 && r < 0.15) {
        const ms = (Math.abs(W - s.x) / 45) * 1000
        const next = { x: W, dir: 1 as const, pose: 'walk' as Pose, ms }
        posRef.current = next
        setSt(next)
        restNext = true
        schedule(ms + 250)
        return
      }
      if (r < 0.5 && W > 0) {
        const nx = Math.max(0, Math.min(W, s.x + (Math.random() * 0.7 + 0.2) * W * (Math.random() < 0.5 ? -1 : 1)))
        const ms = (Math.abs(nx - s.x) / 45) * 1000
        const next = { x: nx, dir: (nx >= s.x ? 1 : -1) as 1 | -1, pose: 'walk' as Pose, ms }
        posRef.current = next
        setSt(next)
        schedule(ms + 250)
        return
      }
      const pose: Pose = r < 0.72 ? 'sit' : r < 0.88 ? 'sniff' : 'stand'
      const next = { ...s, pose, ms: 0 }
      posRef.current = next
      setSt(next)
      schedule(1800 + Math.random() * 2600)
    }
    schedule(500)
    return () => { alive = false; if (timer) clearTimeout(timer); io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [boxRef, dogW, still, hasHouse])
  return st
}

const TRICK_POSE: Record<TrickKey, { pose: Pose; cls?: string; outfit?: Outfit }> = {
  sit: { pose: 'sit' }, paw: { pose: 'paw' }, down: { pose: 'down' }, bang: { pose: 'stand', cls: 'pet-trick-bang' },
  spin: { pose: 'stand', cls: 'pet-trick-spin' }, highfive: { pose: 'jump' }, fetch: { pose: 'stand', outfit: 'badge' },
}

// 🧸 장난감 연출 — 장난감마다 3가지, 날짜마다 돌아가며 다른 걸 보여 준다(어제와 오늘이 다름)
type ToyFx = { say: string; pose: Pose; dogCls?: string; toyCls: string; toyStyle: React.CSSProperties; zzz?: boolean }
const TOY_FX: Record<ToyKey, ToyFx[]> = {
  ball: [
    { say: '공 쫓아 달려가기!', pose: 'walk', dogCls: 'pet-fx-dash-dog', toyCls: 'pet-fx-roll', toyStyle: { left: '78%', bottom: 4 } },
    { say: '헤딩! 헤딩!', pose: 'jump', toyCls: 'pet-fx-header', toyStyle: { left: '62%', top: -6 } },
    { say: '통통 드리블~', pose: 'walk', toyCls: 'pet-fx-bounce', toyStyle: { left: '86%', bottom: 4 } },
  ],
  rope: [
    { say: '영차영차 줄다리기', pose: 'stand', dogCls: 'pet-fx-tug', toyCls: 'pet-fx-tug', toyStyle: { left: '90%', top: '40%' } },
    { say: '물고 붕붕 흔들기', pose: 'sit', toyCls: 'pet-fx-wiggle', toyStyle: { left: '78%', top: '30%' } },
    { say: '밧줄 빙글빙글~', pose: 'stand', dogCls: 'pet-trick-spin', toyCls: 'pet-fx-orbit', toyStyle: { left: '42%', top: '35%' } },
  ],
  duck: [
    { say: '삑! 삑! 삑!', pose: 'paw', toyCls: 'pet-fx-squish', toyStyle: { left: '82%', bottom: 4 } },
    { say: '던지면 물어오기', pose: 'walk', dogCls: 'pet-fx-fetch-dog', toyCls: 'pet-fx-fly', toyStyle: { left: '80%', bottom: 10 } },
    { say: '위로 던지고 받기!', pose: 'jump', toyCls: 'pet-fx-toss', toyStyle: { left: '70%', top: 0 } },
  ],
  bear: [
    { say: '곰인형 껴안고 낮잠', pose: 'sleep', toyCls: '', toyStyle: { left: '70%', bottom: 2 }, zzz: true },
    { say: '곰인형 베개 삼아 쿨쿨', pose: 'down', toyCls: '', toyStyle: { left: '-6%', bottom: 2 }, zzz: true },
    { say: '곰인형이랑 춤추기', pose: 'jump', toyCls: 'pet-fx-sway', toyStyle: { left: '80%', bottom: 8 } },
  ],
}
const TOY_ORDER: ToyKey[] = ['ball', 'rope', 'duck', 'bear']
const toyFxOf = (toy: ToyKey, today: string) => {
  const day = Math.floor(Date.parse(today) / 86_400_000)
  const list = TOY_FX[toy]
  return list[(day + TOY_ORDER.indexOf(toy)) % list.length]
}

export default function PetCard() {
  const { state: s, loaded, error } = usePet()
  const { members } = useMembers()
  const [walkOpen, setWalkOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)

  if (!loaded) return <Shell><div className="flex-1 rounded-xl bg-[#F4F4F1] animate-pulse" /></Shell>
  if (error && !s) return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[12.5px] text-[#9C9C96]">
        강아지 소식을 불러오지 못했어요
        <button onClick={() => void reloadPet()} className="text-[12px] px-3 py-1 rounded-full border border-[#E8E8E4] hover:bg-[#F7F7F5]">다시 시도</button>
      </div>
    </Shell>
  )
  if (!s?.pet) return <Shell><div className="flex-1 flex items-center justify-center text-[12.5px] text-[#9C9C96]">곧 새 친구가 와요 🐾</div></Shell>

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '누군가'
  return (
    <>
      <Live s={s} nameOf={nameOf} onWalk={() => setWalkOpen(true)} onRoom={() => setRoomOpen(true)} onShop={() => setShopOpen(true)} />
      {walkOpen && <PetWalkGame state={s} onClose={() => setWalkOpen(false)} />}
      {roomOpen && <PetRoom state={s} nameOf={nameOf} onClose={() => setRoomOpen(false)} />}
      {shopOpen && <PetShop state={s} nameOf={nameOf} onClose={() => setShopOpen(false)} />}
    </>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 w-full h-full flex flex-col" style={{ minHeight: 300 }}>
      <p className="text-[14px] font-semibold text-[#1F1F1D] mb-2">🐶 팀 강아지</p>
      {children}
    </div>
  )
}

function Live({ s, nameOf, onWalk, onRoom, onShop }: { s: PetState; nameOf: (id: string) => string; onWalk: () => void; onRoom: () => void; onShop: () => void }) {
  const pet = s.pet!
  const age = Math.max(1, pet.age)
  const st = stageOf(age)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const dogW = 112 + 52 * Math.min(1, age / 30)
  const hour = kstHour(s.now)
  const sleeping = pet.status === 'active' && (!s.workday || hour < 9 || hour >= 19)
  const [react, setReact] = useState<{ mood: Mood; pose?: Pose; until: number } | null>(null)
  const [trick, setTrick] = useState<TrickKey | null>(null)
  const [floats, setFloats] = useState<Float[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const floatId = useRef(0)
  const [toyPick, setToyPick] = useState(false)
  const [playing, setPlaying] = useState<{ toy: ToyKey; fx: ToyFx } | null>(null)
  const ownedSet = new Set<ShopKey>(s.items.map(i => i.item))
  const hasHouse = SHOP.some(x => x.house && ownedSet.has(x.key))
  const w = useWander(boxRef, dogW, sleeping || pet.status === 'runaway' || !!trick || !!playing, hasHouse)
  const open = openMealSlot(s)
  const fedNow = !!open && open.feeders.includes(s.me)
  const tricks = useMemo(() => learnedTricks(s.train_total), [s.train_total])

  // 승진(성장 단계) 알림 — 사람마다 한 번. 처음 본 직급을 기억해 두고, 지금 직급과 다르면 띄운다.
  const rankKey = `hrm_pet_rank_${pet.id}`
  const [seenRank] = useState<string | null>(() => { try { return localStorage.getItem(rankKey) } catch { return null } })
  const [promoClosed, setPromoClosed] = useState(false)
  const promo = !promoClosed && seenRank && seenRank !== st.rank ? `🎉 ${pet.name}이(가) ${st.rank}(으)로 승진했어요! (${st.stage})` : null
  useEffect(() => { try { localStorage.setItem(rankKey, st.rank) } catch { /* 저장소 없음 — 알림만 생략 */ } }, [rankKey, st.rank])

  // 배운 개인기를 가끔 저절로(약 25초마다 40%)
  useEffect(() => {
    if (!tricks.length || sleeping || pet.status !== 'active') return
    const id = setInterval(() => {
      if (document.hidden || Math.random() > 0.4) return
      const t = tricks[Math.floor(Math.random() * tricks.length)]
      setTrick(t.key)
      setTimeout(() => setTrick(null), 2600)
    }, 25_000)
    return () => clearInterval(id)
  }, [tricks, sleeping, pet.status])

  const flash = useCallback((mood: Mood, pose?: Pose) => setReact({ mood, pose, until: Date.now() + 1700 }), [])
  useEffect(() => {
    if (!react) return
    const t = setTimeout(() => setReact(null), Math.max(0, react.until - Date.now()))
    return () => clearTimeout(t)
  }, [react])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const run = async (kind: string, slot: string | null = null, mood: Mood = 'happy', pose: Pose = 'jump', say?: (r: Record<string, unknown>) => string | null) => {
    if (busy) return
    setBusy(kind)
    const r = await petAct(kind, slot)
    setBusy(null)
    if (!r.ok) { setToast(r.error); return }
    flash(mood, pose)
    if (r.points > 0) {
      const id = ++floatId.current
      setFloats(f => [...f, { id, text: `+${r.points} ❤` }])
      setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
    }
    const msg = say?.(r as Record<string, unknown>)
    if (msg) setToast(msg)
  }

  const feed = () => open && !fedNow && run('meal', open.slot, 'happy', 'sniff', r =>
    r.bonus_all ? `${pet.name}: 배불러요!! 같이 준 사람 모두 +2 🎉` : r.full ? '배불러요! 보너스 +2' : (r.nth as number) === 1 ? '첫 숟갈! 다른 팀원도 같이 주면 보너스가 있어요' : null)

  const trickInfo = trick ? TRICK_POSE[trick] : null
  const mood: Mood = react?.mood
    ?? (sleeping ? 'sleepy' : s.poops.length > 0 ? 'poop' : open && open.feeders.length === 0 ? 'hungry' : 'normal')
  const pose: Pose = playing?.fx.pose ?? react?.pose ?? trickInfo?.pose ?? (sleeping ? 'sleep' : w.pose)
  const outfit = (trickInfo?.outfit ?? pet.outfit) as Outfit
  const top3 = s.affection.slice(0, 3)
  // 산책은 깜짝 10분 창(오전·오후 한 번씩)마다 1번, 하루 성공 1번
  const walkNow = walkLeft(s)
  const walkDone = (s.mine.walk_success ?? 0) > 0
  // 마당 소품: 산 장난감 전부 + 집은 제일 비싼 것 하나 + 꾸미기
  const house = [...SHOP].reverse().find(x => x.house && ownedSet.has(x.key))
  const toys = SHOP.filter(x => !x.house && !x.deco && ownedSet.has(x.key))
  const deco = (k: ShopKey) => ownedSet.has(k)
  const toyUsed = (s.mine.toy ?? 0) > 0
  const resting = hasHouse && w.pose === 'sleep' && !sleeping && !playing

  const playToy = async (toy: ToyKey) => {
    if (busy || playing) return
    setBusy('toy')
    const r = await petAct('toy', toy)
    setBusy(null)
    if (!r.ok) { setToast(r.error); return }
    setToyPick(false)
    const fx = toyFxOf(toy, s.today)
    setPlaying({ toy, fx })
    setTimeout(() => setPlaying(null), 4000)
    const id = ++floatId.current
    setFloats(f => [...f, { id, text: `+${r.points} ❤` }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
  }

  const mealLine = (() => {
    if (!s.workday) return <>🏖 주말·휴일엔 펫시터가 밥을 줘요</>
    if (open) {
      const n = open.feeders.length
      return <>🍚 <b>{SLOT_LABEL[open.slot]}</b> 시간! <b>{hhmm(open.close_at!)}</b>까지 · {n === 0 ? '아직 아무도 안 줬어요' : `같이 준 사람 ${n}명${n >= 3 ? ' · 배불러요 😋' : ''}`}</>
    }
    const left = s.slots.filter(x => x.state === 'before').length
    if (left) return s.fed_today
      ? <>🍚 언제 또 배고파할지 몰라요 · 오늘 {left}번 남음 · 열리면 <b>10분</b>만!</>
      : <>🍚 오늘 아직 한 숟갈도 못 먹었어요 · 배고파하면 <b>10분</b>만 열려요!</>
    return s.fed_today ? <>🌙 오늘 밥은 끝! 내일 또 만나요</> : <>😢 오늘 아무도 밥을 못 줬어요… 내일 가출할지도</>
  })()

  if (pet.status === 'runaway') {
    const pct = Math.min(100, (s.search_total / SEARCH_GOAL) * 100)
    const mineSearch = s.mine.search ?? 0
    return (
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 w-full h-full flex flex-col" style={{ minHeight: 300 }}>
        <Header pet={pet.name} rank={st.rank} age={age} stage={st.stage} total={s.team_total} onRoom={onRoom} />
        <div className="relative rounded-xl overflow-hidden flex items-center justify-center" style={{ height: 150, background: 'linear-gradient(#EEF0F4 0 62%, #E1E6DA 62% 100%)' }}>
          <div className="text-center">
            <div className="text-[44px] leading-none">🏠</div>
            <div className="mt-1 inline-block bg-[#FFFBEA] border border-[#EAD9A0] rounded-md px-2 py-1 text-[11.5px] text-[#6B5B3E] rotate-[-2deg]">“배고파서 나가요… 찾으러 와 줘요 멍” — {pet.name}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[12px] text-[#6B6B66] mb-1"><span>📣 팀 전체가 부른 횟수</span><span><b>{s.search_total}</b> / {SEARCH_GOAL}</span></div>
          <div className="h-2.5 rounded-full bg-[#F1F1ED] overflow-hidden"><div className="h-full rounded-full bg-[#F0A24A] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
        </div>
        <button onClick={() => run('search', null, 'normal', 'stand')} disabled={!!busy || mineSearch >= LIMITS.search}
          className="mt-3 w-full rounded-xl bg-[#F0A24A] text-white font-semibold py-2.5 disabled:opacity-40 active:scale-[.99]">
          📣 {pet.name}야~ 부르기 <span className="font-normal opacity-90">(오늘 {mineSearch}/{LIMITS.search})</span>
        </button>
        {toast && <p className="mt-1.5 text-[11.5px] text-[#C0573E]">{toast}</p>}
        <p className="mt-auto pt-2 text-[11px] text-[#9C9C96]">많이 찾은 사람: {s.searchers.slice(0, 3).map(x => `${nameOf(x.member_id)} ${x.n}`).join(' · ') || '아직 없어요'} · 다 모이면 제일 많이 찾은 사람에게 먼저 달려와요</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 w-full h-full flex flex-col" style={{ minHeight: 300 }}>
      <Header pet={pet.name} rank={st.rank} age={age} stage={st.stage} total={s.team_total} onRoom={onRoom} coins={s.coins} onShop={onShop} />
      {age >= 60 && <p className="mb-2 text-[12px] rounded-lg bg-[#EEF6EA] text-[#4E7A3E] px-3 py-1.5">🎓 {pet.name} 졸업 시즌! 60일 동안 함께 키워 줘서 고마워요</p>}
      {promo && (
        <button onClick={() => setPromoClosed(true)} className="mb-2 text-left text-[12px] rounded-lg bg-[#FFF3DC] text-[#8A5A1C] px-3 py-1.5">{promo} <span className="text-[#B9965F]">닫기</span></button>
      )}
      {/* 마당 */}
      <div ref={boxRef} className="relative rounded-xl overflow-hidden flex-1" style={{ minHeight: 150, background: deco('grass')
        ? (sleeping
          ? 'repeating-linear-gradient(100deg, transparent 0 7px, rgba(60,110,50,.18) 7px 9px) 0 100% / 100% 48px no-repeat, linear-gradient(to top, #9FC48E 0 48px, #DCE3F2 48px)'
          : 'repeating-linear-gradient(100deg, transparent 0 7px, rgba(60,130,50,.22) 7px 9px) 0 100% / 100% 48px no-repeat, linear-gradient(to top, #A9D98F 0 48px, #EAF4FF 48px)')
        : sleeping ? 'linear-gradient(to top, #CFDCCB 0 48px, #DCE3F2 48px)' : 'linear-gradient(to top, #DCEFD2 0 48px, #EAF4FF 48px)' }}>
        {deco('tree') && <span className="absolute text-[64px] leading-none" style={{ left: '4%', bottom: 30 }} aria-hidden>🌳</span>}
        {deco('fence') && <div className="absolute left-0 right-0" style={{ bottom: 40, height: 22, background: 'linear-gradient(#B98A55, #B98A55) 0 6px / 100% 3px no-repeat, linear-gradient(#B98A55, #B98A55) 0 14px / 100% 3px no-repeat, repeating-linear-gradient(90deg, #C99A63 0 6px, transparent 6px 22px)' }} aria-hidden />}
        {deco('flowers') && ['🌷', '🌼', '🌸', '🌷', '🌼'].map((f, i) => <span key={i} className="absolute text-[13px] leading-none" style={{ left: `${14 + i * 17}%`, bottom: 30 + (i % 2) * 6 }} aria-hidden>{f}</span>)}
        <span className="absolute left-[18%] top-3 text-[20px] opacity-60" aria-hidden>☁️</span>
        <span className="absolute left-[58%] top-7 text-[14px] opacity-40" aria-hidden>☁️</span>
        {sleeping && <span className="absolute right-3 top-2 text-[18px]" aria-hidden>{s.workday ? '🌙' : '🏖'}</span>}
        {/* 집은 강아지보다 앞(z-20) — 들어가 쉬면 몸이 집에 가려진다 */}
        {house && <span className="absolute right-0 bottom-1 z-20 text-[64px] leading-none pointer-events-none" title={house.label} aria-hidden>{house.icon}</span>}
        {resting && <span className="pet-zzz absolute right-10 z-30 text-[13px]" style={{ bottom: 64 }} aria-hidden>💤</span>}
        {toys.filter(t => t.key !== playing?.toy).map((t, i) => <span key={t.key} className="absolute text-[16px] leading-none" style={{ left: `${30 + i * 9}%`, bottom: 6 }} title={t.label} aria-hidden>{t.icon}</span>)}
        <button onClick={feed} disabled={!open || fedNow || !!busy} title={open ? (fedNow ? '이번 끼니는 줬어요' : '한 숟갈 주기') : '밥 시간이 아니에요'}
          className={`absolute text-[24px] leading-none transition-transform ${open && !fedNow ? 'hover:scale-110 animate-bounce' : 'opacity-60'}`} style={{ left: 10, bottom: 8 }}>🥣</button>
        {s.poops.map((p, i) => (
          <button key={p.key} onClick={() => run('poop', p.key, 'happy', 'jump', () => '깨끗해졌어요 ✨')} disabled={!!busy} title="똥 치우기"
            className="absolute z-10 text-[22px] leading-none hover:scale-125 transition-transform cursor-pointer" style={{ left: `${58 + i * 14}%`, bottom: 10 }}>💩</button>
        ))}
        <div className="absolute bottom-1 left-0 will-change-transform" style={{ width: dogW, transform: `translateX(${sleeping ? 70 : w.x}px)`, transition: `transform ${w.ms}ms linear` }}>
          <div className="relative" style={{ transform: `scaleX(${w.dir})`, transition: 'transform .2s' }}>
            <div className={playing?.fx.dogCls ?? trickInfo?.cls}>
              <PetDog breed="shiba" age={age} mood={playing ? 'happy' : mood} pose={pose} outfit={outfit} />
            </div>
            {playing && (
              <span className="absolute text-[22px] leading-none pointer-events-none" style={playing.fx.toyStyle}>
                <span className={`inline-block ${playing.fx.toyCls}`}>{SHOP.find(x => x.key === playing.toy)?.icon}</span>
              </span>
            )}
          </div>
          {playing?.fx.zzz && <span className="pet-zzz absolute right-2 top-2 text-[13px]" aria-hidden>💤</span>}
          {playing && <span className="pet-bubble absolute left-1/2 -translate-x-1/2 -top-5 text-[11px] bg-white border border-[#E8E8E4] rounded-full px-2 py-0.5 whitespace-nowrap shadow-sm z-30">{playing.fx.say}</span>}
          {floats.map(f => <span key={f.id} className="pet-float absolute left-1/2 -translate-x-1/2 top-0 text-[12px] font-bold text-[#E0605A] whitespace-nowrap">{f.text}</span>)}
          {trick && <span className="pet-bubble absolute left-1/2 -translate-x-1/2 -top-5 text-[11px] bg-white border border-[#E8E8E4] rounded-full px-2 py-0.5 whitespace-nowrap shadow-sm">{learnedTricks(s.train_total).find(t => t.key === trick)?.say}</span>}
        </div>
      </div>
      {/* 밥 */}
      <div className="mt-2.5 rounded-lg bg-[#FFF8EC] px-3 py-2 text-[12px] text-[#6B5B3E] flex items-center justify-between gap-2">
        <span className="min-w-0">{mealLine}</span>
        {s.poops.length > 0 && (
          <button onClick={() => run('poop', s.poops[0].key, 'happy', 'jump', () => '깨끗해졌어요 ✨')} disabled={!!busy}
            className="flex-shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[#8A6A3A] text-white disabled:opacity-40">💩 치우기 +3</button>
        )}
        {open && (
          <button onClick={feed} disabled={fedNow || !!busy} className="flex-shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[#F0A24A] text-white disabled:opacity-40">{fedNow ? '줬어요' : '한 숟갈'}</button>
        )}
      </div>
      {/* 🧸 장난감 고르기 */}
      {toyPick && (
        <div className="mt-2 rounded-lg border border-[#EAD9A0] bg-[#FFFBEA] px-2.5 py-2 text-[12px] text-[#6B5B3E]">
          {toys.length === 0 ? <>아직 팀 장난감이 없어요 — <button onClick={onShop} className="underline font-semibold">상점</button>에서 같이 사 주세요</>
            : toyUsed ? <>오늘은 실컷 놀았어요! 내일은 또 다른 놀이를 보여 줄게요 🐾</>
            : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="mr-1">뭐 하고 놀까? <span className="text-[#9C9C96]">(하루 1번)</span></span>
                {toys.map(t => (
                  <button key={t.key} onClick={() => playToy(t.key as ToyKey)} disabled={!!busy}
                    className="rounded-full border border-[#EAD9A0] bg-white hover:bg-[#FFF3C4] px-2.5 py-1 disabled:opacity-40">{t.icon} {t.label}</button>
                ))}
              </div>
            )}
        </div>
      )}
      {/* 개인 행동 */}
      <div className={`mt-2 grid gap-1.5 ${age >= 31 ? 'grid-cols-6' : 'grid-cols-5'}`}>
        <Act icon="🦴" label="간식" {...unlockLeft(s, 'snack')} busy={busy === 'snack'} onClick={() => run('snack', null, 'happy', 'sit')} />
        <Act icon="🎾" label="놀기" {...unlockLeft(s, 'play')} busy={busy === 'play'} onClick={() => run('play', null, 'happy', 'jump')} />
        <Act icon="✋" label="쓰담" {...unlockLeft(s, 'pat')} busy={busy === 'pat'} onClick={() => run('pat', null, 'happy', 'sit')} />
        <Act icon="🧸" label="장난감" left={1} hot={toyPick} busy={busy === 'toy'} onClick={() => setToyPick(v => !v)} />
        <Act icon="🦮" label="산책" left={walkNow} soon={!walkNow && !walkDone && s.workday} hot={!!walkNow} busy={false} onClick={onWalk} />
        {age >= 31 && <Act icon="🎓" label="훈련" {...unlockLeft(s, 'train')} busy={busy === 'train'} onClick={() => run('train', null, 'happy', 'paw', r => {
          const learned = learnedTricks(r.train_total as number).at(-1)
          const before = learnedTricks((r.train_total as number) - 1).at(-1)
          return learned && learned.key !== before?.key ? `🎓 새 개인기: ${learned.label}!` : null
        })} />}
      </div>
      {toast && <p className="mt-1.5 text-[11.5px] text-[#8A6A3A]">{toast}</p>}
      <p className="mt-auto pt-2 text-[11px] text-[#9C9C96] truncate">
        {top3.length ? <>제일 좋아하는 사람 {top3.map((a, i) => `${['🥇', '🥈', '🥉'][i]} ${nameOf(a.member_id)}`).join(' · ')}</> : `${pet.name}랑 먼저 친해져 보세요`}
      </p>
    </div>
  )
}

function Header({ pet, rank, age, stage, total, onRoom, coins, onShop }: { pet: string; rank: string; age: number; stage: string; total: number; onRoom: () => void; coins?: number; onShop?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      <button onClick={onRoom} className="text-left min-w-0 group" title="자세히 보기">
        <p className="text-[14px] font-semibold text-[#1F1F1D] truncate">🐶 <span className="text-[11.5px] font-semibold text-[#C27A2C] bg-[#FFF1DE] rounded px-1 py-[1px] mr-1">{rank}</span>{pet} <span className="text-[11.5px] font-medium text-[#9C9C96]">D+{age} · {stage}</span> <span className="text-[11px] text-[#C4C4BE] group-hover:text-[#6B6B66]">›</span></p>
      </button>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        {onShop && <button onClick={onShop} title="상점 — 팀 나무에 물 주면 🪙1, 같이 보태서 사요" className="text-[11px] font-semibold text-[#8A6A1C] bg-[#FFF6D8] hover:bg-[#FFEDB5] rounded-full px-2 py-0.5">🪙 {coins ?? 0} 상점</button>}
        <span className="text-[11px] text-[#9C9C96]">❤ {total}</span>
      </span>
    </div>
  )
}

function Act({ icon, label, left, soon, hot, busy, onClick }: { icon: string; label: string; left: number; soon?: boolean; hot?: boolean; busy: boolean; onClick: () => void }) {
  // soon: 지금은 다 썼지만 오늘 나중에 또 열린다(언제인지는 비밀) · hot: 깜짝 창이 지금 열림
  return (
    <button onClick={onClick} disabled={left <= 0 || busy} title={soon ? '조금 있다가 또 열려요' : undefined}
      className={`rounded-lg border py-1.5 text-[11.5px] transition-colors disabled:cursor-default ${hot ? 'border-[#F0A24A] bg-[#FFF3DC] animate-pulse' : 'border-[#E8E8E4] hover:bg-[#F7F7F5]'} ${soon ? 'disabled:opacity-60' : 'disabled:opacity-35'}`}>
      <div className={`text-[16px] leading-none mb-0.5 ${soon ? 'grayscale opacity-50' : ''}`}>{icon}</div>
      {soon ? <span className="text-[10.5px] text-[#8A6A3A]">⏰ 곧</span> : <>{label} <span className="text-[#9C9C96]">{hot ? 'GO' : Math.max(0, left)}</span></>}
    </button>
  )
}
