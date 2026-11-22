'use client'

// 상단 메뉴줄 "계절 풍경"(팀 나무 계절 도감 보상). 움직이는 연출 없음, 메뉴줄 높이·배치 불변 —
// 부모 header(relative isolate)의 z-[-1] 뒤 층에만 그린다.
// 완성 전(1~5칸): 하늘이 흰색 → 완성 하늘 쪽으로 한 톤씩 물들고, 해·달이 움직이고(겨울 달·여름 해는 떠오르고 가을 해는 내려앉음),
//   눈 점·꽃잎이 늘고, 2칸부터 바닥(눈 언덕·낙엽·풀밭·파도)이 자라고, 모은 아이템이 메뉴줄 양쪽 여백에 놓인다.
// 완성(6칸): 하늘이 통째로 바뀐다 — 겨울 남색 밤하늘(달·별, 글자 흰색) · 가을 노을 · 봄 분홍 새벽 · 여름 파란 하늘.
// 데이터는 TeamTree가 publishSeasonTheme로 알려 준다(@/lib/seasonTheme). 끄기는 팀 나무 도감에서(내 브라우저만).
// 시안: /mock/season-header (2026-11-23 확정안).

import { useActiveSeasonTheme } from '@/lib/seasonTheme'

type Scene = {
  name: string
  ground: string
  groundEdge: string
  sky: string // 완성 하늘
  dusk: string // 완성 전 단계에서 점점 다가가는 하늘색
  dark: boolean // 완성 시 글자 흰색
  extras: 'stars' | 'sun' | 'sunset' | 'petals'
}

// 0 봄 · 1 여름 · 2 가을 · 3 겨울 (TeamTree SEASON_POOLS 순서)
const SCENES: Scene[] = [
  { name: '봄', ground: '#BFE3A4', groundEdge: '#8FC771', sky: 'linear-gradient(90deg,#FFD3E3 0%,#FFE9EF 50%,#FFF3DA 100%)', dusk: '#FFC2D8', dark: false, extras: 'petals' },
  { name: '여름', ground: '#5EC8E0', groundEdge: '#3BA8C4', sky: 'linear-gradient(180deg,#8FDDF3 0%,#D3F4FA 100%)', dusk: '#86D8F0', dark: false, extras: 'sun' },
  { name: '가을', ground: '#E8955A', groundEdge: '#C9703A', sky: 'linear-gradient(90deg,#F7A36A 0%,#FBC88A 55%,#FDE3B0 100%)', dusk: '#F6AE78', dark: false, extras: 'sunset' },
  { name: '겨울', ground: '#FFFFFF', groundEdge: '#C9DDF0', sky: 'linear-gradient(180deg,#1B2F4E 0%,#2C4F7C 100%)', dusk: '#7FA6D1', dark: true, extras: 'stars' },
]

// 메뉴 내용은 가운데 80% 폭 안에 있으니 아이템은 양쪽 10% 여백에만(왼쪽·오른쪽 번갈아).
const SPOTS = [
  { left: 2.5, size: 28, rot: -6, bottom: 5 },
  { left: 94, size: 28, rot: 5, bottom: 5 },
  { left: 6.2, size: 20, rot: 8, bottom: 30 },
  { left: 97.2, size: 20, rot: -8, bottom: 28 },
  { left: 0.4, size: 18, rot: 12, bottom: 34 },
  { left: 90.6, size: 22, rot: -4, bottom: 9 },
]

function Ground({ s, opacity, height }: { s: Scene; opacity: number; height: number }) {
  return (
    <svg className="absolute left-0 right-0 bottom-0 w-full" viewBox="0 0 1000 16" preserveAspectRatio="none" style={{ opacity, height }}>
      <path d="M0 10 C120 2 220 2 330 9 S560 15 700 7 S900 3 1000 9 L1000 16 L0 16 Z" fill={s.groundEdge} opacity="0.55" />
      <path d="M0 12 C150 6 260 7 380 12 S620 15 760 10 S930 8 1000 12 L1000 16 L0 16 Z" fill={s.ground} />
    </svg>
  )
}

