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
  LIMITS, MISS_LIMIT, SEARCH_GOAL, SHOP, decoPieces, donorsOf, pieceOwners, hhmm, unlockLeft, walkLeft, SLOT_LABEL, SLOT_TIME, isAsleep, likesOf, learnedTricks, openMealSlot, petAct, reloadPet, stageOf, usePet,
  type PetState, type ShopKey, type ToyKey, type TrickKey,
} from '@/lib/pet'
import { SLEEP_TALK, chatLines, greetLine, requestLines, type Talk, type TalkAction } from '@/lib/petTalk'

const PetWalkGame = dynamic(() => import('@/components/pet/PetWalkGame'), { ssr: false })
const PetRoom = dynamic(() => import('@/components/pet/PetRoom'), { ssr: false })
const PetShop = dynamic(() => import('@/components/pet/PetShop'), { ssr: false })
const PetMeet = dynamic(() => import('@/components/pet/PetMeet'), { ssr: false })

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
  const [meetOpen, setMeetOpen] = useState(false)

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
      <Live s={s} nameOf={nameOf} memberIds={members.map(m => m.id)} onWalk={() => setWalkOpen(true)} onRoom={() => setRoomOpen(true)} onShop={() => setShopOpen(true)} onMeet={() => setMeetOpen(true)} />
      {meetOpen && <PetMeet state={s} nameOf={nameOf} memberIds={members.map(m => m.id)} onClose={() => setMeetOpen(false)} />}
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

