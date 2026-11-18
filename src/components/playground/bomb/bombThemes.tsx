// 🧨 폭탄 놀이터 맵 테마 — 바닥 색 + 칸 그림(기둥·테두리·상자·물·얼음·순간이동 문). 규칙 차이는 lib/bomb.ts MAPS.
// 칸 그림은 44×50(위로 6px 튀어나온 입체) 좌표. 보라 계열은 쓰지 않는다.

import type { ReactNode } from 'react'
import type { MapId } from '@/lib/bomb'

export const TILE = 44

type Sprite = () => ReactNode
export interface BombTheme {
  floor: [string, string]
  frame: string // 판 바깥 그림자 색
  wall: Sprite
  wall2: Sprite // 배치 맵의 두 번째 벽(나무·전나무·초콜릿·야자수·가로등)
  border: Sprite
  block: Sprite
  dark?: boolean // 바닥이 어두움(이름표·글자 대비용)
}

const box = (children: ReactNode) => <svg viewBox="0 0 44 50" width={TILE} height={TILE + 6}>{children}</svg>

// ── 🌳 숲
const Stone: Sprite = () => box(<>
  <rect x={2} y={8} width={40} height={40} rx={9} fill="#9aa6b8" />
  <rect x={2} y={2} width={40} height={38} rx={9} fill="#c9d2df" />
  <rect x={7} y={6} width={18} height={6} rx={3} fill="#e4eaf2" />
</>)
const Hedge: Sprite = () => box(<>
  <rect x={0} y={8} width={44} height={42} rx={6} fill="#5f9e55" />
  <rect x={0} y={2} width={44} height={40} rx={8} fill="#79bb6c" />
  <circle cx={12} cy={14} r={5} fill="#8fcc80" />
  <circle cx={30} cy={24} r={4} fill="#8fcc80" />
  <circle cx={34} cy={10} r={2.5} fill="#ffd6e0" />
</>)
const Crate: Sprite = () => box(<>
  <rect x={3} y={9} width={38} height={39} rx={6} fill="#c98a45" />
  <rect x={3} y={3} width={38} height={37} rx={6} fill="#eab06a" stroke="#c98a45" strokeWidth={2} />
  <path d="M9 9 L35 34 M35 9 L9 34" stroke="#d1964f" strokeWidth={3.5} strokeLinecap="round" />
  <rect x={6} y={6} width={32} height={31} rx={4} fill="none" stroke="#d1964f" strokeWidth={2.5} />
  <circle cx={8} cy={8} r={1.4} fill="#a86d32" />
  <circle cx={36} cy={8} r={1.4} fill="#a86d32" />
</>)

// ── ❄️ 눈밭
// 눈 덮인 바위 기둥 — 바닥 얼음(옅은 하늘색)과 헷갈리지 않게 진한 청회색
const IceBlock: Sprite = () => box(<>
  <rect x={2} y={8} width={40} height={40} rx={9} fill="#5d7690" />
  <rect x={2} y={2} width={40} height={38} rx={9} fill="#7d97b2" />
  <path d="M2 12 Q2 2 12 2 L32 2 Q42 2 42 12 Q36 9 30 12 Q24 8 18 12 Q10 8 2 12 Z" fill="#ffffff" />
  <path d="M10 24 L16 30 M28 22 L33 27" stroke="#9fb5cb" strokeWidth={2} strokeLinecap="round" />
</>)
const Pine: Sprite = () => box(<>
  <rect x={0} y={8} width={44} height={42} rx={6} fill="#3f7a5c" />
  <rect x={0} y={2} width={44} height={40} rx={8} fill="#55977a" />
  <path d="M0 10 Q10 2 22 8 Q34 2 44 10 L44 4 Q44 2 40 2 L4 2 Q0 2 0 4 Z" fill="#ffffff" />
  <circle cx={14} cy={24} r={3} fill="#ffffff" opacity={0.8} />
  <circle cx={32} cy={30} r={2.5} fill="#ffffff" opacity={0.8} />
</>)
const SnowMound: Sprite = () => box(<>
  <ellipse cx={22} cy={42} rx={19} ry={6} fill="#b9d3ea" />
  <path d="M3 40 Q4 12 22 10 Q40 12 41 40 Z" fill="#ffffff" stroke="#c4dbef" strokeWidth={2} />
  <ellipse cx={15} cy={20} rx={5} ry={3} fill="#eef6ff" />
  <circle cx={28} cy={30} r={1.6} fill="#9ab8d6" />
  <circle cx={33} cy={26} r={1.2} fill="#9ab8d6" />
</>)