function Complete({ kind }: { kind: Scene['extras'] }) {
  if (kind === 'stars') {
    const stars = [[14, 18], [22, 40], [27, 14], [45, 10], [57, 22], [69, 12], [76, 34], [83, 16], [88, 44], [97, 22], [2, 30], [52, 46]]
    return (
      <>
        {stars.map(([x, y], i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{ left: `${x}%`, top: y, width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2, opacity: i % 2 ? 0.55 : 0.9 }} />
        ))}
        <span className="absolute rounded-full" style={{ left: '29%', top: 10, width: 22, height: 22, background: '#FFF4C8', boxShadow: '0 0 18px 4px rgba(255,240,190,0.35)' }} />
        <span className="absolute rounded-full" style={{ left: 'calc(29% + 6px)', top: 7, width: 20, height: 20, background: '#22406A' }} />
      </>
    )
  }
  if (kind === 'sun') {
    return <span className="absolute rounded-full" style={{ left: '28%', top: -14, width: 46, height: 46, background: 'radial-gradient(circle,#FFF6B0 0%,#FFE36E 55%,rgba(255,227,110,0) 72%)' }} />
  }
  if (kind === 'sunset') {
    return <span className="absolute rounded-full" style={{ left: '28%', bottom: 4, width: 54, height: 54, background: 'radial-gradient(circle,#FFE7A8 0%,#FFB867 50%,rgba(255,184,103,0) 72%)' }} />
  }
  const petals = [[16, 12, 20], [24, 36, -30], [47, 8, 40], [58, 40, -10], [71, 16, 60], [86, 30, 15], [98, 10, -40]]
  return (
    <>
      {petals.map(([x, y, r], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: y, width: 7, height: 5, borderRadius: '70% 0 70% 0', background: '#F7A8C4', opacity: 0.7, transform: `rotate(${r}deg)` }} />
      ))}
    </>
  )
}

function Progress({ kind, got }: { kind: Scene['extras']; got: number }) {
  if (kind === 'stars') {
    const dots = [[13, 14], [24, 38], [43, 12], [56, 40], [68, 18], [80, 42], [86, 12], [20, 22], [62, 30], [47, 44]]
    return (
      <>
        <span
          className="absolute rounded-full"
          style={{ left: '29%', top: 50 - got * 8, width: 22, height: 22, boxShadow: 'inset -7px 3px 0 0 #FFF2BF', opacity: 0.45 + got * 0.11, transform: 'rotate(-20deg)' }}
        />
        {dots.slice(0, got * 2).map(([x, y], i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{ left: `${x}%`, top: y, width: 4, height: 4, boxShadow: '0 0 0 1px rgba(110,150,195,0.35)' }} />
        ))}
      </>
    )
  }
  if (kind === 'sun') {
    return <span className="absolute rounded-full" style={{ left: '28%', top: 52 - got * 12, width: 46, height: 46, opacity: 0.4 + got * 0.12, background: 'radial-gradient(circle,#FFF6B0 0%,#FFE36E 55%,rgba(255,227,110,0) 72%)' }} />
  }
  if (kind === 'sunset') {
    return <span className="absolute rounded-full" style={{ left: '28%', top: -46 + got * 9, width: 54, height: 54, opacity: 0.4 + got * 0.12, background: 'radial-gradient(circle,#FFE7A8 0%,#FFB867 50%,rgba(255,184,103,0) 72%)' }} />
  }
  const petals = [[16, 12, 20], [47, 8, 40], [71, 16, 60], [24, 36, -30], [58, 40, -10], [86, 30, 15], [98, 10, -40]]
  return (
    <>
      {petals.slice(0, got + 1).map(([x, y, r], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: y, width: 7, height: 5, borderRadius: '70% 0 70% 0', background: '#F7A8C4', opacity: 0.6, transform: `rotate(${r}deg)` }} />
      ))}
    </>
  )
}

export function SeasonHeaderBand() {
  const t = useActiveSeasonTheme()
  if (!t) return null
  const s = SCENES[t.season]
  const { got, complete } = t
  const dark = complete && s.dark
  return (
    <div aria-hidden className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden select-none">
      <div
        className="absolute inset-0"
        style={{
          background: complete
            ? s.sky
            : `linear-gradient(180deg, color-mix(in srgb, ${s.dusk} ${got * 9}%, white) 0%, color-mix(in srgb, ${s.dusk} ${got * 4}%, white) 100%)`,
        }}
      />
      {complete ? <Complete kind={s.extras} /> : <Progress kind={s.extras} got={got} />}
      {got >= 2 && <Ground s={s} opacity={complete ? 1 : 0.6 + got * 0.08} height={complete ? 16 : 6 + got * 2} />}
      {t.order.slice(0, SPOTS.length).map((e, i) => {
        const p = SPOTS[i]
        return (
          <span
            key={i}
            className="absolute leading-none"
            style={{
              left: `${p.left}%`, bottom: p.bottom, fontSize: p.size, transform: `rotate(${p.rot}deg)`,
              filter: dark ? 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))',
            }}
          >
            {e}
          </span>
        )
      })}
    </div>
  )
}

// '인사관리팀' 옆 완성 칩 — 완성 전에는 아무것도 없다(아이템은 메뉴줄 양쪽 여백에 놓인다).
export function SeasonCompleteChip() {
  const t = useActiveSeasonTheme()
  if (!t || !t.complete) return null
  const s = SCENES[t.season]
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.dark ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-white/70 text-gray-800 ring-1 ring-black/5'}`}>
      🏅 {s.name} 완성
    </span>
  )
}

// 완성된 하늘이 어두운 계절(겨울)이면 메뉴줄 글자를 흰색으로.
export function useSeasonHeaderDark(): boolean {
  const t = useActiveSeasonTheme()
  return !!t && t.complete && SCENES[t.season].dark
}
