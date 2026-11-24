'use client'

// 🦮 산책 미니게임(약 20초) — 고양이·비둘기·옆집 개·치킨·전봇대가 지나가면 강아지가 끌려간다.
// [꽉 잡기](Space/↑/버튼)로 목줄 게이지를 내린다. 게이지가 끝까지 차면 실패 → 진흙 범벅 속상한 얼굴.
// 프레임 루프는 이 창이 열려 '하는 중'일 때만 돈다. 결과는 끝난 순간 한 번만 pet_act('walk')로 보낸다.
import { useCallback, useEffect, useRef, useState } from 'react'
import PetDog from '@/components/pet/PetDog'
import { petAct, type PetState } from '@/lib/pet'

type Cause = 'cat' | 'pigeon' | 'dog' | 'chicken' | 'pole'
const THINGS: Record<Cause, { icon: string; pull: number; fail: string }> = {
  cat: { icon: '🐈', pull: 1.3, fail: '…고양이가 먼저 도망갔어요. 미안해요 멍 🥺' },
  pigeon: { icon: '🐦', pull: 1.0, fail: '비둘기는… 비둘기는 못 참아요… (진흙 범벅)' },
  dog: { icon: '🐕', pull: 1.2, fail: '옆집 개가 먼저 짖었다고요!! (억울)' },
  chicken: { icon: '🍗', pull: 1.5, fail: '치킨 냄새가 나서… 그만… 🍗' },
  pole: { icon: '🪧', pull: 0.8, fail: '전봇대에 볼일이 너무 많았어요… 🚽' },
}
const CAUSES = Object.keys(THINGS) as Cause[]
const DURATION = 20
const DOG_X = 30 // %
const PULL_RATE = 42 // 게이지/초 (pull 1 기준)
const PRESS = 18

type Item = { id: number; kind: Cause; x: number; speed: number }
type View = { t: number; tension: number; items: Item[]; poop: { x: number; until: number } | null; picked: boolean; lean: boolean }