// ── 🍭 과자 나라
const Peppermint: Sprite = () => box(<>
  <rect x={4} y={10} width={36} height={38} rx={10} fill="#f3a6c2" />
  <circle cx={22} cy={22} r={17} fill="#ffffff" stroke="#f08aaf" strokeWidth={2} />
  {[0, 60, 120, 180, 240, 300].map(r => <path key={r} d="M22 22 L22 6 A16 16 0 0 1 30 8 Z" fill="#ff5d7e" transform={`rotate(${r} 22 22)`} />)}
  <circle cx={22} cy={22} r={4} fill="#ffffff" />
</>)
const Choco: Sprite = () => box(<>
  <rect x={0} y={8} width={44} height={42} rx={4} fill="#6b4130" />
  <rect x={0} y={2} width={44} height={40} rx={5} fill="#8b5a42" />
  <rect x={4} y={6} width={16} height={14} rx={2} fill="#9c6a50" />
  <rect x={24} y={6} width={16} height={14} rx={2} fill="#9c6a50" />
  <rect x={4} y={24} width={16} height={14} rx={2} fill="#9c6a50" />
  <rect x={24} y={24} width={16} height={14} rx={2} fill="#9c6a50" />
</>)
const Cake: Sprite = () => box(<>
  <rect x={4} y={18} width={36} height={30} rx={5} fill="#f7d9a8" stroke="#e2b77a" strokeWidth={2} />
  <rect x={4} y={30} width={36} height={4} fill="#ff9ab8" />
  <path d="M4 20 Q4 10 22 10 Q40 10 40 20 Q36 26 32 20 Q28 27 22 20 Q16 27 12 20 Q8 26 4 20 Z" fill="#ffd1e1" stroke="#f3a6c2" strokeWidth={1.5} />
  <circle cx={22} cy={8} r={4.5} fill="#ff4d6a" />
  <path d="M22 4 q3 -4 6 -3" fill="none" stroke="#3f8f4f" strokeWidth={1.5} strokeLinecap="round" />
</>)

// ── 🏖 해변
const Rock: Sprite = () => box(<>
  <path d="M3 44 Q2 16 14 8 Q26 2 36 10 Q44 20 41 44 Z" fill="#9c8f80" />
  <path d="M3 38 Q2 14 14 6 Q26 0 36 8 Q43 18 41 38 Z" fill="#c2b5a4" />
  <path d="M12 12 Q18 8 24 10" stroke="#ddd3c6" strokeWidth={3} fill="none" strokeLinecap="round" />
</>)
const Sea: Sprite = () => box(<>
  <rect x={0} y={0} width={44} height={50} fill="#69bfe8" />
  <path d="M0 14 q6 -5 11 0 t11 0 t11 0 t11 0" stroke="#e6f6ff" strokeWidth={2.5} fill="none" />
  <path d="M0 32 q6 -5 11 0 t11 0 t11 0 t11 0" stroke="#bfe6fa" strokeWidth={2} fill="none" />
</>)
const SandCastle: Sprite = () => box(<>
  <rect x={6} y={18} width={32} height={30} rx={3} fill="#e8c582" stroke="#c99f55" strokeWidth={2} />
  <rect x={4} y={10} width={10} height={14} rx={1.5} fill="#f0cf8f" stroke="#c99f55" strokeWidth={2} />
  <rect x={30} y={10} width={10} height={14} rx={1.5} fill="#f0cf8f" stroke="#c99f55" strokeWidth={2} />
  <path d="M4 10 v-3 h3 v3 M11 10 v-3 h3 v3 M30 10 v-3 h3 v3 M37 10 v-3 h3 v3" stroke="#c99f55" strokeWidth={2} fill="#f0cf8f" />
  <path d="M18 48 v-10 q4 -5 8 0 v10" fill="#c99f55" />
  <path d="M22 18 v-10 l8 3 -8 3" fill="#ff7a59" stroke="#c94c32" strokeWidth={1} />
</>)
export const Water: Sprite = () => (
  <svg viewBox="0 0 44 44" width={TILE} height={TILE}>
    <rect x={0} y={0} width={44} height={44} rx={10} fill="#7fcdf0" />
    <path d="M6 16 q5 -4 10 0 t10 0 t10 0" stroke="#e6f6ff" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    <path d="M10 30 q5 -4 10 0 t10 0" stroke="#c3e9fb" strokeWidth={2} fill="none" strokeLinecap="round" />
  </svg>
)

