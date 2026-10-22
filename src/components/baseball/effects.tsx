'use client'

// 이펙트 자리 아이템 그림 — 캐릭터 옆 작은 장식(EffectBadge: 장비함·운동장·선수 카드)과
// 홈런 세리머니(HomerCeremony: 경기 화면 전체, 전광판 HOME RUN! 동안 k 0→1).
// 아이템: 응원가(음표) · 홈런 불꽃 · 칼퇴 꽃가루 · 우승 반지. 색은 그 아이템의 구단 색.

import type { GearPart, KboTeam } from '@/lib/baseballGear'

type EffectPart = Extract<GearPart, 'notes' | 'firework' | 'confetti' | 'ring'>
export function isEffectPart(part: string | null | undefined): part is EffectPart {
  return part === 'notes' || part === 'firework' || part === 'confetti' || part === 'ring'
}

const GOLD = '#D4A017'
const colorsOf = (t: KboTeam) => [t.primary === '#FFFFFF' ? t.secondary : t.primary, t.secondary, GOLD, t.cap]

// 고정 의사난수(렌더마다 같은 배치)
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

// 캐릭터 미리보기(GearPreview viewBox 10 4 64 80) 위에 얹는 작은 장식. 머리 (40,27) r9, 손 (47,46)
export function EffectBadge({ part, team }: { part: EffectPart; team: KboTeam }) {
  const [c1, c2] = colorsOf(team)
  if (part === 'notes') {
    return (
      <g fontWeight="900" fill={c1}>
        <text x="52" y="20" fontSize="9">♪<animate attributeName="y" values="20;17;20" dur="1.6s" repeatCount="indefinite" /></text>
        <text x="58" y="27" fontSize="7" fill={c2}>♫<animate attributeName="y" values="27;24;27" dur="1.9s" repeatCount="indefinite" /></text>
      </g>
    )
  }
  if (part === 'firework') {
    return (
      <g>
        {[{ x: 22, y: 14, r: 5, c: c1 }, { x: 59, y: 12, r: 4, c: GOLD }].map((b, j) => (
          <g key={j} stroke={b.c} strokeWidth="1" strokeLinecap="round">
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2
              return <line key={i} x1={b.x + Math.cos(a) * b.r * 0.4} y1={b.y + Math.sin(a) * b.r * 0.4} x2={b.x + Math.cos(a) * b.r} y2={b.y + Math.sin(a) * b.r} />
            })}
            <animate attributeName="opacity" values="1;0.35;1" dur={j ? '1.3s' : '1.7s'} repeatCount="indefinite" />
          </g>
        ))}
      </g>
    )
  }
  if (part === 'confetti') {
    return (
      <g>
        {Array.from({ length: 9 }, (_, i) => {
          const x = 16 + rnd(i, 1) * 50
          const y = 8 + rnd(i, 2) * 22
          return <rect key={i} x={x} y={y} width="2.4" height="1.4" rx="0.4" fill={colorsOf(team)[i % 4]} transform={`rotate(${rnd(i, 3) * 180} ${x} ${y})`} />
        })}
      </g>
    )
  }
  // 우승 반지: 손에 금반지 + 반짝임
  return (
    <g>
      <circle cx="47" cy="46" r="2.6" fill="none" stroke={GOLD} strokeWidth="1.3" />
      <circle cx="47" cy="43.4" r="1.1" fill={c1} stroke={GOLD} strokeWidth="0.5" />
      <path d="M53 38 L54 40 L56 41 L54 42 L53 44 L52 42 L50 41 L52 40 Z" fill={GOLD}>
        <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
      </path>
    </g>
  )
}