// timeScale·onResult 는 목업 시험용(기본 1 · 실제 기록)
export default function PetWalkGame({ state, onClose, timeScale = 1, onResult }: { state: PetState; onClose: () => void; timeScale?: number; onResult?: (success: boolean) => Promise<{ ok: true; points: number } | { ok: false; error: string }> }) {
  const pet = state.pet!
  const attempts = state.mine.walk ?? 0
  const [phase, setPhase] = useState<'ready' | 'play' | 'result'>('ready')
  const [view, setView] = useState<View>({ t: 0, tension: 0, items: [], poop: null, picked: false, lean: false })
  const [result, setResult] = useState<{ success: boolean; cause: Cause | null; points: number | null; error: string | null; picked: boolean } | null>(null)
  const [tries, setTries] = useState(attempts)
  const g = useRef({ t: 0, tension: 0, items: [] as Item[], nextSpawn: 1.2, id: 0, poopAt: 10, poop: null as View['poop'], picked: false, last: 0, raf: 0, ended: false })

  const finish = useCallback(async (success: boolean, cause: Cause | null) => {
    const s = g.current
    if (s.ended) return
    s.ended = true
    cancelAnimationFrame(s.raf)
    setPhase('result')
    setResult({ success, cause, points: null, error: null, picked: s.picked })
    const r = onResult ? await onResult(success) : await petAct('walk', null, success)
    setTries(n => n + 1)
    setResult(prev => prev && ({ ...prev, points: r.ok ? r.points : null, error: r.ok ? null : r.error }))
  }, [onResult])

  const begin = () => {
    g.current = { t: 0, tension: 0, items: [], nextSpawn: 1.2, id: 0, poopAt: 8 + Math.random() * 5, poop: null, picked: false, last: performance.now(), raf: 0, ended: false }
    setResult(null)
    setPhase('play')
  }

  // 프레임 루프(하는 중일 때만)
  useEffect(() => {
    if (phase !== 'play') return
    const s = g.current
    let lastPaint = 0
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000) * timeScale
      s.last = now
      s.t += dt
      // 생성
      s.nextSpawn -= dt
      if (s.nextSpawn <= 0) {
        const kind = CAUSES[Math.floor(Math.random() * CAUSES.length)]
        s.items.push({ id: ++s.id, kind, x: 104, speed: 20 + Math.random() * 12 + s.t * 0.4 })
        s.nextSpawn = 1.5 + Math.random() * 1.3 - Math.min(0.5, s.t * 0.02)
      }
      // 이동·당김
      let pull = 0
      let near: Cause | null = null
      for (const it of s.items) {
        it.x -= it.speed * dt
        if (Math.abs(it.x - (DOG_X + 6)) < 13) { pull += THINGS[it.kind].pull; near = it.kind }
      }
      s.items = s.items.filter(it => it.x > -10)
      s.tension = Math.max(0, s.tension + (pull > 0 ? pull * PULL_RATE : -10) * dt)
      // 똥 이벤트(줍기는 보너스 말풍선만)
      if (!s.poop && !s.picked && s.t >= s.poopAt) s.poop = { x: DOG_X - 8, until: s.t + 2.6 }
      if (s.poop && s.t > s.poop.until) s.poop = null
      if (s.tension >= 100) { void finish(false, near ?? 'cat'); return }
      if (s.t >= DURATION) { void finish(true, null); return }
      if (now - lastPaint > 33) {
        lastPaint = now
        setView({ t: s.t, tension: s.tension, items: s.items.map(i => ({ ...i })), poop: s.poop, picked: s.picked, lean: pull > 0 })
      }
      s.raf = requestAnimationFrame(frame)
    }
    s.last = performance.now()
    s.raf = requestAnimationFrame(frame)
    // 다른 탭으로 가면 브라우저가 프레임을 멈추고, 돌아오면 dt 상한(0.05초) 덕분에 그 자리에서 이어진다.
    return () => { cancelAnimationFrame(s.raf) }
  }, [phase, finish, timeScale])

  const hold = useCallback(() => {
    const s = g.current
    if (s.ended) return
    s.tension = Math.max(0, s.tension - PRESS)
  }, [])
  const pick = useCallback(() => {
    const s = g.current
    if (s.ended || !s.poop) return
    s.poop = null
    s.picked = true
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'play') {
        if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); hold() }
        else if (e.key === 'Enter') { e.preventDefault(); pick() }
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, hold, pick, onClose])

  const canRetry = result && !result.success && tries < 2
  const tensionColor = view.tension > 75 ? '#E5534B' : view.tension > 45 ? '#F0A24A' : '#5DBB63'

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && phase !== 'play') onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[560px] p-5 shadow-xl select-none">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[15px] font-bold">🦮 {pet.name}랑 산책</p>
          {phase !== 'play' && <button onClick={onClose} className="text-[#9C9C96] hover:text-[#1F1F1D] text-[18px] leading-none" aria-label="닫기">×</button>}
        </div>

        {/* 길 */}
        <div className="relative rounded-xl overflow-hidden" style={{ height: 170, background: 'linear-gradient(#EAF4FF 0 58%, #DCEFD2 58% 78%, #CFC7B8 78% 100%)' }}>
          {phase === 'play' && view.items.map(it => (
            <span key={it.id} className="absolute text-[30px] leading-none" style={{ left: `${it.x}%`, bottom: it.kind === 'pigeon' ? 58 : 30, transform: 'translateX(-50%)' }}>{THINGS[it.kind].icon}</span>
          ))}
          {phase === 'play' && view.poop && (
            <button onMouseDown={e => { e.preventDefault(); pick() }} className="absolute text-[22px] leading-none animate-bounce" style={{ left: `${view.poop.x}%`, bottom: 26 }} title="줍기(Enter)">💩</button>
          )}
          {/* 강아지 */}
          <div className="absolute" style={{ left: `${DOG_X}%`, bottom: 14, width: 120, transform: `translateX(-50%) rotate(${phase === 'play' && view.lean ? 8 : 0}deg)`, transformOrigin: '30% 100%', transition: 'transform .15s' }}>
            {phase === 'result' && result
              ? <PetDog breed="shiba" age={pet.age} mood={result.success ? 'happy' : 'sad'} pose={result.success ? 'jump' : 'sit'} muddy={!result.success} outfit={pet.outfit as never} />
              : <PetDog breed="shiba" age={pet.age} mood={phase === 'play' && view.tension > 60 ? 'hungry' : 'happy'} pose={phase === 'play' ? 'walk' : 'stand'} outfit={pet.outfit as never} />}
          </div>
          {/* 목줄(사람 손 쪽) */}
          {phase === 'play' && <span className="absolute text-[26px]" style={{ left: '6%', bottom: 40 }}>🧍</span>}
          {phase === 'result' && result && !result.success && result.cause && (
            <span className="absolute text-[28px]" style={{ right: '10%', bottom: 34, animation: 'pet-float 1.6s ease-out forwards' }}>{THINGS[result.cause].icon}💨</span>
          )}
          {phase === 'play' && (
            <div className="absolute left-3 right-3 top-3">
              <div className="flex justify-between text-[11px] text-[#6B6B66] mb-1"><span>목줄 게이지</span><span>{Math.max(0, Math.ceil(DURATION - view.t))}초</span></div>
              <div className="h-2.5 rounded-full bg-white/80 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, view.tension)}%`, background: tensionColor, transition: 'width .05s linear' }} /></div>
            </div>
          )}
        </div>

        {phase === 'ready' && (
          <div className="mt-4 text-[13px] text-[#4A4A45]">
            <p>지나가는 고양이·비둘기·치킨 앞에서 <b>꽉 잡기</b>(Space / ↑ / 버튼)를 연타해 목줄 게이지를 내리세요. 20초 버티면 성공!</p>
            <p className="mt-1 text-[12px] text-[#9C9C96]">💩가 나오면 Enter나 클릭으로 줍기 · 오늘 {tries}/2번 (실패하면 한 번 더)</p>
            <button onClick={begin} disabled={tries >= 2 || (state.mine.walk_success ?? 0) > 0} className="mt-3 w-full rounded-xl bg-[#F0A24A] text-white font-semibold py-2.5 disabled:opacity-40">산책 출발 🐾</button>
          </div>
        )}
        {phase === 'play' && (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button onPointerDown={e => { e.preventDefault(); hold() }} className="rounded-xl bg-[#3F7FD8] text-white font-bold py-3 active:scale-[.98] touch-manipulation">꽉 잡기! (Space)</button>
            <button onPointerDown={e => { e.preventDefault(); pick() }} disabled={!view.poop} className="rounded-xl border border-[#E8E8E4] px-4 text-[13px] disabled:opacity-35 touch-manipulation">💩 줍기</button>
          </div>
        )}
        {phase === 'result' && result && (
          <div className="mt-4">
            <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5 text-[13.5px]">
              {result.success ? `산책 최고! ${pet.name} 신났어요 🐾` : THINGS[result.cause ?? 'cat'].fail}
              {result.success && result.picked && <span className="block text-[12px] text-[#5DBB63] mt-1">💩까지 주운 매너 산책 👍</span>}
            </div>
            <p className="mt-2 text-[12px] text-[#9C9C96]">
              {result.error ? result.error : result.points === null ? '기록하는 중…' : `친밀도 +${result.points}${result.success ? '' : ' (실패해도 같이 걸었으니까)'}`}
            </p>
            <div className="mt-3 flex gap-2">
              {canRetry && <button onClick={begin} className="flex-1 rounded-xl bg-[#F0A24A] text-white font-semibold py-2.5">한 번 더 (오늘 마지막)</button>}
              <button onClick={onClose} className="flex-1 rounded-xl border border-[#E8E8E4] py-2.5 text-[13px]">닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