function Live({ s, nameOf, memberIds, onWalk, onRoom, onShop, onMeet }: { s: PetState; nameOf: (id: string) => string; memberIds: string[]; onWalk: () => void; onRoom: () => void; onShop: () => void; onMeet: () => void }) {
  const pet = s.pet!
  const age = Math.max(1, pet.age)
  const st = stageOf(age)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const dogW = 112 + 52 * Math.min(1, age / 30)
  // 자는 시간(주말·휴일 종일, 평일 9시 전·20시부터) — 누가 깨우면 10분 동안 깨어 있다(서버 판정)
  const sleeping = isAsleep(s)
  const woken = !sleeping && !!s.awake_until && Date.parse(s.awake_until) > Date.parse(s.now) // 깨워서 깨어 있는 중(짜증)
  const [grumpy, setGrumpy] = useState(false)
  const [react, setReact] = useState<{ mood: Mood; pose?: Pose; until: number } | null>(null)
  const [trick, setTrick] = useState<TrickKey | null>(null)
  const [floats, setFloats] = useState<Float[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const floatId = useRef(0)
  const [toyPick, setToyPick] = useState(false)
  // 🪧 누가 사 줬나 팻말 — 평소엔 숨기고, 마우스를 올리거나 누른 물건 하나만 보여 준다
  const [sign, setSign] = useState<{ id: string; text: string; style: React.CSSProperties } | null>(null)
  const signTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [playing, setPlaying] = useState<{ toy: ToyKey; fx: ToyFx } | null>(null)
  const ownedSet = new Set<ShopKey>(s.items.map(i => i.item))
  const hasHouse = SHOP.some(x => x.house && ownedSet.has(x.key))
  const w = useWander(boxRef, dogW, sleeping || grumpy || pet.status === 'runaway' || !!trick || !!playing, hasHouse)
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

  // ⏰ 깨우기 — 짜증 내고(애정도 -3) 10분 동안 깨어 있음
  const wake = async () => {
    if (busy) return
    setBusy('wake')
    const r = await petAct('wake')
    setBusy(null)
    if (!r.ok) { setToast(r.error); return }
    setGrumpy(true)
    setTimeout(() => setGrumpy(false), 6000)
    const id = ++floatId.current
    setFloats(f => [...f, { id, text: `${r.points} 💢` }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1600)
    setToast(`${pet.name}: 으르릉… 자는데 왜 깨워요! (애정도 ${r.points})`)
  }
  const { best, worst } = likesOf(s, memberIds)

  // 🗨 호떡 한마디 — 들어오면 이름 불러 인사, 그 뒤 30~60초에 한 번 5초씩(조르기 반, 수다 반). 조르기 말풍선은 누르면 그 행동.
  const [talk, setTalk] = useState<(Talk & { id: number }) | null>(null)
  const talkSrc = useRef<{ next: (first: boolean) => Talk | null; quiet: () => boolean }>({ next: () => null, quiet: () => true })
  useEffect(() => {
    const myName = nameOf(s.me)
    talkSrc.current = {
      quiet: () => !!(grumpy || trick || playing || busy) || pet.status !== 'active',
      next: (first: boolean) => {
        if (sleeping) return Math.random() < 0.35 ? SLEEP_TALK[Math.floor(Math.random() * SLEEP_TALK.length)] : null
        if (first) return greetLine(s, myName, best, worst)
        const req = requestLines(s, myName)
        const pool = req.length && Math.random() < 0.5 ? req : chatLines(s, myName, best ? nameOf(best) : null)
        return pool[Math.floor(Math.random() * pool.length)] ?? null
      },
    }
  })
  useEffect(() => {
    let alive = true, last = '', id = 0
    let t: ReturnType<typeof setTimeout>
    const say = (first: boolean) => {
      if (!alive) return
      const src = talkSrc.current
      if (!document.hidden && !src.quiet()) {
        let line = src.next(first)
        for (let i = 0; i < 3 && line && line.text === last; i++) line = src.next(false)
        if (line && line.text !== last) {
          last = line.text
          const my = ++id
          setTalk({ ...line, id: my })
          setTimeout(() => { if (alive) setTalk(v => (v?.id === my ? null : v)) }, 5000)
        }
      }
      t = setTimeout(() => say(false), 30_000 + Math.random() * 30_000)
    }
    t = setTimeout(() => say(true), 2500)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  const meetMine = s.meeting?.find(m => m.member_id === s.me)
  const meetLeft = !s.meet_used || !!meetMine ? 1 : 0
  const doTalk = (a: TalkAction) => {
    setTalk(null)
    if (a === 'feed') feed()
    else if (a === 'poop') { if (s.poops[0]) run('poop', s.poops[0].key, 'happy', 'jump', () => '깨끗해졌어요 ✨') }
    else if (a === 'snack') run('snack', null, 'happy', 'sit')
    else if (a === 'play') run('play', null, 'happy', 'jump')
    else if (a === 'pat') run('pat', null, 'happy', 'sit')
    else if (a === 'shop') onShop()
    else if (a === 'walk') onWalk()
  }

  const trickInfo = trick ? TRICK_POSE[trick] : null
  const mood: Mood = (grumpy ? 'sad' : null) ?? react?.mood
    ?? (sleeping ? 'sleepy' : s.poops.length > 0 ? 'poop' : open && open.feeders.length === 0 ? 'hungry' : 'normal')
  const pose: Pose = grumpy ? 'stand' : playing?.fx.pose ?? react?.pose ?? trickInfo?.pose ?? (sleeping ? 'sleep' : w.pose)
  const outfit = (trickInfo?.outfit ?? pet.outfit) as Outfit
  const top3 = s.affection.slice(0, 3)
  // 산책은 깜짝 10분 창(오전·오후 한 번씩)마다 1번, 하루 성공 1번
  const walkNow = walkLeft(s)
  const walkDone = (s.mine.walk_success ?? 0) > 0
  // 마당 소품: 산 장난감 전부 + 집은 제일 비싼 것 하나 + 꾸미기
  const house = [...SHOP].reverse().find(x => x.house && ownedSet.has(x.key))
  const toys = SHOP.filter(x => !x.house && !x.deco && ownedSet.has(x.key))
  // 꾸미기: 10코인마다 한 조각(잔디 8칸·꽃 6송이·울타리 5칸·나무 6단계)
  const grassN = decoPieces(s, 'grass').got
  const flowerN = decoPieces(s, 'flowers').got
  const fenceN = decoPieces(s, 'fence').got
  const treeN = decoPieces(s, 'tree').got
  // 🎁 팻말: 누가 사 줬는지(많이 낸 순). 꽃은 송이마다 주인이 있고, 같은 사람 꽃은 팻말 하나로 묶는다
  const donorIds = (key: ShopKey) => donorsOf(s, key).map(d => d.member_id)
  const giftText = (ids: string[], label: string) => {
    if (ids.length === 0) return null
    const n = ids.map(id => nameOf(id))
    return `${n.length <= 3 ? n.join('·') : `${n[0]} 외 ${n.length - 1}명`}님이 사 준 ${label}`
  }
  // 올리면 보이고 떼면 사라짐 · 누르면(휴대폰) 3초 보였다 사라짐
  const signProps = (id: string, text: string | null, style: React.CSSProperties) => text ? {
    onMouseEnter: () => { if (signTimer.current) clearTimeout(signTimer.current); setSign({ id, text, style }) },
    onMouseLeave: () => setSign(v => (v?.id === id ? null : v)),
    onClick: () => {
      if (signTimer.current) clearTimeout(signTimer.current)
      setSign({ id, text, style })
      signTimer.current = setTimeout(() => setSign(v => (v?.id === id ? null : v)), 3000)
    },
    style: { cursor: 'pointer' } as React.CSSProperties,
  } : {}
  const flowerOwners = pieceOwners(s, 'flowers')
  const treeLook = treeN >= 6 ? { icon: '🌳', size: 64 } : treeN >= 4 ? { icon: '🌿', size: 22 + treeN * 6 } : treeN >= 1 ? { icon: '🌱', size: 14 + treeN * 5 } : null
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
    const next = s.slots.find(x => x.state === 'before')
    if (next) return <>🍚 다음은 <b>{SLOT_LABEL[next.slot]}</b> {SLOT_TIME[next.slot]} · 밥 시간: 아침 9~11 · 점심 14~16 · 저녁 18~20</>
    return s.fed_today ? <>🌙 오늘 밥은 끝! 내일 또 만나요</> : <>😢 오늘 아무도 밥을 못 줬어요… 연속 {MISS_LIMIT}번 못 주면 가출해요</>
  })()

  if (pet.status === 'runaway') {
    const goal = s.search_goal ?? SEARCH_GOAL
    const pct = Math.min(100, (s.search_total / goal) * 100)
    const mineSearch = s.mine.search ?? 0
    const culprit = s.runaway_by ?? null
    const iAmCulprit = culprit === s.me
    return (
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4 w-full h-full flex flex-col" style={{ minHeight: 300 }}>
        <Header pet={pet.name} rank={st.rank} age={age} stage={st.stage} total={s.team_total} onRoom={onRoom} />
        <div className="relative rounded-xl overflow-hidden flex items-center justify-center" style={{ height: 150, background: 'linear-gradient(#EEF0F4 0 62%, #E1E6DA 62% 100%)' }}>
          <div className="text-center">
            <div className="text-[44px] leading-none">🏠</div>
            <div className="mt-1 inline-block bg-[#FFFBEA] border border-[#EAD9A0] rounded-md px-2 py-1 text-[11.5px] text-[#6B5B3E] rotate-[-2deg]">{culprit ? `“${iAmCulprit ? '…' : `${nameOf(culprit)}님이 `}밥을 세 번이나 안 줬어요… 서운해서 나가요 멍”` : '“배고파서 나가요… 찾으러 와 줘요 멍”'} — {pet.name}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[12px] text-[#6B6B66] mb-1"><span>📣 팀 전체가 부른 횟수</span><span><b>{s.search_total}</b> / {goal}</span></div>
          <div className="h-2.5 rounded-full bg-[#F1F1ED] overflow-hidden"><div className="h-full rounded-full bg-[#F0A24A] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
        </div>
        <button onClick={() => run('search', null, 'normal', 'stand')} disabled={!!busy || mineSearch >= LIMITS.search}
          className="mt-3 w-full rounded-xl bg-[#F0A24A] text-white font-semibold py-2.5 disabled:opacity-40 active:scale-[.99]">
          📣 {pet.name}야~ 부르기 <span className="font-normal opacity-90">(오늘 {mineSearch}/{LIMITS.search})</span>
        </button>
        {iAmCulprit && (
          <button onClick={() => run('apology', null, 'normal', 'stand', () => '🙇 사과했어요 — 부르기 30번 몫!')} disabled={!!busy || !!s.apologized}
            className="mt-1.5 w-full rounded-xl border border-[#F0A24A] bg-[#FFF3DC] text-[#8A5A1C] font-semibold py-2 disabled:opacity-50">
            {s.apologized ? '🙇 사과했어요 (부르기 30번 몫)' : '🙇 미안해… 사과 간식 주기 (부르기 30번 몫)'}
          </button>
        )}
        {culprit && !iAmCulprit && <p className="mt-1 text-[11px] text-[#8A6A3A]">{s.apologized ? `🙇 ${nameOf(culprit)}님이 사과했어요` : `${nameOf(culprit)}님이 🙇 사과하면 30번 몫이 한 번에 채워져요`}</p>}
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
      <div ref={boxRef} className="relative rounded-xl overflow-hidden flex-1" style={{ minHeight: 150, background: sleeping ? 'linear-gradient(to top, #CFDCCB 0 48px, #DCE3F2 48px)' : 'linear-gradient(to top, #DCEFD2 0 48px, #EAF4FF 48px)' }}>
        {/* 잔디: 8칸 중 모인 만큼 왼쪽부터 깔린다 */}
        {Array.from({ length: grassN }, (_, i) => (
          <div key={`g${i}`} {...signProps('grass', giftText(donorIds('grass'), '잔디'), {})} className="absolute bottom-0" style={{ cursor: 'pointer', left: `${i * 12.5}%`, width: '12.6%', height: 48, background: `repeating-linear-gradient(100deg, transparent 0 7px, rgba(60,130,50,.22) 7px 9px), ${sleeping ? '#9FC48E' : '#A9D98F'}` }} aria-hidden />
        ))}
        {treeLook && <span {...signProps('tree', giftText(donorIds('tree'), '나무'), { left: '2%', bottom: 34 + treeLook.size })} className="absolute leading-none transition-all duration-700" style={{ cursor: 'pointer', left: '4%', bottom: 30, fontSize: treeLook.size }}>{treeLook.icon}</span>}
        {/* 울타리: 5칸 */}
        {Array.from({ length: fenceN }, (_, i) => (
          <div key={`f${i}`} {...signProps('fence', giftText(donorIds('fence'), '울타리'), {})} className="absolute" style={{ cursor: 'pointer', left: `${i * 20}%`, width: '20.2%', bottom: 40, height: 22, background: 'linear-gradient(#B98A55, #B98A55) 0 6px / 100% 3px no-repeat, linear-gradient(#B98A55, #B98A55) 0 14px / 100% 3px no-repeat, repeating-linear-gradient(90deg, #C99A63 0 6px, transparent 6px 22px)' }} aria-hidden />
        ))}
        {/* 꽃: 6송이 */}
        {['🌷', '🌼', '🌸', '🌷', '🌼', '🌸'].slice(0, flowerN).map((f, i) => (
          <span key={`fl${i}`} {...signProps(`fl${i}`, flowerOwners[i] ? `${nameOf(flowerOwners[i])}님 꽃 ${f}` : null, i < 3 ? { left: `calc(${12 + i * 14}% - 6px)`, bottom: 46 + (i % 2) * 6 } : { right: `calc(${88 - i * 14}% - 18px)`, bottom: 46 + (i % 2) * 6 })}
            className="absolute text-[13px] leading-none" style={{ cursor: 'pointer', left: `${12 + i * 14}%`, bottom: 30 + (i % 2) * 6 }}>{f}</span>
        ))}
        <span className="absolute left-[18%] top-3 text-[20px] opacity-60" aria-hidden>☁️</span>
        <span className="absolute left-[58%] top-7 text-[14px] opacity-40" aria-hidden>☁️</span>
        {sleeping && <span className="absolute right-3 top-2 text-[18px]" aria-hidden>{s.workday ? '🌙' : '🏖'}</span>}
        {sleeping && (
          <button onClick={wake} disabled={!!busy || (s.mine.wake ?? 0) >= 3} title="깨우면 짜증 내요 — 내 애정도 -3, 10분 동안 깨어 있음 (하루 3번)"
            className="absolute left-2 top-2 z-30 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-white/90 border border-[#E8E8E4] text-[#6B5B3E] hover:bg-white disabled:opacity-40">⏰ 깨우기 <span className="text-[#E0605A]">-3❤</span></button>
        )}
        {woken && !grumpy && <span className="absolute left-2 top-2 z-30 text-[11px] rounded-full bg-white/85 px-2 py-0.5 text-[#8A6A3A]" title="누가 깨워서 잠깐 깨어 있어요">😤 {s.awake_by ? `${s.awake_by === s.me ? '내가' : `${nameOf(s.awake_by)}님이`} 깨움` : '잠 깬 중'} · {hhmm(s.awake_until!)}까지</span>}
        {/* 집은 강아지보다 앞(z-20) — 들어가 쉬면 몸이 집에 가려진다 */}
        {house && <span {...signProps('house', giftText(donorIds(house.key), house.label), { right: 4, bottom: 68 })} className="absolute right-0 bottom-1 z-20 text-[64px] leading-none" style={{ cursor: 'pointer' }}>{house.icon}</span>}
        {resting && <span className="pet-zzz absolute right-10 z-30 text-[13px]" style={{ bottom: 64 }} aria-hidden>💤</span>}
        {toys.filter(t => t.key !== playing?.toy).map((t, i) => (
          <span key={t.key} {...signProps(`toy-${t.key}`, giftText(donorIds(t.key), t.label), { left: `calc(${30 + i * 9}% - 8px)`, bottom: 26 })}
            className="absolute text-[16px] leading-none" style={{ cursor: 'pointer', left: `${30 + i * 9}%`, bottom: 6 }}>{t.icon}</span>
        ))}
        {sign && <Sign className="z-40 pointer-events-none" style={sign.style.left === undefined && sign.style.right === undefined ? { left: '50%', bottom: 52, transform: 'translateX(-50%)' } : sign.style}>🪧 {sign.text}</Sign>}
        <button onClick={feed} disabled={!open || fedNow || !!busy} title={open ? (fedNow ? '이번 끼니는 줬어요' : '한 숟갈 주기') : '밥 시간이 아니에요'}
          className={`absolute text-[24px] leading-none transition-transform ${open && !fedNow ? 'hover:scale-110 animate-bounce' : 'opacity-60'}`} style={{ left: 10, bottom: 8 }}>🥣</button>
        {s.poops.map((p, i) => (
          <button key={p.key} onClick={() => run('poop', p.key, 'happy', 'jump', () => '깨끗해졌어요 ✨')} disabled={!!busy} title="똥 치우기"
            className="absolute z-10 text-[22px] leading-none hover:scale-125 transition-transform cursor-pointer" style={{ left: `${58 + i * 14}%`, bottom: 10 }}>💩</button>
        ))}
        <div className="absolute bottom-1 left-0 will-change-transform pointer-events-none" style={{ width: dogW, transform: `translateX(${sleeping ? 70 : w.x}px)`, transition: `transform ${w.ms}ms linear` }}>
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
          {talk && !playing && !grumpy && !trick && (talk.action
            ? <button key={talk.id} onClick={() => doTalk(talk.action!)} title="눌러서 들어주기"
                className="pet-talk pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[calc(100%-14px)] z-30 w-max max-w-[210px] text-center text-[11.5px] leading-snug bg-[#FFF8EC] border border-[#F0C58A] text-[#6B4A22] rounded-2xl px-2.5 py-1 shadow-sm hover:bg-[#FFEFD6]">{talk.text} <span className="text-[#C27A2C]">›</span></button>
            : <span key={talk.id} className="pet-talk absolute left-1/2 -translate-x-1/2 bottom-[calc(100%-14px)] z-30 w-max max-w-[210px] text-center text-[11.5px] leading-snug bg-white border border-[#E8E8E4] text-[#4A4A45] rounded-2xl px-2.5 py-1 shadow-sm">{talk.text}</span>)}
          {floats.map(f => <span key={f.id} className="pet-float absolute left-1/2 -translate-x-1/2 top-0 text-[12px] font-bold text-[#E0605A] whitespace-nowrap">{f.text}</span>)}
          {grumpy && <span className="pet-bubble absolute left-1/2 -translate-x-1/2 -top-5 text-[11px] bg-white border border-[#F3C3BF] text-[#C0392B] rounded-full px-2 py-0.5 whitespace-nowrap shadow-sm z-30">으르릉… 왜 깨워요 💢</span>}
          {grumpy && <span className="pet-float absolute right-2 top-2 text-[16px]" aria-hidden>💢</span>}
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
      </div>
      {/* 🥣 사람마다 밥그릇 — 내 것만 누를 수 있다. 쉬는 사람(휴가·반차·외근)은 🏖, 연속으로 못 준 끼니는 ⚠n/3 */}
      {s.workday && memberIds.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {memberIds.map(id => {
            const away = (s.away_today?.[id] ?? []) as string[]
            const awayNow = open ? away.includes(open.slot) : away.length === 3
            const fed = !!open && open.feeders.includes(id)
            const miss = s.miss_streak?.[id] ?? 0
            const me = id === s.me
            const warn = miss > 0 && !fed ? <span className={`ml-0.5 font-bold ${miss >= MISS_LIMIT - 1 ? 'text-[#D9473F]' : 'text-[#C27A2C]'}`} title={`연속으로 못 준 끼니 ${miss}번 — ${MISS_LIMIT}번이면 가출`}>⚠{miss}/{MISS_LIMIT}</span> : null
            const label = me ? '나' : nameOf(id)
            if (awayNow) return <span key={id} className="rounded-full bg-[#F1F1ED] px-2 py-0.5 text-[11px] text-[#9C9C96]" title="오늘 일정(휴가·반차·외근)으로 이번 끼니는 빠져요">🏖 {label}</span>
            if (me && open && !fed) return (
              <button key={id} onClick={feed} disabled={!!busy} className="rounded-full bg-[#F0A24A] px-2.5 py-0.5 text-[11px] font-semibold text-white animate-pulse disabled:opacity-40">🥣 내 숟갈 주기{warn}</button>
            )
            return (
              <span key={id} className={`rounded-full px-2 py-0.5 text-[11px] ${fed ? 'bg-[#E7F4DF] text-[#4E7A3E]' : me ? 'bg-[#FFF3DC] text-[#8A5A1C] font-semibold' : 'bg-[#F7F7F5] text-[#8A8A84]'}`}>
                {fed ? '✅' : '🥣'} {label}{warn}
              </span>
            )
          })}
        </div>
      )}
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
      <div className={`mt-2 grid gap-1.5 ${age >= 31 ? 'grid-cols-7' : 'grid-cols-6'}`}>
        <Act icon="🦴" label="간식" {...unlockLeft(s, 'snack')} busy={busy === 'snack'} onClick={() => run('snack', null, 'happy', 'sit')} />
        <Act icon="🎾" label="놀기" {...unlockLeft(s, 'play')} busy={busy === 'play'} onClick={() => run('play', null, 'happy', 'jump')} />
        <Act icon="✋" label="쓰담" {...unlockLeft(s, 'pat')} busy={busy === 'pat'} onClick={() => run('pat', null, 'happy', 'sit')} />
        <Act icon="🧸" label="장난감" left={1} hot={toyPick} busy={busy === 'toy'} onClick={() => setToyPick(v => !v)} />
        <Act icon="🐾" label="만나기" left={meetLeft} hot={!!meetMine} busy={false} onClick={() => (sleeping && !meetMine ? setToast(`${pet.name}이 자고 있어요 — ⏰ 깨워야 만날 수 있어요`) : onMeet())} />
        <Act icon="🦮" label="산책" left={walkNow} soon={!walkNow && !walkDone && s.workday} hot={!!walkNow} busy={false} onClick={onWalk} />
        {age >= 31 && <Act icon="🎓" label="훈련" {...unlockLeft(s, 'train')} busy={busy === 'train'} onClick={() => run('train', null, 'happy', 'paw', r => {
          const learned = learnedTricks(r.train_total as number).at(-1)
          const before = learnedTricks((r.train_total as number) - 1).at(-1)
          return learned && learned.key !== before?.key ? `🎓 새 개인기: ${learned.label}!` : null
        })} />}
      </div>
      {toast && <p className="mt-1.5 text-[11.5px] text-[#8A6A3A]">{toast}</p>}
      <p className="mt-auto pt-2 text-[11px] text-[#9C9C96] truncate">
        {best || worst
          ? <>{best && <>💛 제일 좋아하는 사람 <b className="text-[#C27A2C]">{nameOf(best)}</b></>}{best && worst && ' · '}{worst && <>💢 제일 서운한 사람 <b className="text-[#8A8A84]">{nameOf(worst)}</b></>}</>
          : top3.length ? <>제일 좋아하는 사람 {top3.map((a, i) => `${['🥇', '🥈', '🥉'][i]} ${nameOf(a.member_id)}`).join(' · ')}</> : `${pet.name}랑 먼저 친해져 보세요`}
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

// 🪧 작은 나무 팻말 — 누가 사 줬는지
function Sign({ children, style, className = '' }: { children: React.ReactNode; style: React.CSSProperties; className?: string }) {
  return (
    <span className={`absolute whitespace-nowrap rounded-[4px] border border-[#C99A63] bg-[#FFF6E0] px-1.5 py-0.5 text-[10.5px] leading-none text-[#6B4A22] shadow-[0_1px_2px_rgba(120,80,30,.3)] ${className}`} style={style}>
      {children}
    </span>
  )
}