// 홈런 세리머니 — 경기 화면 viewBox(가로 0~W, 세로 top~top+H) 위에 겹친다. k = HOME RUN! 전광판 진행(0→1)
export function HomerCeremony({ part, team, k, W, top, H }: { part: EffectPart; team: KboTeam; k: number; W: number; top: number; H: number }) {
  const colors = colorsOf(team)
  const fade = k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1
  if (part === 'firework') {
    const bursts = [{ x: W * 0.2, y: top + H * 0.22, t0: 0 }, { x: W * 0.5, y: top + H * 0.12, t0: 0.12 }, { x: W * 0.8, y: top + H * 0.25, t0: 0.24 }, { x: W * 0.35, y: top + H * 0.3, t0: 0.4 }, { x: W * 0.66, y: top + H * 0.15, t0: 0.52 }]
    return (
      <g pointerEvents="none" opacity={fade} data-ceremony="firework">
        {bursts.map((b, j) => {
          const t = Math.min(1, Math.max(0, (k - b.t0) / 0.35))
          if (t <= 0) return null
          const r = 10 + 34 * t
          const c = colors[j % colors.length]
          return (
            <g key={j} opacity={1 - t * 0.85} stroke={c} strokeWidth="2.2" strokeLinecap="round">
              {Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2
                return <line key={i} x1={b.x + Math.cos(a) * r * 0.55} y1={b.y + Math.sin(a) * r * 0.55} x2={b.x + Math.cos(a) * r} y2={b.y + Math.sin(a) * r} />
              })}
              <circle cx={b.x} cy={b.y} r={3 * (1 - t)} fill={GOLD} stroke="none" />
            </g>
          )
        })}
      </g>
    )
  }
  if (part === 'confetti') {
    return (
      <g pointerEvents="none" opacity={fade} data-ceremony="confetti">
        {Array.from({ length: 46 }, (_, i) => {
          const x = rnd(i, 4) * W + Math.sin(k * 9 + i) * 8
          const y = top - 10 + ((k * 1.25 + rnd(i, 5) * 1.2) % 1.2) * H
          return <rect key={i} x={x} y={y} width="6" height="3.2" rx="1" fill={colors[i % colors.length]} transform={`rotate(${rnd(i, 6) * 360 + k * 720} ${x + 3} ${y + 1.6})`} />
        })}
      </g>
    )
  }
  if (part === 'notes') {
    return (
      <g pointerEvents="none" opacity={fade} fontWeight="900" data-ceremony="notes">
        {Array.from({ length: 12 }, (_, i) => {
          const x0 = W * (0.08 + rnd(i, 7) * 0.84)
          const t = (k * 1.4 + rnd(i, 8)) % 1
          return (
            <text key={i} x={x0 + Math.sin(t * 6 + i) * 10} y={top + H * (0.95 - t * 0.85)} fontSize={14 + rnd(i, 9) * 10} fill={colors[i % colors.length]} opacity={1 - t * 0.6}>
              {i % 2 ? '♫' : '♪'}
            </text>
          )
        })}
      </g>
    )
  }
  // 우승 반지: 화면 위쪽 가운데 큰 금반지가 커지며 빛줄기 회전
  const s = 1.6 * (0.6 + 0.4 * Math.min(1, k / 0.2))
  const cx = W / 2
  const cy = top + H * 0.28
  return (
    <g pointerEvents="none" opacity={fade} data-ceremony="ring">
      <g transform={`rotate(${k * 120} ${cx} ${cy})`} stroke={GOLD} strokeWidth="2" opacity="0.55">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return <line key={i} x1={cx + Math.cos(a) * 26 * s} y1={cy + Math.sin(a) * 26 * s} x2={cx + Math.cos(a) * 44 * s} y2={cy + Math.sin(a) * 44 * s} />
        })}
      </g>
      <circle cx={cx} cy={cy + 4 * s} r={16 * s} fill="none" stroke={GOLD} strokeWidth={6 * s} />
      <circle cx={cx} cy={cy - 13 * s} r={6 * s} fill={colors[0]} stroke={GOLD} strokeWidth={2 * s} />
    </g>
  )
}