// ── 🎡 밤 놀이공원 (남색 밤하늘)
const Lamp: Sprite = () => box(<>
  <rect x={4} y={10} width={36} height={38} rx={8} fill="#1f2c45" />
  <rect x={4} y={4} width={36} height={36} rx={8} fill="#2c3d5e" stroke="#425a85" strokeWidth={1.5} />
  <circle cx={22} cy={20} r={9} fill="#ffe27a" opacity={0.35} />
  <circle cx={22} cy={20} r={5} fill="#fff1a8" />
</>)
const Fence: Sprite = () => box(<>
  <rect x={0} y={8} width={44} height={42} rx={4} fill="#17223a" />
  <rect x={0} y={2} width={44} height={40} rx={5} fill="#22314f" />
  <path d="M0 10 Q22 20 44 10" stroke="#3a4f78" strokeWidth={1.5} fill="none" />
  {[[6, 12, '#ffe27a'], [16, 15.5, '#7fe0c3'], [27, 15.5, '#ff9f7a'], [38, 12, '#ffe27a']].map(([x, y, c]) => (
    <circle key={String(x)} cx={Number(x)} cy={Number(y)} r={3} fill={String(c)} />
  ))}
</>)
const GiftBox: Sprite = () => box(<>
  <rect x={4} y={14} width={36} height={34} rx={5} fill="#ff8a6b" stroke="#d9603f" strokeWidth={2} />
  <rect x={19} y={14} width={6} height={34} fill="#ffe27a" />
  <rect x={2} y={10} width={40} height={10} rx={3} fill="#ff9f84" stroke="#d9603f" strokeWidth={2} />
  <path d="M22 10 q-10 -9 -12 -2 q4 4 12 2 q8 2 12 -2 q-2 -7 -12 2" fill="#ffe27a" stroke="#d6a91a" strokeWidth={1.2} />
</>)

