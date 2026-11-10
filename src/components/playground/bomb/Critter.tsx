// 💣 폭탄 놀이터 캐릭터 — SVG 레이어(등 → 몸 → 머리 → 얼굴 → 얼굴꾸미기 → 모자) 순서로 그려서
// 꾸미기 부품을 겹치기 쉽게 한다. 모든 캐릭터는 정면을 보는 2등신(머리 크고 몸 작게).
// 무늬(치즈냥 줄무늬·턱시도 흰 부분·눈썹 점)는 몸 색에서 계산해서, 몸 색을 바꿔도 같이 따라간다.

export type Species = 'cheeseCat' | 'tuxCat' | 'pom' | 'mutt' | 'rabbit' | 'bear' | 'penguin' | 'duck' | 'fox' | 'slime' | 'turtle' | 'turtleFast'
import { useId } from 'react'
import { Back, BackFront, FaceDeco, Hat, Outfit, type BackPart, type FacePart, type HatPart, type OutfitPart } from './CritterParts'

export type { BackPart, FacePart, HatPart, OutfitPart }
export { BACKS, FACES, HATS, OUTFITS } from './CritterParts'

export const SPECIES: { key: Species; name: string; color: string }[] = [
  { key: 'cheeseCat', name: '치즈냥', color: '#ffbd73' },
  { key: 'tuxCat', name: '턱시도냥', color: '#3c3c4a' },
  { key: 'pom', name: '포메라니안', color: '#ffb36b' },
  { key: 'mutt', name: '시고르자브종', color: '#f3d7a2' },
  { key: 'rabbit', name: '토끼', color: '#fff4ee' },
  { key: 'bear', name: '곰', color: '#c99b78' },
  { key: 'penguin', name: '펭귄', color: '#4a5878' },
  { key: 'duck', name: '오리', color: '#ffe27a' },
  { key: 'fox', name: '여우', color: '#ffa05e' },
  { key: 'slime', name: '슬라임', color: '#9fe3c6' },
  { key: 'turtle', name: '느린 거북이', color: '#b5dd8f' },
  { key: 'turtleFast', name: '빠른 거북이', color: '#8fd49a' },
]

export const BODY_COLORS = ['#ffbd73', '#f3d7a2', '#fff4ee', '#ffc4d4', '#ffa05e', '#ffe27a', '#9fe3c6', '#b9dcff', '#d6d9e2', '#c99b78', '#4a5878', '#3c3c4a']

