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
  LIMITS, SEARCH_GOAL, unlockLeft, SLOT_LABEL, SLOT_RANGE, kstHour, learnedTricks, openMealSlot, petAct, reloadPet, stageOf, usePet,
  type PetState, type TrickKey,
} from '@/lib/pet'

const PetWalkGame = dynamic(() => import('@/components/pet/PetWalkGame'), { ssr: false })
const PetRoom = dynamic(() => import('@/components/pet/PetRoom'), { ssr: false })

type Float = { id: number; text: string }

function useWander(boxRef: React.RefObject<HTMLDivElement | null>, dogW: number, still: boolean) {
  const [st, setSt] = useState<{ x: number; dir: 1 | -1; pose: Pose; ms: number }>({ x: 60, dir: 1, pose: 'stand', ms: 0 })
  useEffect(() => {
    const box = boxRef.current
    if (!box || still) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !timer) step() })
    io.observe(box)
    const onVis = () => { if (!document.hidden && !timer) step() }
    document.addEventListener('visibilitychange', onVis)
    function step() {
      timer = null
      if (!alive || document.hidden || !visible) return // 안 보이면 다음 행동을 정하지 않는다(멈춤)
      const W = Math.max(0, box!.clientWidth - dogW)
      const r = Math.random()
      setSt(s => {
        if (r < 0.5) {
          const nx = Math.max(0, Math.min(W, s.x + (Math.random() * 0.7 + 0.2) * W * (Math.random() < 0.5 ? -1 : 1)))
          const ms = (Math.abs(nx - s.x) / 45) * 1000
          timer = setTimeout(step, ms + 250)
          return { x: nx, dir: nx >= s.x ? 1 : -1, pose: 'walk', ms }
        }
        const pose: Pose = r < 0.72 ? 'sit' : r < 0.88 ? 'sniff' : 'stand'
        timer = setTimeout(step, 1800 + Math.random() * 2600)
        return { ...s, pose, ms: 0 }
      })
    }
    timer = setTimeout(step, 500)
    return () => { alive = false; if (timer) clearTimeout(timer); io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [boxRef, dogW, still])
  return st
}

const TRICK_POSE: Record<TrickKey, { pose: Pose; cls?: string; outfit?: Outfit }> = {
  sit: { pose: 'sit' }, paw: { pose: 'paw' }, down: { pose: 'down' }, bang: { pose: 'stand', cls: 'pet-trick-bang' },
  spin: { pose: 'stand', cls: 'pet-trick-spin' }, highfive: { pose: 'jump' }, fetch: { pose: 'stand', outfit: 'badge' },
}

