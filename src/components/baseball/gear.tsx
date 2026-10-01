'use client'

// 졸라맨에 입히는 KBO 장비 SVG 조각 — 필드 장면(scene.tsx)과 장비함 미리보기가 같이 쓴다.
// 장착 안 한 부위는 기존 기본 장비(파란 헬멧·갈색 방망이·유니폼 없음) 그대로.

import { useId } from 'react'
import { logoUrl, teamOf, type Equip, type KboTeam } from '@/lib/baseballGear'

type Pt = { x: number; y: number }

// 모자: 머리 위 반구 + 챙(facing 쪽). 로고는 모자 앞쪽에.
export function CapShape(props: { cx: number; cy: number; r: number; facing: 1 | -1; team: KboTeam | null; fallback: string }) {
  const { cx, cy, r, facing, team } = props
  const fill = team?.cap ?? props.fallback
  const y0 = cy - r * 0.18
  const brimTip = cx + facing * (r + r * 0.3)
  // 구단 모자는 로고가 들어가도록 크라운을 둥글게 높인다(기본 헬멧은 예전 모양 그대로)
  const crown = team
    ? `C${cx - r} ${cy - r * 1.25} ${cx + r} ${cy - r * 1.25} ${cx + r} ${y0}`
    : `Q${cx} ${cy - r * 1.42} ${cx + r} ${y0}`
  const d = `M${cx - r} ${y0} ${crown} L${brimTip} ${y0 + r * 0.12} L${cx - facing * r} ${y0 + r * 0.12} Z`
  const logoW = r * 1.05
  const logoH = r * 0.78
  // 로고에 사각 배경이 붙은 구단(삼성·한화·KT 등)도 모자 밖으로 삐져나오지 않게 모자 모양으로 자른다
  const clipId = `cap-${useId().replace(/:/g, '')}`
  return (
    <g>
      <defs>
        <clipPath id={clipId}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={fill} />
      {team && (
        <image clipPath={`url(#${clipId})`} href={logoUrl(team.key)} x={cx + facing * r * 0.08 - logoW / 2} y={cy - r * 0.97} width={logoW} height={logoH} preserveAspectRatio="xMidYMid meet" />
      )}
    </g>
  )
}

// 유니폼 저지: 어깨(a)→엉덩이(b) 축 기준 로컬 좌표(x=가로, y=몸통 아래 방향)로 그린 뒤 회전해 붙인다.
// 반팔 소매(구단 색 트림) · 둥근 목선 · 단추선 · 가슴 글씨 · 벨트. LG는 핀스트라이프.
export function JerseyShape(props: { a: Pt; b: Pt; wTop: number; wBottom: number; team: KboTeam; showWordmark?: boolean }) {
  const { a, b, wTop, wBottom, team } = props
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90
  const hw = wTop / 2
  const hb = wBottom / 2
  const side = (k: 1 | -1) => [
    [k * hw, 0.06 * L], [k * hw * 1.5, 0.3 * L], [k * hw * 1.14, 0.43 * L], [k * hw * 0.9, 0.36 * L], [k * hb, L],
  ]
  const left = side(-1)
  const right = side(1).reverse()
  const pts = [...left, ...right].map(([x, y]) => `L${x} ${y}`).join(' ')
  const d = `M${-0.34 * hw} 0 ${pts} L${0.34 * hw} 0 Q0 ${0.24 * L} ${-0.34 * hw} 0 Z`
  const sw = Math.max(0.5, wTop * 0.07)
  const clipId = `jersey-${useId().replace(/:/g, '')}`
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
      <defs>
        <clipPath id={clipId}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={team.jersey} />
      <g clipPath={`url(#${clipId})`}>
        {team.pinstripe && (
          <g stroke={team.secondary} strokeWidth={wTop * 0.03} opacity="0.5">
            {[-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2].map(f => (
              <line key={f} x1={f * hw} y1={0} x2={f * hw} y2={L} />
            ))}
          </g>
        )}
        {/* 소매 끝 트림 */}
        {([-1, 1] as const).map(k => (
          <line key={k} x1={k * hw * 1.5} y1={0.3 * L} x2={k * hw * 1.14} y2={0.43 * L} stroke={team.primary} strokeWidth={sw * 2.6} />
        ))}
        {/* 단추선 */}
        <line x1={0} y1={0.16 * L} x2={0} y2={L} stroke={team.secondary} strokeWidth={sw * 0.7} opacity="0.55" />
        {/* 벨트 */}
        <rect x={-hb * 1.1} y={L * 0.93} width={hb * 2.2} height={L * 0.08} fill={team.secondary} />
      </g>
      <path d={d} fill="none" stroke={team.primary} strokeWidth={sw} strokeLinejoin="round" />
      {/* 목선 트림 */}
      <path d={`M${-0.34 * hw} 0 Q0 ${0.24 * L} ${0.34 * hw} 0`} fill="none" stroke={team.secondary} strokeWidth={sw * 1.6} />
      {props.showWordmark !== false && (
        <text
          x={0} y={0.5 * L} textAnchor="middle" dominantBaseline="middle"
          fontSize={wTop * 0.26} fontWeight="900" fontStyle="italic" fill={team.primary}
          textLength={wTop * Math.min(0.86, 0.17 * team.wordmark.length)} lengthAdjust="spacingAndGlyphs"
        >
          {team.wordmark}
        </text>
      )}
    </g>
  )
}