function hex(c: string) {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number) {
  const x = hex(a), y = hex(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
function isDark(c: string) {
  const [r, g, b] = hex(c)
  return 0.299 * r + 0.587 * g + 0.114 * b < 110
}

const INK = '#3d2b2b'
const BLUSH = '#ff8fa8'
const WHITE = '#fffaf4'
const PINK = '#ffc1cf'

const isCat = (sp: Species) => sp === 'cheeseCat' || sp === 'tuxCat'
const isDog = (sp: Species) => sp === 'pom' || sp === 'mutt'

// 머리 위 모자 기준점·눈 높이 (종마다 다름)
const ANCHOR: Record<Species, { hatY: number; eyeY: number; hatScale: number }> = {
  cheeseCat: { hatY: 20, eyeY: 48, hatScale: 1 },
  tuxCat: { hatY: 20, eyeY: 48, hatScale: 1 },
  pom: { hatY: 16, eyeY: 47, hatScale: 1 },
  mutt: { hatY: 20, eyeY: 47, hatScale: 1 },
  rabbit: { hatY: 21, eyeY: 48, hatScale: 0.95 },
  bear: { hatY: 20, eyeY: 46, hatScale: 1 },
  penguin: { hatY: 20, eyeY: 47, hatScale: 1 },
  duck: { hatY: 19, eyeY: 47, hatScale: 1 },
  fox: { hatY: 20, eyeY: 47, hatScale: 1 },
  slime: { hatY: 24, eyeY: 58, hatScale: 0.8 },
  turtle: { hatY: 20, eyeY: 48, hatScale: 1 },
  turtleFast: { hatY: 18, eyeY: 48, hatScale: 1 },
}
const isTurtle = (sp: Species) => sp === 'turtle' || sp === 'turtleFast'

export interface CritterLook {
  species: Species
  color?: string
  hat?: HatPart
  face?: FacePart
  back?: BackPart
  outfit?: OutfitPart
}

export default function Critter({ look, size = 120, animate = true }: { look: CritterLook; size?: number; animate?: boolean }) {
  const sp = look.species
  const c = look.color ?? SPECIES.find(s => s.key === sp)!.color
  const dark = isDark(c)
  const line = dark ? mix(c, '#000000', 0.45) : mix(c, INK, 0.6)
  const light = dark ? mix(c, '#ffffff', 0.35) : mix(c, '#ffffff', 0.6)
  const deep = dark ? mix(c, '#000000', 0.2) : mix(c, INK, 0.18)
  const p: P = { sp, c, line, light, deep }
  const a = ANCHOR[sp]
  const clipId = 'cb' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const back = look.back ?? 'none'
  return (
    <svg viewBox="0 -12 100 112" width={size} height={size * 1.12} className={animate ? 'critter-bob' : undefined} style={{ overflow: 'visible' }}>
      <ellipse cx={50} cy={97} rx={24} ry={3.5} fill="#000" opacity={0.1} />
      <defs>
        <clipPath id={clipId}>
          {sp === 'slime' ? <path d="M14 70 C 13 60, 20 62, 50 64 C 80 62, 87 60, 86 70 C 85 90, 15 90, 14 70 Z" /> : <ellipse cx={50} cy={80} rx={20} ry={14} />}
        </clipPath>
      </defs>
      <Back part={back} />
      {sp === 'slime' ? (
        <>
          <Slime c={c} line={line} />
          <Outfit part={look.outfit ?? 'none'} clipId={clipId} />
        </>
      ) : (
        <>
          <Tail {...p} />
          <Body {...p} />
          <Outfit part={look.outfit ?? 'none'} clipId={clipId} />
          <BackFront part={back} />
          <Ears {...p} />
          <Head {...p} />
        </>
      )}
      <Face {...p} eyeY={a.eyeY} />
      <FaceDeco part={look.face ?? 'none'} eyeY={a.eyeY} />
      <g transform={`translate(50 ${a.hatY}) scale(${a.hatScale}) translate(-50 -20)`}>
        <Hat part={look.hat ?? 'none'} />
      </g>
    </svg>
  )
}

type P = { sp: Species; c: string; line: string; light: string; deep: string }

const CAT_TAIL = 'M66 86 q20 0 16 -22'

function Tail({ sp, c, line, deep }: P) {
  if (isCat(sp))
    return (
      <g>
        <path d={CAT_TAIL} fill="none" stroke={line} strokeWidth={9} strokeLinecap="round" />
        <path d={CAT_TAIL} fill="none" stroke={c} strokeWidth={5} strokeLinecap="round" />
        {sp === 'cheeseCat' && <path d={CAT_TAIL} fill="none" stroke={deep} strokeWidth={5} strokeDasharray="3 4" strokeDashoffset={-4} />}
        {sp === 'tuxCat' && <circle cx={82} cy={64} r={2.6} fill={WHITE} />}
      </g>
    )
  if (isTurtle(sp)) return <Shell fast={sp === 'turtleFast'} />
  if (sp === 'fox')
    return (
      <g transform="rotate(-25 70 84)">
        <ellipse cx={82} cy={80} rx={15} ry={9} fill={c} stroke={line} strokeWidth={2.4} />
        <ellipse cx={93} cy={79} rx={5} ry={5.5} fill={WHITE} />
      </g>
    )
  if (sp === 'pom')
    return (
      <g fill={c} stroke={line} strokeWidth={2.2}>
        {[[74, 72, 8], [80, 64, 7.5], [72, 62, 7], [80, 74, 6]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
        <g stroke="none">{[[74, 72, 6.5], [80, 64, 6], [72, 62, 5.5], [80, 74, 4.5]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>
      </g>
    )
  if (sp === 'mutt')
    return (
      <g fill="none" strokeLinecap="round">
        <path d="M67 82 q14 2 13 -10 q-1 -8 -8 -6 q-5 2 -1 6" stroke={line} strokeWidth={8} />
        <path d="M67 82 q14 2 13 -10 q-1 -8 -8 -6 q-5 2 -1 6" stroke={c} strokeWidth={4.5} />
      </g>
    )
  return null
}

// 거북이 등껍질 — 몸 뒤에 크게. 정면에서 보면 몸 둘레로 껍질 테두리가 보인다. (껍질 색은 몸 색과 따로)
function Shell({ fast }: { fast: boolean }) {
  const shell = fast ? '#4fae6e' : '#a7804f'
  const rim = fast ? '#2f7d4a' : '#7a5a34'
  const plate = fast ? '#6cc489' : '#c29a62'
  return (
    <g>
      <ellipse cx={50} cy={72} rx={32} ry={25} fill={shell} stroke={rim} strokeWidth={2.4} />
      <path d="M22 60 Q50 44 78 60" fill="none" stroke={rim} strokeWidth={1.6} opacity={0.6} />
      {[[22, 64], [78, 64], [22, 82], [78, 82], [34, 52], [66, 52]].map(([x, y]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={4.8} ry={5.4} fill={plate} stroke={rim} strokeWidth={1} />)}
      {fast && <path d="M78 62 l-5 8 h4 l-3 8 l8 -10 h-4 l3 -6 Z" fill="#ffe14d" stroke="#d6a91a" strokeWidth={0.9} strokeLinejoin="round" />}
      {fast && (
        <g stroke="#9ad6ff" strokeWidth={2.2} strokeLinecap="round" opacity={0.9}>
          <line x1={4} y1={66} x2={14} y2={66} />
          <line x1={0} y1={74} x2={13} y2={74} />
          <line x1={5} y1={82} x2={15} y2={82} />
        </g>
      )}
    </g>
  )
}

function Body({ sp, c, line, light, deep }: P) {
  const orangeFeet = sp === 'duck' || sp === 'penguin'
  const footFill = orangeFeet ? '#ffa53a' : sp === 'tuxCat' ? WHITE : deep
  const footLine = orangeFeet ? '#d97a1c' : line
  const belly = isTurtle(sp) ? '#fff1c7' : ['penguin', 'fox', 'rabbit', 'tuxCat', 'mutt', 'cheeseCat'].includes(sp) ? WHITE : light
  return (
    <g>
      <ellipse cx={40} cy={92} rx={7.5} ry={4.2} fill={footFill} stroke={footLine} strokeWidth={2} />
      <ellipse cx={60} cy={92} rx={7.5} ry={4.2} fill={footFill} stroke={footLine} strokeWidth={2} />
      <ellipse cx={30.5} cy={78} rx={5} ry={7.5} transform="rotate(25 30.5 78)" fill={c} stroke={line} strokeWidth={2.2} />
      <ellipse cx={69.5} cy={78} rx={5} ry={7.5} transform="rotate(-25 69.5 78)" fill={c} stroke={line} strokeWidth={2.2} />
      {sp === 'tuxCat' && (
        <>
          <circle cx={27.5} cy={83} r={3.6} fill={WHITE} />
          <circle cx={72.5} cy={83} r={3.6} fill={WHITE} />
        </>
      )}
      <ellipse cx={50} cy={80} rx={20} ry={14} fill={c} stroke={line} strokeWidth={2.4} />
      <ellipse cx={50} cy={82} rx={12} ry={9} fill={belly} />
      {isTurtle(sp) && <path d="M39 80 h22 M40 85 h20 M50 74 v16" stroke="#e5cf8f" strokeWidth={1.3} fill="none" />}
      {sp === 'pom' && (
        <g fill={light}>
          {[[42, 72, 6], [50, 74, 7], [58, 72, 6], [46, 79, 5], [54, 79, 5]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
        </g>
      )}
    </g>
  )
}

function Ears({ sp, c, line, light, deep }: P) {
  switch (sp) {
    case 'cheeseCat':
    case 'tuxCat':
      return (
        <g strokeLinejoin="round">
          <path d="M23 36 L25 11 L44 25 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M77 36 L75 11 L56 25 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M28 30 L29 18 L38 25 Z" fill={PINK} />
          <path d="M72 30 L71 18 L62 25 Z" fill={PINK} />
        </g>
      )
    case 'pom':
      return (
        <g strokeLinejoin="round">
          <path d="M27 26 L30 2 L47 17 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M73 26 L70 2 L53 17 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M32 20 L33 9 L41 16 Z" fill={light} />
          <path d="M68 20 L67 9 L59 16 Z" fill={light} />
        </g>
      )
    case 'mutt':
      // 반쯤 접힌 귀 — 끝이 앞으로 살짝 꺾임
      return (
        <g strokeLinejoin="round">
          <path d="M23 38 Q22 22 27 12 Q36 16 44 25 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M77 38 Q78 22 73 12 Q64 16 56 25 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M27 12 Q34 15 37 19 Q31 23 25 22 Z" fill={deep} stroke={line} strokeWidth={1.8} />
          <path d="M73 12 Q66 15 63 19 Q69 23 75 22 Z" fill={deep} stroke={line} strokeWidth={1.8} />
        </g>
      )
    case 'fox':
      return (
        <g strokeLinejoin="round">
          <path d="M22 38 L22 6 L45 24 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M78 38 L78 6 L55 24 Z" fill={c} stroke={line} strokeWidth={2.4} />
          <path d="M22.8 8 L23 17 L30 13 Z" fill="#5a3a30" />
          <path d="M77.2 8 L77 17 L70 13 Z" fill="#5a3a30" />
          <path d="M27 30 L27 17 L37 25 Z" fill="#fff4ea" />
          <path d="M73 30 L73 17 L63 25 Z" fill="#fff4ea" />
        </g>
      )
    case 'rabbit':
      return (
        <g>
          <g transform="rotate(-10 38 22)">
            <ellipse cx={38} cy={4} rx={8} ry={21} fill={c} stroke={line} strokeWidth={2.4} />
            <ellipse cx={38} cy={6} rx={3.8} ry={14} fill={PINK} />
          </g>
          <g transform="rotate(10 62 22)">
            <ellipse cx={62} cy={4} rx={8} ry={21} fill={c} stroke={line} strokeWidth={2.4} />
            <ellipse cx={62} cy={6} rx={3.8} ry={14} fill={PINK} />
          </g>
        </g>
      )
    case 'bear':
      return (
        <g>
          <circle cx={25} cy={24} r={10} fill={c} stroke={line} strokeWidth={2.4} />
          <circle cx={75} cy={24} r={10} fill={c} stroke={line} strokeWidth={2.4} />
          <circle cx={25} cy={24} r={5} fill={light} />
          <circle cx={75} cy={24} r={5} fill={light} />
        </g>
      )
    case 'duck':
      return <path d="M48 20 q1 -10 8 -9 q-4 3 -3 9" fill={c} stroke={line} strokeWidth={2} strokeLinejoin="round" />
    default:
      return null
  }
}

function Head({ sp, c, line, deep }: P) {
  return (
    <g>
      {sp === 'pom' && <PomFluff c={c} line={line} />}
      <ellipse cx={50} cy={46} rx={31} ry={28} fill={c} stroke={sp === 'pom' ? 'none' : line} strokeWidth={2.4} />
      {sp === 'turtleFast' && (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M77 30 q10 -2 16 -8 q-3 7 -12 11 Z" fill="#ff5a5a" stroke="#c93a3a" strokeWidth={1.4} />
          <path d="M77 33 q11 2 17 -2 q-5 6 -14 7 Z" fill="#ff5a5a" stroke="#c93a3a" strokeWidth={1.4} />
          <path d="M21 31 Q50 21 79 31 L78.5 37 Q50 28 21.5 37 Z" fill="#ff5a5a" stroke="#c93a3a" strokeWidth={1.4} />
          <circle cx={50} cy={29.5} r={3} fill="#fff" stroke="#c93a3a" strokeWidth={1} />
        </g>
      )}
      {sp === 'penguin' && (
        <path d="M50 37 C 43 28, 25 32, 26 50 C 27 64, 40 70, 50 70 C 60 70, 73 64, 74 50 C 75 32, 57 28, 50 37 Z" fill={WHITE} />
      )}
      {sp === 'cheeseCat' && (
        <g stroke={deep} strokeWidth={2.8} strokeLinecap="round">
          <line x1={50} y1={19.5} x2={50} y2={27} />
          <line x1={43} y1={21} x2={44.5} y2={27} />
          <line x1={57} y1={21} x2={55.5} y2={27} />
          <line x1={20.5} y1={44} x2={26} y2={45} />
          <line x1={21} y1={50} x2={26} y2={50} />
          <line x1={79.5} y1={44} x2={74} y2={45} />
          <line x1={79} y1={50} x2={74} y2={50} />
        </g>
      )}
    </g>
  )
}

// 포메 털뭉치 — 원 테두리를 먼저 다 그리고, 같은 원을 테두리 없이 덮어서 바깥 윤곽만 보송하게 남긴다
function PomFluff({ c, line }: { c: string; line: string }) {
  const pts = Array.from({ length: 18 }, (_, i) => {
    const t = (Math.PI * 2 * i) / 18
    return [50 + Math.cos(t) * 31, 47 + Math.sin(t) * 27] as const
  })
  return (
    <g>
      {pts.map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r={7.5} fill={c} stroke={line} strokeWidth={2.4} />)}
      {pts.map(([x, y], i) => <circle key={`f${i}`} cx={x} cy={y} r={7.5} fill={c} />)}
    </g>
  )
}

function Slime({ c, line }: { c: string; line: string }) {
  return (
    <g>
      <path d="M50 14 C 62 26, 88 44, 86 70 C 85 90, 15 90, 14 70 C 12 44, 38 26, 50 14 Z" fill={c} stroke={line} strokeWidth={2.4} strokeLinejoin="round" />
      <ellipse cx={33} cy={46} rx={4.5} ry={8} transform="rotate(25 33 46)" fill="#fff" opacity={0.7} />
      <circle cx={38} cy={34} r={2} fill="#fff" opacity={0.7} />
    </g>
  )
}

function Eyes({ eyeY, iris }: { eyeY: number; iris?: string }) {
  const ex = 11.5
  return (
    <g className="critter-blink">
      {[50 - ex, 50 + ex].map(x => (
        <g key={x}>
          {iris && <ellipse cx={x} cy={eyeY} rx={5.6} ry={6.4} fill={iris} />}
          <ellipse cx={x} cy={eyeY} rx={4.3} ry={5.2} fill="#2a1f26" />
          <circle cx={x + 1.4} cy={eyeY - 1.9} r={1.7} fill="#fff" />
          <circle cx={x - 1.3} cy={eyeY + 1.9} r={0.8} fill="#fff" />
        </g>
      ))}
    </g>
  )
}

function Face({ sp, c, line, light, deep, eyeY }: P & { eyeY: number }) {
  const dark = isDark(c)
  const eyes = <Eyes eyeY={eyeY} iris={dark && (isCat(sp) || isDog(sp)) ? '#d9ea6a' : undefined} />
  const by = eyeY + 7.5
  const blush = (
    <g opacity={0.55}>
      <ellipse cx={50 - 19} cy={by} rx={5} ry={3} fill={BLUSH} />
      <ellipse cx={50 + 19} cy={by} rx={5} ry={3} fill={BLUSH} />
    </g>
  )
  const mouthInk = sp === 'tuxCat' || dark ? '#5a4646' : line
  const wMouth = (y: number) => (
    <path d={`M45.5 ${y} q2.2 2.6 4.5 0 q2.3 2.6 4.5 0`} fill="none" stroke={mouthInk} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  )
  const catNose = <ellipse cx={50} cy={eyeY + 5.5} rx={2.4} ry={1.7} fill="#e8798f" />
  const whiskers = (
    <g stroke={dark ? '#f4ece4' : line} strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
      <line x1={27} y1={eyeY + 5} x2={15} y2={eyeY + 3} />
      <line x1={27} y1={eyeY + 9} x2={15} y2={eyeY + 11} />
      <line x1={73} y1={eyeY + 5} x2={85} y2={eyeY + 3} />
      <line x1={73} y1={eyeY + 9} x2={85} y2={eyeY + 11} />
    </g>
  )
  const tongue = (y: number) => <path d={`M47.6 ${y} q2.4 5.5 4.8 0 Z`} fill="#ff7f98" stroke="#d9566f" strokeWidth={1} strokeLinejoin="round" />
  switch (sp) {
    case 'cheeseCat':
      return (
        <g>
          <ellipse cx={50} cy={eyeY + 8} rx={9} ry={6} fill={WHITE} />
          {blush}
          {eyes}
          {catNose}
          {wMouth(eyeY + 7.5)}
          {whiskers}
        </g>
      )
    case 'tuxCat':
      // 턱시도 — 코·입 둘레 흰 역V 무늬
      return (
        <g>
          <path d={`M50 ${eyeY - 3} Q46 ${eyeY + 2} 40 ${eyeY + 7} Q35 ${eyeY + 20} 50 ${eyeY + 21} Q65 ${eyeY + 20} 60 ${eyeY + 7} Q54 ${eyeY + 2} 50 ${eyeY - 3} Z`} fill={WHITE} />
          {blush}
          {eyes}
          {catNose}
          {wMouth(eyeY + 7.5)}
          {whiskers}
        </g>
      )
    case 'pom':
      return (
        <g>
          <ellipse cx={50} cy={eyeY + 9} rx={9} ry={6.5} fill={light} />
          {blush}
          {eyes}
          <ellipse cx={50} cy={eyeY + 6} rx={3.2} ry={2.4} fill="#2f2224" />
          {tongue(eyeY + 10)}
          {wMouth(eyeY + 8.5)}
        </g>
      )
    case 'mutt':
      return (
        <g>
          <ellipse cx={50} cy={eyeY + 9} rx={11} ry={7.5} fill={WHITE} />
          {/* 눈썹 점 */}
          <ellipse cx={38.5} cy={eyeY - 8.5} rx={2.8} ry={1.9} fill={deep} />
          <ellipse cx={61.5} cy={eyeY - 8.5} rx={2.8} ry={1.9} fill={deep} />
          {blush}
          {eyes}
          <ellipse cx={50} cy={eyeY + 6} rx={3.8} ry={2.7} fill="#2f2224" />
          {tongue(eyeY + 10.5)}
          {wMouth(eyeY + 9)}
        </g>
      )
    case 'turtle':
      // 느린 거북이 — 반쯤 감긴 졸린 눈
      return (
        <g>
          {blush}
          {eyes}
          {[50 - 11.5, 50 + 11.5].map(x => (
            <path key={x} d={`M${x - 5.6} ${eyeY - 0.5} Q${x} ${eyeY - 8} ${x + 5.6} ${eyeY - 0.5} Z`} fill={c} stroke={line} strokeWidth={1.6} strokeLinejoin="round" />
          ))}
          <ellipse cx={50} cy={eyeY + 8.5} rx={2.6} ry={1.8} fill={line} opacity={0.8} />
        </g>
      )
    case 'turtleFast':
      // 빠른 거북이 — 비장한 눈썹 + 씩 웃는 입
      return (
        <g>
          {blush}
          {eyes}
          <path d={`M33 ${eyeY - 9} L44 ${eyeY - 6} M67 ${eyeY - 9} L56 ${eyeY - 6}`} stroke={line} strokeWidth={2.4} strokeLinecap="round" />
          <path d={`M43 ${eyeY + 7} Q50 ${eyeY + 13} 57 ${eyeY + 7}`} fill="#fff" stroke={line} strokeWidth={1.8} strokeLinejoin="round" />
        </g>
      )
    case 'duck':
      return (
        <g>
          {blush}
          {eyes}
          <ellipse cx={50} cy={eyeY + 8} rx={9} ry={4.6} fill="#ffa53a" stroke="#d97a1c" strokeWidth={1.8} />
          <path d={`M42.5 ${eyeY + 8} q7.5 2 15 0`} fill="none" stroke="#d97a1c" strokeWidth={1.3} />
        </g>
      )
    case 'penguin':
      return (
        <g>
          {blush}
          {eyes}
          <path d={`M45.5 ${eyeY + 5} L54.5 ${eyeY + 5} L50 ${eyeY + 10.5} Z`} fill="#ffa53a" stroke="#d97a1c" strokeWidth={1.5} strokeLinejoin="round" />
        </g>
      )
    case 'bear':
      return (
        <g>
          {blush}
          <ellipse cx={50} cy={eyeY + 9} rx={10.5} ry={7.5} fill={light} />
          {eyes}
          <ellipse cx={50} cy={eyeY + 6.5} rx={3.6} ry={2.6} fill="#3a2826" />
          {wMouth(eyeY + 10)}
        </g>
      )
    case 'fox':
      return (
        <g>
          <path d={`M24 ${eyeY + 2} Q 34 ${eyeY + 2}, 50 ${eyeY + 6} Q 66 ${eyeY + 2}, 76 ${eyeY + 2} Q 72 ${eyeY + 22}, 50 ${eyeY + 24} Q 28 ${eyeY + 22}, 24 ${eyeY + 2} Z`} fill={WHITE} />
          {blush}
          {eyes}
          <ellipse cx={50} cy={eyeY + 6.5} rx={2.8} ry={2.1} fill="#3a2826" />
          {wMouth(eyeY + 9)}
        </g>
      )
    case 'rabbit':
      return (
        <g>
          {blush}
          {eyes}
          <ellipse cx={50} cy={eyeY + 5.5} rx={2.2} ry={1.6} fill="#e8798f" />
          {wMouth(eyeY + 7.5)}
        </g>
      )
    default:
      return (
        <g>
          {blush}
          {eyes}
          {wMouth(eyeY + 7)}
        </g>
      )
  }
}

// 페이지에 한 번 넣는 애니메이션 CSS (몸 통통 튀기 + 눈 깜빡)
export const CRITTER_CSS = `
@keyframes critter-bob { 0%,100% { transform: translateY(0) scale(1,1) } 50% { transform: translateY(-3px) scale(1.02,0.98) } }
@keyframes critter-blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }
.critter-bob { animation: critter-bob 1.6s ease-in-out infinite; transform-origin: 50% 100%; }
.critter-blink { animation: critter-blink 4s infinite; transform-box: fill-box; transform-origin: center; }
`