// ── 배치 맵용 두 번째 벽 그림
const Tree: Sprite = () => box(<>
  <ellipse cx={22} cy={45} rx={15} ry={4} fill="#000" opacity={0.12} />
  <rect x={18} y={30} width={8} height={15} rx={2} fill="#8a5a36" />
  <circle cx={22} cy={20} r={17} fill="#4f9a45" />
  <circle cx={14} cy={16} r={9} fill="#68b55b" />
  <circle cx={29} cy={12} r={7} fill="#7cc46c" />
  <circle cx={30} cy={26} r={2.4} fill="#ff8a6b" />
  <circle cx={13} cy={26} r={2} fill="#ff8a6b" />
</>)
const SnowPine: Sprite = () => box(<>
  <ellipse cx={22} cy={46} rx={14} ry={3.5} fill="#7d97b2" opacity={0.3} />
  <rect x={19} y={36} width={6} height={10} rx={1.5} fill="#7a5134" />
  <path d="M22 2 L37 22 L30 22 L40 38 L4 38 L14 22 L7 22 Z" fill="#3f7a5c" />
  <path d="M22 2 L30 13 Q22 10 14 13 Z M14 22 Q22 18 30 22 L33 26 Q22 22 11 26 Z" fill="#ffffff" />
  <path d="M7 36 Q22 31 37 36 L40 38 L4 38 Z" fill="#ffffff" />
</>)
const Palm: Sprite = () => box(<>
  <ellipse cx={22} cy={46} rx={12} ry={3.5} fill="#000" opacity={0.12} />
  <path d="M20 46 Q18 30 23 16 L26 16 Q22 30 25 46 Z" fill="#b5834f" stroke="#8c6236" strokeWidth={1} />
  <path d="M24 16 Q12 6 2 14 Q12 10 24 18 Z" fill="#4fae5a" />
  <path d="M24 16 Q36 4 43 14 Q34 10 24 18 Z" fill="#5cbf66" />
  <path d="M24 16 Q20 2 8 4 Q18 6 24 17 Z" fill="#6bcb73" />
  <path d="M24 16 Q30 0 40 5 Q30 6 24 17 Z" fill="#4fae5a" />
  <circle cx={22} cy={19} r={2.6} fill="#8c6236" />
  <circle cx={26} cy={19.5} r={2.4} fill="#7a5530" />
</>)
const Lollipop: Sprite = () => box(<>
  <ellipse cx={22} cy={46} rx={11} ry={3.5} fill="#000" opacity={0.1} />
  <rect x={20} y={24} width={4} height={22} rx={2} fill="#ffffff" stroke="#e7c9d4" strokeWidth={1} />
  <circle cx={22} cy={16} r={14} fill="#7fd6c2" stroke="#4fb39c" strokeWidth={2} />
  <path d="M22 16 m-9 0 a9 9 0 1 0 9 -9 a6 6 0 1 0 6 6 a3 3 0 1 0 -3 3" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" />
</>)
const Carousel: Sprite = () => box(<>
  <ellipse cx={22} cy={45} rx={18} ry={4} fill="#000" opacity={0.25} />
  <rect x={6} y={18} width={32} height={26} rx={4} fill="#2c3d5e" stroke="#425a85" strokeWidth={1.5} />
  <path d="M2 20 L22 4 L42 20 Z" fill="#ff8a6b" stroke="#ffe27a" strokeWidth={1.5} />
  <path d="M12 20 L22 4 L32 20" fill="none" stroke="#ffe27a" strokeWidth={1.2} />
  {[11, 22, 33].map(x => <circle key={x} cx={x} cy={30} r={3} fill="#ffe27a" opacity={0.9} />)}
  <circle cx={22} cy={4} r={2.2} fill="#fff1a8" />
</>)

export const THEMES: Record<MapId, BombTheme> = {
  forest: { floor: ['#bde8a6', '#b1e199'], frame: 'rgba(60,90,40,.25)', wall: Stone, wall2: Tree, border: Hedge, block: Crate },
  snow: { floor: ['#eef6ff', '#e1edfa'], frame: 'rgba(60,100,150,.25)', wall: IceBlock, wall2: SnowPine, border: Pine, block: SnowMound },
  candy: { floor: ['#ffe8f1', '#ffdbea'], frame: 'rgba(200,90,130,.25)', wall: Peppermint, wall2: Lollipop, border: Choco, block: Cake },
  beach: { floor: ['#fbe9bd', '#f6dea8'], frame: 'rgba(160,120,50,.25)', wall: Rock, wall2: Palm, border: Sea, block: SandCastle },
  park: { floor: ['#33456a', '#2d3e60'], frame: 'rgba(15,25,50,.45)', wall: Lamp, wall2: Carousel, border: Fence, block: GiftBox, dark: true },
}

// 얼음 칸 (바닥 위)
export function IceTile() {
  return (
    <svg viewBox="0 0 44 44" width={TILE} height={TILE}>
      <rect x={1} y={1} width={42} height={42} rx={6} fill="#bfe4fb" opacity={0.75} />
      <path d="M9 12 L17 12 M9 17 L13 17 M28 32 L35 25" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M33 9 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2 Z" fill="#ffffff" />
    </svg>
  )
}

// 순간이동 문 (짝마다 색)
export function PortalTile({ pair }: { pair: number }) {
  const c = ['#7fe0c3', '#ffe27a', '#ff9f7a'][pair % 3]
  return (
    <svg viewBox="0 0 44 44" width={TILE} height={TILE} className="ba-portal">
      <ellipse cx={22} cy={24} rx={17} ry={14} fill={c} opacity={0.25} />
      <ellipse cx={22} cy={24} rx={15} ry={12} fill="none" stroke={c} strokeWidth={3.5} />
      <ellipse cx={22} cy={24} rx={8} ry={6} fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.8} />
      <circle cx={22} cy={24} r={2.5} fill="#ffffff" />
    </svg>
  )
}
