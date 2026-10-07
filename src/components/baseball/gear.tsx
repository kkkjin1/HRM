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
// 장비 없는 기본 방망이 색(wood일 때) — 몸통 나무색, 손잡이·띠는 진한 갈색
const WOOD_BAT = { bat: '#A8713B', primary: '#5C3A1E', secondary: '#7A4E28' } as KboTeam

// wood: 장비 방망이가 없을 때도 막대 대신 나무 방망이 모양(손잡이 → 배럴)으로 — 타석 화면에서 타자 유형별 크기 차이가 보이게
export function BatShape(props: { hands: Pt; angleRad: number; length: number; team: KboTeam | null; width?: number; wood?: boolean }) {
  const { hands, angleRad, length } = props
  const team = props.team ?? (props.wood ? WOOD_BAT : null)
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
      <BoxyPants M={(x, y) => ({ x: 40 + x * 19, y: 80 - y * 19 })} team={uni} />
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

// 정면 모자(포수 시점 투수·선수 카드): 둥근 크라운 + 앞챙 + 가운데 로고
export function FrontCapShape(props: { cx: number; cy: number; r: number; team: KboTeam | null; fallback: string }) {
  const { cx, cy, r, team } = props
  const fill = team?.cap ?? props.fallback
  const d = `M${cx - r} ${cy} C${cx - r} ${cy - r * 1.35} ${cx + r} ${cy - r * 1.35} ${cx + r} ${cy} Z`
  const clipId = `fcap-${useId().replace(/:/g, '')}`
  return (
    <g>
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      <path d={d} fill={fill} />
      <ellipse cx={cx} cy={cy + r * 0.05} rx={r * 1.12} ry={r * 0.22} fill={fill} />
      {team && <image clipPath={`url(#${clipId})`} href={logoUrl(team.key)} x={cx - r * 0.55} y={cy - r * 0.92} width={r * 1.1} height={r * 0.85} preserveAspectRatio="xMidYMid meet" />}
    </g>
  )
}

// 뒷모습 헬멧(포수 시점 타자): 구단 색 + 뒤쪽 로고 스티커
export function BackHelmetShape(props: { cx: number; cy: number; r: number; team: KboTeam | null; fallback: string }) {
  const { cx, cy, r, team } = props
  const fill = team?.cap ?? props.fallback
  const clipId = `bhelm-${useId().replace(/:/g, '')}`
  return (
    <g>
      <defs><clipPath id={clipId}><circle cx={cx} cy={cy - r * 0.15} r={r * 0.46} /></clipPath></defs>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#1F2933" strokeWidth={r * 0.08} />
      <path d={`M${cx - r * 0.98} ${cy + r * 0.25} Q${cx} ${cy + r * 0.55} ${cx + r * 0.98} ${cy + r * 0.25}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={r * 0.1} />
      {team && <image clipPath={`url(#${clipId})`} href={logoUrl(team.key)} x={cx - r * 0.46} y={cy - r * 0.61} width={r * 0.92} height={r * 0.92} preserveAspectRatio="xMidYMid meet" />}
    </g>
  )
}

// 유니폼 등판(포수 시점 타자): 사다리꼴 몸통에 이름 + 등번호(구단 색). 유니폼이 없으면 기본 색 티셔츠.
export function BackJerseyShape(props: { pts: [Pt, Pt, Pt, Pt]; team: KboTeam | null; fallback: string; name: string; number: number }) {
  const { pts, team } = props
  const [tl, tr, br, bl] = pts
  const d = `M${tl.x} ${tl.y} L${tr.x} ${tr.y} L${br.x} ${br.y} L${bl.x} ${bl.y} Z`
  const cx = (tl.x + tr.x + br.x + bl.x) / 4
  const w = Math.abs(tr.x - tl.x)
  const h = Math.abs(bl.y - tl.y)
  const ink = team?.primary ?? '#1F2933'
  const clipId = `bjersey-${useId().replace(/:/g, '')}`
  return (
    <g>
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      <path d={d} fill={team?.jersey ?? props.fallback} />
      {team?.pinstripe && (
        <g clipPath={`url(#${clipId})`} stroke={team.secondary} strokeWidth={w * 0.025} opacity="0.45">
          {[-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45].map(f => <line key={f} x1={cx + f * w} y1={tl.y} x2={cx + f * w} y2={bl.y} />)}
        </g>
      )}
      <rect clipPath={`url(#${clipId})`} x={Math.min(bl.x, br.x) - 2} y={bl.y - h * 0.045} width={w + 4} height={h * 0.045} fill="#7C83B0" opacity="0.18" />
      <text x={cx} y={tl.y + h * 0.24} textAnchor="middle" fontSize={h * 0.15} fontWeight="800" fill={ink}
        textLength={Math.min(w * 0.8, h * 0.15 * props.name.length * 0.95)} lengthAdjust="spacingAndGlyphs">{props.name}</text>
      <text x={cx} y={tl.y + h * 0.74} textAnchor="middle" fontSize={h * 0.46} fontWeight="900" fill={ink} stroke={team ? team.secondary : 'none'} strokeWidth={h * 0.012}>{props.number}</text>
      <path d={d} fill="none" stroke={team?.primary ?? '#374151'} strokeWidth={Math.max(0.8, w * 0.03)} strokeLinejoin="round" />
    </g>
  )
}

// 유니폼 바지 한쪽 다리: 엉덩이 → 무릎 → 발. 유니폼 바탕색 바지 + 구단 색 옆줄, 정강이 아래는 구단 색 스타킹 + 검은 신발.
// 유니폼이 없으면 예전처럼 막대 다리(stroke 색).
export function PantsLeg(props: { hip: Pt; knee: Pt; foot: Pt; width: number; team: KboTeam | null; stroke?: string }) {
  const { hip, knee, foot, width: w, team } = props
  const line = (pts: Pt[]) => pts.map(p => `${p.x},${p.y}`).join(' ')
  if (!team) {
    return <polyline points={line([hip, knee, foot])} fill="none" stroke={props.stroke ?? '#374151'} strokeWidth={w * 0.62} strokeLinecap="round" strokeLinejoin="round" />
  }
  const cuff = { x: knee.x + (foot.x - knee.x) * 0.55, y: knee.y + (foot.y - knee.y) * 0.55 } // 바지 끝(정강이 중간)
  return (
    <g>
      {/* 스타킹 + 신발 */}
      <line x1={cuff.x} y1={cuff.y} x2={foot.x} y2={foot.y} stroke={team.primary} strokeWidth={w * 0.62} strokeLinecap="round" />
      <ellipse cx={foot.x} cy={foot.y} rx={w * 0.5} ry={w * 0.28} fill="#1F2933" />
      {/* 바지: 테두리 → 바탕 → 옆줄 */}
      <polyline points={line([hip, knee, cuff])} fill="none" stroke={team.secondary} strokeWidth={w * 1.08} strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <polyline points={line([hip, knee, cuff])} fill="none" stroke={team.jersey} strokeWidth={w * 0.92} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line([hip, knee, cuff])} fill="none" stroke={team.primary} strokeWidth={Math.max(0.5, w * 0.16)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

// 박스형 통바지(정지 자세 타자 — 포수 시점 뒷모습·선수 카드 정면): 상의 하단과 거의 같은 폭으로 시작해 일자로 내려가다
// 무릎 아래로 아주 살짝 좁아진다. 가랑이 분기는 낮고 얕게, 바깥쪽에 구단 색 이중 옆선, 짧은 양말 + 둥근 신발.
// M: 바지 좌표(x = 몸 중심 기준 좌우 m, y = 바닥에서 높이 m) → 화면 좌표. 허리는 y 0.96(상의 밑으로 살짝 들어감).
export function BoxyPants({ M, team }: { M: (x: number, y: number) => Pt; team: KboTeam | null }) {
  const poly = (list: [number, number][]) => list.map(([x, y]) => { const q = M(x, y); return `${q.x},${q.y}` }).join(' ')
  const fill = team?.jersey ?? '#D7DCE1'
  const ink = team?.primary ?? '#6B7280'
  const sock = team?.primary ?? '#4B5563'
  const unit = Math.hypot(M(1, 0).x - M(0, 0).x, M(1, 0).y - M(0, 0).y) // 1m당 화면 길이
  const legs = [-1, 1] as const
  return (
    <g data-part="pants">
      {legs.map(k => (
        <g key={`s${k}`}>
          {/* 양말(짧게) + 신발(둥글고 넉넉하게) */}
          <polygon points={poly([[k * 0.075, 0.25], [k * 0.225, 0.25], [k * 0.215, 0.075], [k * 0.088, 0.075]])} fill={sock} />
          {(() => { const c = M(k * 0.165, 0.045); return <ellipse cx={c.x} cy={c.y} rx={unit * 0.15} ry={unit * 0.065} fill="#1F2933" /> })()}
        </g>
      ))}
      {legs.map(k => (
        <g key={`p${k}`}>
          {/* 다리: 허리 → 골반(살짝 넓어짐) → 무릎 → 바지 끝(살짝 좁아짐). 안쪽 분기는 y 0.66에서 얕게 */}
          <polygon points={poly([[k * 0.005, 0.96], [k * 0.215, 0.96], [k * 0.25, 0.76], [k * 0.255, 0.5], [k * 0.245, 0.24], [k * 0.065, 0.24], [k * 0.05, 0.5], [k * 0.012, 0.66]])}
            fill={fill} stroke={ink} strokeWidth={Math.max(0.8, unit * 0.022)} strokeLinejoin="round" />
          {/* 안쪽 아주 약한 음영 */}
          <polygon points={poly([[k * 0.012, 0.66], [k * 0.05, 0.5], [k * 0.065, 0.245], [k * 0.105, 0.245], [k * 0.09, 0.5], [k * 0.045, 0.63]])} fill="#000000" opacity="0.05" />
          {/* 바깥 이중 옆선 */}
          <polyline points={poly([[k * 0.197, 0.94], [k * 0.229, 0.76], [k * 0.233, 0.5], [k * 0.224, 0.26]])} fill="none" stroke={ink} strokeWidth={Math.max(0.7, unit * 0.026)} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={poly([[k * 0.172, 0.94], [k * 0.203, 0.76], [k * 0.207, 0.5], [k * 0.198, 0.26]])} fill="none" stroke={ink} strokeWidth={Math.max(0.5, unit * 0.011)} strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </g>
      ))}
      {/* 가운데 솔기(희미하게) */}
      <polyline points={poly([[0, 0.96], [0, 0.68]])} fill="none" stroke="#000000" strokeOpacity="0.12" strokeWidth={Math.max(0.5, unit * 0.012)} />
    </g>
  )
}

// 유니폼이 없는 선수용 기본 유니폼(회색 연습복) — 정면·등판 그림을 같은 모양으로 그리기 위한 가짜 구단
export function plainTeam(color: string): KboTeam {
  return { key: 'lg', name: '기본', wordmark: '', cap: '#4B5563', primary: '#6B7280', secondary: '#9CA3AF', jersey: color, bat: '#8B5A2B' }
}

// 유니폼 등판(투수 시점의 내 뒷모습): JerseyShape와 같은 몸통·반팔 소매 모양에 이름 + 등번호.
// a = 어깨 가운데, b = 엉덩이. 목선은 뒤쪽이라 얕게.
export function BackJerseyFull(props: { a: Pt; b: Pt; wTop: number; wBottom: number; team: KboTeam; name: string; number: number }) {
  const { a, b, wTop, wBottom, team } = props
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90
  const hw = wTop / 2
  const hb = wBottom / 2
  const side = (k: 1 | -1) => [
    [k * hw * 0.85, 0.01 * L], [k * hw * 1.08, 0.06 * L], [k * hw * 1.3, 0.18 * L], [k * hw * 1.36, 0.32 * L], [k * hw * 1.06, 0.38 * L],
    [k * hw * 0.98, 0.34 * L], [k * hb * 0.94, 0.7 * L], [k * hb, L],
  ]
  const left = side(-1)
  const right = side(1).reverse()
  const pts = [...left, ...right].map(([x, y]) => `L${x} ${y}`).join(' ')
  const d = `M${-0.3 * hw} 0 ${pts} L${0.3 * hw} 0 Q0 ${0.07 * L} ${-0.3 * hw} 0 Z`
  const sw = Math.max(0.6, wTop * 0.06)
  const ink = team.primary
  const clipId = `bjf-${useId().replace(/:/g, '')}`
  const nameSize = Math.min(L * 0.13, (wTop * 1.5) / Math.max(3, props.name.length))
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      <path d={d} fill={team.jersey} />
      <g clipPath={`url(#${clipId})`}>
        {team.pinstripe && (
          <g stroke={team.secondary} strokeWidth={wTop * 0.03} opacity="0.45">
            {[-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2].map(f => <line key={f} x1={f * hw} y1={0} x2={f * hw} y2={L} />)}
          </g>
        )}
        {/* 소매 끝 트림 · 등 아래 음영 · 벨트 */}
        {([-1, 1] as const).map(k => (
          <line key={k} x1={k * hw * 1.36} y1={0.32 * L} x2={k * hw * 1.06} y2={0.38 * L} stroke={team.primary} strokeWidth={sw * 2.2} />
        ))}
        {/* 견갑골 쪽 옅은 주름 */}
        {([-1, 1] as const).map(k => (
          <path key={`f${k}`} d={`M${k * hw * 0.55} ${0.2 * L} Q${k * hw * 0.75} ${0.32 * L} ${k * hw * 0.6} ${0.45 * L}`} fill="none" stroke="#000000" strokeOpacity="0.08" strokeWidth={sw} />
        ))}
        <rect x={-hw * 1.6} y={L * 0.7} width={hw * 3.2} height={L * 0.23} fill="#000000" opacity="0.04" />
        <rect x={-hb * 1.1} y={L * 0.93} width={hb * 2.2} height={L * 0.08} fill={team.secondary} />
      </g>
      <path d={d} fill="none" stroke={team.primary} strokeWidth={sw} strokeLinejoin="round" />
      <path d={`M${-0.3 * hw} 0 Q0 ${0.07 * L} ${0.3 * hw} 0`} fill="none" stroke={team.secondary} strokeWidth={sw * 1.5} />
      <text x={0} y={0.24 * L} textAnchor="middle" fontSize={nameSize} fontWeight="800" fill={ink}>{props.name}</text>
      <text x={0} y={0.74 * L} textAnchor="middle" fontSize={L * 0.42} fontWeight="900" fill={ink} stroke={team.secondary} strokeWidth={L * 0.012}>{props.number}</text>
    </g>
  )
}