// 방망이: 가는 손잡이(구단 색 테이프) → 굵은 배럴(구단 방망이 색) + 보조색 띠, 끝은 둥글게.
// 기본 장비(갈색 막대)보다 확실히 두꺼워 장착한 티가 난다.
export function BatShape(props: { hands: Pt; angleRad: number; length: number; team: KboTeam | null; width?: number }) {
  const { hands, angleRad, length, team } = props
  const w = props.width ?? 4
  const ux = Math.cos(angleRad)
  const uy = Math.sin(angleRad)
  const at = (t: number) => ({ x: hands.x + ux * length * t, y: hands.y + uy * length * t })
  const tip = at(1)
  if (!team) {
    return <line x1={hands.x} y1={hands.y} x2={tip.x} y2={tip.y} stroke="#8B5A2B" strokeWidth={w} strokeLinecap="round" />
  }
  // 축을 따라 (t, 반지름) 프로파일 → 양옆 윤곽 다각형
  const seg = (profile: [number, number][]) => {
    const l = profile.map(([t, r]) => { const c = at(t); return `${c.x - uy * r},${c.y + ux * r}` })
    const rr = [...profile].reverse().map(([t, r]) => { const c = at(t); return `${c.x + uy * r},${c.y - ux * r}` })
    return [...l, ...rr].join(' ')
  }
  const R = w * 0.82 // 배럴 반지름
  const body: [number, number][] = [[0, w * 0.34], [0.32, w * 0.36], [0.58, R * 0.92], [0.97, R]]
  return (
    <g>
      <polygon points={seg(body)} fill={team.bat} stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" strokeLinejoin="round" />
      <circle cx={at(0.97).x} cy={at(0.97).y} r={R} fill={team.bat} />
      <polygon points={seg([[0, w * 0.38], [0.32, w * 0.4]])} fill={team.primary} />
      <polygon points={seg([[0.66, R * 0.97], [0.74, R * 0.99]])} fill={team.secondary} />
      {/* 노브 */}
      <circle cx={hands.x - ux * 0.6} cy={hands.y - uy * 0.6} r={w * 0.5} fill={team.primary} />
    </g>
  )
}

// 장비함·선물 미리보기용 정지 자세 졸라맨 타자
export function GearPreview(props: { equip: Equip; size?: number; colorBg?: string; colorFg?: string }) {
  const cap = teamOf(props.equip.cap)
  const uni = teamOf(props.equip.uniform)
  const bat = teamOf(props.equip.bat)
  const size = props.size ?? 96
  const hands = { x: 47, y: 46 }
  const shoulder = { x: 40, y: 38 }
  const hip = { x: 40, y: 62 }
  return (
    <svg viewBox="10 4 64 80" width={size} height={size * 1.25} role="img" aria-label="장비 미리보기">
      <line x1={hip.x} y1={hip.y} x2="33" y2="80" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
      <line x1={hip.x} y1={hip.y} x2="48" y2="80" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
      {uni ? (
        <JerseyShape a={shoulder} b={hip} wTop={13} wBottom={10.5} team={uni} />
      ) : (
        <line x1={shoulder.x} y1={shoulder.y} x2={hip.x} y2={hip.y} stroke="#374151" strokeWidth="3" strokeLinecap="round" />
      )}
      <BatShape hands={hands} angleRad={(-62 * Math.PI) / 180} length={30} team={bat} width={4} />
      <line x1={shoulder.x} y1={shoulder.y + 2} x2={hands.x} y2={hands.y} stroke="#374151" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="27" r="9" fill={props.colorBg ?? '#FDE68A'} stroke={props.colorFg ?? '#92400E'} strokeWidth="1.2" />
      <CapShape cx={40} cy={27} r={9} facing={1} team={cap} fallback="#1F4E8C" />
    </svg>
  )
}