export default function PetCard() {
  const { state: s, loaded, error } = usePet()
  const { members } = useMembers()
  const [walkOpen, setWalkOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)

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
      <Live s={s} nameOf={nameOf} onWalk={() => setWalkOpen(true)} onRoom={() => setRoomOpen(true)} />
      {walkOpen && <PetWalkGame state={s} onClose={() => setWalkOpen(false)} />}
      {roomOpen && <PetRoom state={s} nameOf={nameOf} onClose={() => setRoomOpen(false)} />}
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

function Live({ s, nameOf, onWalk, onRoom }: { s: PetState; nameOf: (id: string) => string; onWalk: () => void; onRoom: () => void }) {
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
  const w = useWander(boxRef, dogW, sleeping || pet.status === 'runaway' || !!trick)
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
  const pose: Pose = react?.pose ?? trickInfo?.pose ?? (sleeping ? 'sleep' : w.pose)
  const outfit = (trickInfo?.outfit ?? pet.outfit) as Outfit
  const top3 = s.affection.slice(0, 3)
  // 산책은 하루 1번(실패하면 1번 더) — 버튼 숫자는 '지금 할 수 있는 번수'로 보여 준다
  const walkLeft = (s.mine.walk_success ?? 0) > 0 || (s.mine.walk ?? 0) >= LIMITS.walk ? 0 : 1

  const mealLine = (() => {
    if (!s.workday) return <>🏖 주말·휴일엔 펫시터가 밥을 줘요</>
    if (open) {
      const n = open.feeders.length
      return <>🍚 <b>{SLOT_LABEL[open.slot]}</b> 시간! {n === 0 ? '아직 아무도 안 줬어요' : `같이 준 사람 ${n}명${n >= 3 ? ' · 배불러요 😋' : ''}`}</>
    }
    const next = s.slots.find(x => x.state === 'before')
    if (next) return <>🍚 다음 밥: {SLOT_LABEL[next.slot]} <b>{SLOT_RANGE[next.slot]}</b> 사이 언젠가 배고파해요</>
    return <>🌙 오늘 밥은 끝! 내일 아침 9~11시 사이에 만나요</>
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
      <Header pet={pet.name} rank={st.rank} age={age} stage={st.stage} total={s.team_total} onRoom={onRoom} />
      {age >= 60 && <p className="mb-2 text-[12px] rounded-lg bg-[#EEF6EA] text-[#4E7A3E] px-3 py-1.5">🎓 {pet.name} 졸업 시즌! 60일 동안 함께 키워 줘서 고마워요</p>}
      {promo && (
        <button onClick={() => setPromoClosed(true)} className="mb-2 text-left text-[12px] rounded-lg bg-[#FFF3DC] text-[#8A5A1C] px-3 py-1.5">{promo} <span className="text-[#B9965F]">닫기</span></button>
      )}
      {/* 마당 */}
      <div ref={boxRef} className="relative rounded-xl overflow-hidden flex-1" style={{ minHeight: 150, background: sleeping ? 'linear-gradient(to top, #CFDCCB 0 48px, #DCE3F2 48px)' : 'linear-gradient(to top, #DCEFD2 0 48px, #EAF4FF 48px)' }}>
        <span className="absolute left-[18%] top-3 text-[20px] opacity-60" aria-hidden>☁️</span>
        <span className="absolute left-[58%] top-7 text-[14px] opacity-40" aria-hidden>☁️</span>
        {sleeping && <span className="absolute right-3 top-2 text-[18px]" aria-hidden>{s.workday ? '🌙' : '🏖'}</span>}
        <button onClick={feed} disabled={!open || fedNow || !!busy} title={open ? (fedNow ? '이번 끼니는 줬어요' : '한 숟갈 주기') : '밥 시간이 아니에요'}
          className={`absolute text-[24px] leading-none transition-transform ${open && !fedNow ? 'hover:scale-110 animate-bounce' : 'opacity-60'}`} style={{ left: 10, bottom: 8 }}>🥣</button>
        {s.poops.map((p, i) => (
          <button key={p.key} onClick={() => run('poop', p.key, 'happy', 'jump', () => '깨끗해졌어요 ✨')} disabled={!!busy} title="똥 치우기"
            className="absolute text-[18px] leading-none hover:scale-125 transition-transform" style={{ left: `${58 + i * 14}%`, bottom: 10 }}>💩</button>
        ))}
        <div className="absolute bottom-1 left-0 will-change-transform" style={{ width: dogW, transform: `translateX(${sleeping ? 70 : w.x}px)`, transition: `transform ${w.ms}ms linear` }}>
          <div style={{ transform: `scaleX(${w.dir})`, transition: 'transform .2s' }}>
            <div className={trickInfo?.cls}>
              <PetDog breed="shiba" age={age} mood={mood} pose={pose} outfit={outfit} />
            </div>
          </div>
          {floats.map(f => <span key={f.id} className="pet-float absolute left-1/2 -translate-x-1/2 top-0 text-[12px] font-bold text-[#E0605A] whitespace-nowrap">{f.text}</span>)}
          {trick && <span className="pet-bubble absolute left-1/2 -translate-x-1/2 -top-5 text-[11px] bg-white border border-[#E8E8E4] rounded-full px-2 py-0.5 whitespace-nowrap shadow-sm">{learnedTricks(s.train_total).find(t => t.key === trick)?.say}</span>}
        </div>
      </div>
      {/* 밥 */}
      <div className="mt-2.5 rounded-lg bg-[#FFF8EC] px-3 py-2 text-[12px] text-[#6B5B3E] flex items-center justify-between gap-2">
        <span className="min-w-0">{mealLine}</span>
        {open && (
          <button onClick={feed} disabled={fedNow || !!busy} className="flex-shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[#F0A24A] text-white disabled:opacity-40">{fedNow ? '줬어요' : '한 숟갈'}</button>
        )}
      </div>
      {/* 개인 행동 */}
      <div className={`mt-2 grid gap-1.5 ${age >= 31 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <Act icon="🦴" label="간식" {...unlockLeft(s, 'snack')} busy={busy === 'snack'} onClick={() => run('snack', null, 'happy', 'sit')} />
        <Act icon="🎾" label="놀기" {...unlockLeft(s, 'play')} busy={busy === 'play'} onClick={() => run('play', null, 'happy', 'jump')} />
        <Act icon="✋" label="쓰담" {...unlockLeft(s, 'pat')} busy={busy === 'pat'} onClick={() => run('pat', null, 'happy', 'sit')} />
        <Act icon="🦮" label="산책" left={walkLeft} busy={false} onClick={onWalk} />
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

function Header({ pet, rank, age, stage, total, onRoom }: { pet: string; rank: string; age: number; stage: string; total: number; onRoom: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      <button onClick={onRoom} className="text-left min-w-0 group" title="자세히 보기">
        <p className="text-[14px] font-semibold text-[#1F1F1D] truncate">🐶 <span className="text-[11.5px] font-semibold text-[#C27A2C] bg-[#FFF1DE] rounded px-1 py-[1px] mr-1">{rank}</span>{pet} <span className="text-[11.5px] font-medium text-[#9C9C96]">D+{age} · {stage}</span> <span className="text-[11px] text-[#C4C4BE] group-hover:text-[#6B6B66]">›</span></p>
      </button>
      <span className="text-[11px] text-[#9C9C96] flex-shrink-0">❤ {total}</span>
    </div>
  )
}

function Act({ icon, label, left, next, busy, onClick }: { icon: string; label: string; left: number; next?: string | null; busy: boolean; onClick: () => void }) {
  // next: 오늘 남은 횟수는 있는데 아직 안 열린 경우 다음 열리는 시각
  return (
    <button onClick={onClick} disabled={left <= 0 || busy} title={next ? `${next}에 하나 더 열려요` : undefined}
      className={`rounded-lg border border-[#E8E8E4] py-1.5 text-[11.5px] hover:bg-[#F7F7F5] transition-colors disabled:cursor-default ${next ? 'disabled:opacity-60' : 'disabled:opacity-35'}`}>
      <div className={`text-[16px] leading-none mb-0.5 ${next ? 'grayscale opacity-50' : ''}`}>{icon}</div>
      {next ? <span className="text-[10.5px] text-[#8A6A3A]">⏰ {next}</span> : <>{label} <span className="text-[#9C9C96]">{Math.max(0, left)}</span></>}
    </button>
  )
}
