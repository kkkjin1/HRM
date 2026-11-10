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

export const THEMES: Record<MapId, BombTheme> = {
  forest: { floor: ['#bde8a6', '#b1e199'], frame: 'rgba(60,90,40,.25)', wall: Stone, border: Hedge, block: Crate },
  snow: { floor: ['#eef6ff', '#e1edfa'], frame: 'rgba(60,100,150,.25)', wall: IceBlock, border: Pine, block: SnowMound },
  candy: { floor: ['#ffe8f1', '#ffdbea'], frame: 'rgba(200,90,130,.25)', wall: Peppermint, border: Choco, block: Cake },
  beach: { floor: ['#fbe9bd', '#f6dea8'], frame: 'rgba(160,120,50,.25)', wall: Rock, border: Sea, block: SandCastle },
  park: { floor: ['#33456a', '#2d3e60'], frame: 'rgba(15,25,50,.45)', wall: Lamp, border: Fence, block: GiftBox, dark: true },
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
