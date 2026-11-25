'use client'

// 🦮 산책 미니게임(20초) — 버튼 하나(클릭·탭·Space)로 한다.
//  · 평소: 돌·웅덩이·💩가 굴러오면 눌러서 점프. 3번 걸리면 실패(진흙 범벅).
//  · 고양이·비둘기·치킨이 나타나면 목줄 게이지가 빠르게 차오른다 → 막 연타해서 꽉 잡기. 끝까지 차면 실패.
// 프레임 루프는 '하는 중'일 때만 돈다. 결과는 끝난 순간 한 번만 pet_act('walk')로 보낸다.
import { useCallback, useEffect, useRef, useState } from 'react'
import PetDog from '@/components/pet/PetDog'
import { hhmm, petAct, walkLeft, type PetState } from '@/lib/pet'

type Lure = 'cat' | 'pigeon' | 'dog' | 'chicken' | 'pole'
type Cause = Lure | 'trip'
const LURES: Record<Lure, { icon: string; pull: number; shout: string; fail: string }> = {
  cat: { icon: '🐈', pull: 1.2, shout: '고양이다!!', fail: '…고양이가 먼저 도망갔어요. 미안해요 멍 🥺' },
  pigeon: { icon: '🐦', pull: 1.0, shout: '비둘기!!', fail: '비둘기는… 비둘기는 못 참아요… (진흙 범벅)' },
  dog: { icon: '🐕', pull: 1.1, shout: '옆집 개!!', fail: '옆집 개가 먼저 짖었다고요!! (억울)' },
  chicken: { icon: '🍗', pull: 1.4, shout: '치킨 냄새!!', fail: '치킨 냄새가 나서… 그만… 🍗' },
  pole: { icon: '🪧', pull: 0.8, shout: '전봇대!!', fail: '전봇대에 볼일이 너무 많았어요… 🚽' },
}
const TRIP_FAIL = '돌부리·웅덩이에 세 번 철퍽… 진흙 범벅이 됐어요 🥺'
type Obs = 'rock' | 'puddle' | 'poop' | 'cone' | 'leaf'
const OBS_ICON: Record<Exclude<Obs, 'puddle'>, string> = { rock: '🪨', poop: '💩', cone: '🚧', leaf: '🍂' }

// 구간(5초씩) — 갈수록 빨라지고 장애물·유혹이 잦아진다. 배경·소품·잘 나오는 유혹도 바뀐다.
type Scene = { name: string; tip: string; sky: string; ground: string; road: string; line: string; props: string[]; obs: Obs[]; lures: Lure[]; gap: number; dbl: number; pull: number; lureGap: number; lureDur: number }
const SCENES: Scene[] = [
  { name: '🏠 동네 골목', tip: '고양이 조심', sky: 'linear-gradient(#EAF4FF, #F6FAFF)', ground: '#DCEFD2', road: '#CFC7B8', line: '#B8AE9C', props: ['🏠', '🌳', '🏪', '🏠', '🚲', '🏡'], obs: ['rock', 'puddle', 'poop'], lures: ['cat', 'cat', 'dog', 'pole'], gap: 1.75, dbl: 0, pull: 1, lureGap: 3.3, lureDur: 2.0 },
  { name: '🌳 공원', tip: '비둘기 떼 출몰', sky: 'linear-gradient(#DDF2FF, #F2FBFF)', ground: '#BFE3A5', road: '#D8C79E', line: '#BFAE84', props: ['🌳', '🌲', '🌷', '⛲', '🌳', '🌼'], obs: ['puddle', 'leaf', 'poop'], lures: ['pigeon', 'pigeon', 'dog', 'cat'], gap: 1.45, dbl: 0, pull: 1.05, lureGap: 2.9, lureDur: 2.2 },
  { name: '🍢 시장 골목', tip: '치킨 냄새 주의', sky: 'linear-gradient(#FFF3D6, #FFFAEE)', ground: '#EBD7B5', road: '#C9C1B6', line: '#A99F92', props: ['🏪', '🍢', '🏮', '🏬', '🧺', '🏮'], obs: ['cone', 'rock', 'poop'], lures: ['chicken', 'chicken', 'cat', 'dog'], gap: 1.2, dbl: 0.25, pull: 1.12, lureGap: 2.6, lureDur: 2.3 },
  { name: '🌇 노을 강변', tip: '마지막! 버텨요', sky: 'linear-gradient(#FFC8A2, #FFE6C9)', ground: '#9FCFD3', road: '#BDAE9E', line: '#9E8F7E', props: ['🌉', '🌾', '🚲', '🌇', '🌾', '⛵'], obs: ['rock', 'puddle', 'leaf', 'cone'], lures: ['dog', 'chicken', 'pigeon', 'cat'], gap: 1.0, dbl: 0.4, pull: 1.2, lureGap: 2.3, lureDur: 2.4 },
]
const SCENE_LEN = 5
const sceneAt = (t: number) => Math.min(SCENES.length - 1, Math.floor(t / SCENE_LEN))
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const DURATION = 20
const DOG_X = 26 // %
const RISE = 62 // 유혹이 있을 때 게이지/초 (pull 1 기준)
const DROP = 45 // 유혹이 없을 때 내려가는 속도/초
const PRESS = 11 // 한 번 누를 때 내려가는 양
const JUMP_DUR = 0.62
const JUMP_H = 62 // px
const HEARTS = 3

type ObsItem = { id: number; kind: Obs; x: number; hit: boolean }
type LureNow = { kind: Lure; start: number; until: number; pull: number }
type View = { t: number; tension: number; hearts: number; obs: ObsItem[]; lure: LureNow | null; y: number; flash: boolean; scroll: number; mash: number }

const EMPTY_VIEW: View = { t: 0, tension: 0, hearts: HEARTS, obs: [], lure: null, y: 0, flash: false, scroll: 0, mash: 0 }
const fresh = () => ({ t: 0, tension: 0, hearts: HEARTS, obs: [] as ObsItem[], lure: null as LureNow | null, nextObs: 1.4, nextLure: 4.5, jumpT: -1, flashUntil: 0, scroll: 0, id: 0, mash: 0, last: 0, raf: 0, ended: false })

// timeScale·onResult 는 목업 시험용(기본 1 · 실제 기록)
export default function PetWalkGame({ state, onClose, timeScale = 1, onResult }: { state: PetState; onClose: () => void; timeScale?: number; onResult?: (success: boolean) => Promise<{ ok: true; points: number } | { ok: false; error: string }> }) {
  const pet = state.pet!
  // 깜짝 산책 창(10분)마다 한 번 — 창은 열 때 고정한다(게임 중 닫혀도 결과는 서버가 5분 더 받아 줌)
  const [win] = useState(() => state.walk)
  const canStart = walkLeft(state) > 0
  const [phase, setPhase] = useState<'ready' | 'play' | 'result'>('ready')
  const [view, setView] = useState<View>(EMPTY_VIEW)
  const [result, setResult] = useState<{ success: boolean; cause: Cause | null; points: number | null; error: string | null } | null>(null)
  const g = useRef(fresh())

  const finish = useCallback(async (success: boolean, cause: Cause | null) => {
    const s = g.current
    if (s.ended) return
    s.ended = true
    cancelAnimationFrame(s.raf)
    setPhase('result')
    setResult({ success, cause, points: null, error: null })
    const r = onResult ? await onResult(success) : await petAct('walk', win?.slot ?? null, success)
    setResult(prev => prev && ({ ...prev, points: r.ok ? r.points : null, error: r.ok ? null : r.error }))
  }, [onResult, win])

  const begin = () => {
    g.current = { ...fresh(), last: performance.now() }
    setView(EMPTY_VIEW)
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
      const sc = SCENES[sceneAt(s.t)]
      const speed = 28 + s.t * 1.1 // %/초 (끝에 약 50)
      s.scroll += speed * dt

      // 유혹(고양이 등) — 근처에 장애물이 없을 때만 나온다
      if (!s.lure && s.t >= s.nextLure) {
        const busy = s.obs.some(o => o.x > DOG_X - 8 && o.x < DOG_X + 30)
        if (busy) s.nextLure = s.t + 0.3
        else {
          const dur = sc.lureDur + Math.random() * 0.4
          const kind = pick(sc.lures)
          s.lure = { kind, start: s.t, until: s.t + dur, pull: LURES[kind].pull * sc.pull }
          s.nextLure = s.t + dur + sc.lureGap + Math.random() * 1.2
          s.nextObs = Math.max(s.nextObs, s.t + dur + 0.9)
          s.obs = s.obs.filter(o => o.x < DOG_X) // 유혹 중엔 점프를 못 하니 앞에 오던 장애물은 치운다
        }
      }
      if (s.lure && s.t >= s.lure.until) s.lure = null

      // 장애물 — 유혹 중에는 안 나온다
      if (!s.lure && s.t >= s.nextObs && s.t < DURATION - 1.2) {
        s.obs.push({ id: ++s.id, kind: pick(sc.obs), x: 104, hit: false })
        // 연속 장애물(뒤 구간) — 한 번 점프로 둘 다 넘을 수 있는 간격
        if (Math.random() < sc.dbl) s.obs.push({ id: ++s.id, kind: pick(sc.obs), x: 112, hit: false })
        s.nextObs = s.t + sc.gap + Math.random() * 0.8
      }

      // 점프 높이
      let y = 0
      if (s.jumpT >= 0) {
        s.jumpT += dt
        if (s.jumpT >= JUMP_DUR) s.jumpT = -1
        else { const p = s.jumpT / JUMP_DUR; y = JUMP_H * 4 * p * (1 - p) }
      }

      // 이동·충돌
      for (const o of s.obs) {
        o.x -= speed * dt
        if (!o.hit && Math.abs(o.x - DOG_X) < 3.5 && y < 14) {
          o.hit = true
          s.hearts -= 1
          s.flashUntil = s.t + 0.6
        }
      }
      s.obs = s.obs.filter(o => o.x > -8)

      // 목줄 게이지
      s.tension = s.lure ? s.tension + s.lure.pull * RISE * dt : Math.max(0, s.tension - DROP * dt)

      if (s.hearts <= 0) { void finish(false, 'trip'); return }
      if (s.tension >= 100) { void finish(false, s.lure?.kind ?? 'cat'); return }
      if (s.t >= DURATION) { void finish(true, null); return }
      if (now - lastPaint > 33) {
        lastPaint = now
        setView({ t: s.t, tension: s.tension, hearts: s.hearts, obs: s.obs.map(o => ({ ...o })), lure: s.lure, y, flash: s.t < s.flashUntil, scroll: s.scroll, mash: s.mash })
      }
      s.raf = requestAnimationFrame(frame)
    }
    s.last = performance.now()
    s.raf = requestAnimationFrame(frame)
    // 다른 탭으로 가면 브라우저가 프레임을 멈추고, 돌아오면 dt 상한(0.05초) 덕분에 그 자리에서 이어진다.
    return () => { cancelAnimationFrame(s.raf) }
  }, [phase, finish, timeScale])

  // 버튼 하나: 유혹 중이면 꽉 잡기(게이지↓), 아니면 점프
  const act = useCallback(() => {
    const s = g.current
    if (s.ended) return
    if (s.lure) { s.tension = Math.max(0, s.tension - PRESS); s.mash += 1 }
    else if (s.jumpT < 0) s.jumpT = 0
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'play') {
        if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) act() }
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, act, onClose])

  const tensionColor = view.tension > 70 ? '#E5534B' : view.tension > 40 ? '#F0A24A' : '#5DBB63'
  const lure = phase === 'play' ? view.lure : null
  const lureX = lure ? Math.max(DOG_X + 40, 86 - (view.t - lure.start) * 30) : 0
  const jumpSoon = phase === 'play' && !lure && view.obs.some(o => !o.hit && o.x > DOG_X + 2 && o.x < DOG_X + 22)
  const failText = result?.cause === 'trip' ? TRIP_FAIL : LURES[(result?.cause as Lure) ?? 'cat']?.fail
  const si = sceneAt(view.t)
  const sceneBanner = phase === 'play' && view.t - si * SCENE_LEN < 1.4
  const failIcon = result?.cause === 'trip' ? '🪨' : result?.cause ? LURES[result.cause as Lure].icon : ''

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && phase !== 'play') onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[560px] p-5 shadow-xl select-none">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[15px] font-bold">🦮 {pet.name}랑 산책</p>
          {phase !== 'play' && <button onClick={onClose} className="text-[#9C9C96] hover:text-[#1F1F1D] text-[18px] leading-none" aria-label="닫기">×</button>}
        </div>

        {/* 길 — 누르면 점프/꽉 잡기 */}
        <div
          className="relative rounded-xl overflow-hidden touch-manipulation"
          style={{ height: 190, background: '#EAF4FF', cursor: phase === 'play' ? 'pointer' : 'default' }}
          onPointerDown={e => { if (phase === 'play') { e.preventDefault(); act() } }}
        >
          {/* 배경 구간(겹쳐 두고 지금 구간만 보이게 — 바뀔 때 스르륵) */}
          {SCENES.map((sc, i) => (
            <div key={sc.name} className="absolute inset-0" style={{ opacity: (phase === 'play' ? si : 0) === i ? 1 : 0, transition: 'opacity .9s' }}>
              <div className="absolute inset-0" style={{ background: sc.sky }} />
              {i === 3 && <div className="absolute rounded-full" style={{ right: '14%', top: 40, width: 34, height: 34, background: '#FF9A6B', opacity: 0.85 }} />}
              {sc.props.map((pr, k) => {
                const x = ((((k * 22 - view.scroll * 0.35) % 132) + 132) % 132) - 16
                return <span key={k} className="absolute leading-none" style={{ left: `${x}%`, bottom: 66, fontSize: 30, opacity: 0.75 }}>{pr}</span>
              })}
              <div className="absolute left-0 right-0" style={{ bottom: 44, height: 26, background: sc.ground }} />
              <div className="absolute left-0 right-0 bottom-0" style={{ height: 46, background: sc.road }} />
              <div className="absolute left-0 right-0" style={{ bottom: 20, height: 3, backgroundImage: `repeating-linear-gradient(90deg, ${sc.line} 0 18px, transparent 18px 40px)`, backgroundPosition: `${-view.scroll * 5.2}px 0` }} />
            </div>
          ))}

          {/* 장애물 */}
          {phase === 'play' && view.obs.map(o => (
            o.kind === 'puddle'
              ? <span key={o.id} className="absolute rounded-[50%]" style={{ left: `${o.x}%`, bottom: 14, width: 46, height: 12, transform: 'translateX(-50%)', background: o.hit ? '#8B6A45' : '#7FB2E5', opacity: 0.9 }} />
              : <span key={o.id} className="absolute leading-none" style={{ left: `${o.x}%`, bottom: 14, fontSize: 26, transform: 'translateX(-50%)', opacity: o.hit ? 0.4 : 1 }}>{OBS_ICON[o.kind]}</span>
          ))}

          {/* 유혹 등장 */}
          {lure && (
            <>
              <span className="absolute leading-none" style={{ left: `${lureX}%`, bottom: lure.kind === 'pigeon' ? 70 : 22, fontSize: 38, transform: 'translateX(-50%)', animation: 'pet-hop .4s ease-in-out infinite' }}>{LURES[lure.kind].icon}</span>
              <span className="absolute rounded-full bg-white border border-[#E5534B] px-2 py-0.5 text-[12px] font-bold text-[#E5534B] whitespace-nowrap" style={{ left: `${lureX}%`, bottom: (lure.kind === 'pigeon' ? 70 : 22) + 44, transform: 'translateX(-50%)' }}>{LURES[lure.kind].shout}</span>
            </>
          )}

          {/* 강아지 */}
          <div className="absolute" style={{ left: `${DOG_X}%`, bottom: 12, width: 116, transform: `translate(-50%, ${-view.y}px) rotate(${lure ? 9 : 0}deg)`, transformOrigin: '30% 100%', opacity: view.flash && phase === 'play' ? (Math.floor(view.t * 10) % 2 ? 0.45 : 1) : 1 }}>
            {phase === 'result' && result
              ? <PetDog breed="shiba" age={pet.age} mood={result.success ? 'happy' : 'sad'} pose={result.success ? 'jump' : 'sit'} muddy={!result.success} outfit={pet.outfit as never} />
              : <PetDog breed="shiba" age={pet.age} mood={phase === 'play' && view.tension > 55 ? 'hungry' : 'happy'} pose={phase === 'play' ? (view.y > 2 ? 'jump' : 'walk') : 'stand'} outfit={pet.outfit as never} />}
          </div>
          {phase === 'play' && view.flash && <span className="absolute text-[13px] font-bold text-[#8B6A45]" style={{ left: `${DOG_X + 8}%`, bottom: 92 }}>철퍽!</span>}

          {/* 구간 바뀜 알림 */}
          {sceneBanner && (
            <span key={`sc${si}`} className="absolute left-1/2 rounded-full bg-white/90 px-3 py-1 text-[12.5px] font-bold text-[#4A4A45] shadow-sm whitespace-nowrap" style={{ top: 30, transform: 'translateX(-50%)', animation: 'pet-mash .35s ease-out' }}>
              {SCENES[si].name} <span className="font-normal text-[#8A6A3A]">· {si > 0 ? `더 빨라져요! ${SCENES[si].tip}` : SCENES[si].tip}</span>
            </span>
          )}

          {/* 위: 하트 · 게이지 · 시간 */}
          {phase === 'play' && (
            <div className="absolute left-3 right-3 top-2.5 flex items-center gap-2 text-[11px] text-[#6B6B66]">
              <span className="text-[13px] tracking-tight text-[#E5534B]">{'♥'.repeat(view.hearts)}<span className="text-[#C9C9C3]">{'♥'.repeat(HEARTS - view.hearts)}</span></span>
              <span className="ml-1">목줄</span>
              <div className="flex-1 h-2.5 rounded-full bg-white/80 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, view.tension)}%`, background: tensionColor }} /></div>
              <span className="text-[10.5px] text-[#9C9C96]">{si + 1}/{SCENES.length}</span>
              <span className="w-7 text-right">{Math.max(0, Math.ceil(DURATION - view.t))}초</span>
            </div>
          )}

          {/* 지금 뭘 해야 하는지 */}
          {phase === 'play' && (lure || jumpSoon) && (
            <span key={lure ? `m${view.mash}` : 'j'} className={`absolute left-1/2 rounded-full px-3 py-1 text-[13px] font-extrabold text-white shadow ${lure ? 'bg-[#E5534B]' : 'bg-[#3F7FD8]'}`} style={{ top: 64, transform: 'translateX(-50%)', animation: lure ? 'pet-mash .18s ease-out' : undefined }}>
              {lure ? '연타!! 꽉 잡아!' : '지금 점프!'}
            </span>
          )}

          {phase === 'result' && result && !result.success && (
            <span className="absolute text-[28px]" style={{ right: '12%', bottom: 34, animation: 'pet-float 1.6s ease-out forwards' }}>{failIcon}💨</span>
          )}
        </div>

        {phase === 'ready' && (
          <div className="mt-4 text-[13px] text-[#4A4A45]">
            <p className="font-semibold">버튼 하나(클릭 · 탭 · Space)로 해요</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
              <div className="rounded-xl bg-[#EEF5FF] px-3 py-2"><b className="text-[#3F7FD8]">🪨 💩 굴러오면</b><br />한 번 눌러서 점프<br /><span className="text-[#9C9C96]">3번 걸리면 실패</span></div>
              <div className="rounded-xl bg-[#FFF0EE] px-3 py-2"><b className="text-[#E5534B]">🐈 🍗 나타나면</b><br />막 연타해서 목줄 꽉!<br /><span className="text-[#9C9C96]">게이지 끝까지 차면 실패</span></div>
            </div>
            <p className="mt-2 text-[12px] text-[#9C9C96]">골목 → 공원 → 시장 → 강변, 갈수록 빨라져요 · 20초 버티면 성공 · {win ? `${hhmm(win.close_at)}까지 열린 산책, 한 번만!` : '지금은 산책 시간이 아니에요 — 깜짝 알림을 기다려 주세요'}</p>
            <button onClick={begin} disabled={!canStart && !onResult} className="mt-3 w-full rounded-xl bg-[#F0A24A] text-white font-semibold py-2.5 disabled:opacity-40">산책 출발 🐾</button>
          </div>
        )}
        {phase === 'play' && (
          <button onPointerDown={e => { e.preventDefault(); act() }}
            className={`mt-4 w-full rounded-xl text-white font-bold py-3.5 active:scale-[.98] touch-manipulation ${lure ? 'bg-[#E5534B]' : 'bg-[#3F7FD8]'}`}>
            {lure ? '연타!! 꽉 잡기 (Space)' : '점프 (Space · 클릭)'}
          </button>
        )}
        {phase === 'result' && result && (
          <div className="mt-4">
            <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5 text-[13.5px]">
              {result.success ? `산책 최고! ${pet.name} 신났어요 🐾` : failText}
            </div>
            <p className="mt-2 text-[12px] text-[#9C9C96]">
              {result.error ? result.error : result.points === null ? '기록하는 중…' : `친밀도 +${result.points}${result.success ? '' : ' (실패해도 같이 걸었으니까)'}`}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-[#E8E8E4] py-2.5 text-[13px]">닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
