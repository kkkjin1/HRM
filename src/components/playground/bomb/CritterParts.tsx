// 💣 폭탄 놀이터 캐릭터 꾸미기 부품. 좌표는 Critter의 100x100 좌표계 기준.
// 모자는 (50, 20)이 머리 꼭대기가 되도록 그리고, Critter가 종마다 위치·크기를 맞춘다.
// 얼굴 부품은 눈 높이(eyeY) 기준, 눈 가로 위치는 38.5 / 61.5.

export type HatPart = 'none' | 'strawberry' | 'crown' | 'beanie' | 'ribbon' | 'party' | 'cap' | 'flower' | 'chick' | 'sprout'
export type FacePart = 'none' | 'glasses' | 'sunglasses' | 'heartBlush' | 'freckles' | 'star' | 'mustache' | 'bandage'
export type BackPart = 'none' | 'wings' | 'batWings' | 'cape' | 'backpack' | 'balloon'
export type OutfitPart = 'none' | 'scarf' | 'bowtie' | 'stripe' | 'overalls' | 'sweater' | 'raincoat'

export const HATS: [HatPart, string][] = [
  ['none', '없음'], ['strawberry', '딸기 모자'], ['crown', '왕관'], ['beanie', '방울 털모자'], ['ribbon', '리본'],
  ['party', '고깔모자'], ['cap', '야구모자'], ['flower', '꽃핀'], ['chick', '병아리'], ['sprout', '새싹'],
]
export const FACES: [FacePart, string][] = [
  ['none', '없음'], ['glasses', '동그란 안경'], ['sunglasses', '선글라스'], ['heartBlush', '하트 볼터치'],
  ['freckles', '주근깨'], ['star', '별 스티커'], ['mustache', '콧수염'], ['bandage', '반창고'],
]
export const BACKS: [BackPart, string][] = [
  ['none', '없음'], ['wings', '천사 날개'], ['batWings', '박쥐 날개'], ['cape', '망토'], ['backpack', '책가방'], ['balloon', '풍선'],
]
export const OUTFITS: [OutfitPart, string][] = [
  ['none', '없음'], ['scarf', '목도리'], ['bowtie', '나비넥타이'], ['stripe', '줄무늬 티'], ['overalls', '멜빵바지'],
  ['sweater', '니트'], ['raincoat', '우비'],
]

const LJ = { strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

export function FaceDeco({ part, eyeY }: { part: FacePart; eyeY: number }) {
  const by = eyeY + 7.5
  switch (part) {
    case 'glasses':
      return (
        <g fill="none" stroke="#3a2a2a" strokeWidth={2}>
          <circle cx={38.5} cy={eyeY} r={8} fill="#fff" fillOpacity={0.15} />
          <circle cx={61.5} cy={eyeY} r={8} fill="#fff" fillOpacity={0.15} />
          <path d={`M46.5 ${eyeY - 1} q3.5 -3 7 0`} />
        </g>
      )
    case 'sunglasses':
      return (
        <g {...LJ}>
          <path d={`M28 ${eyeY - 5} h18 q1 9 -8 10 q-9 0 -10 -10 Z`} fill="#2b2b36" stroke="#15151c" strokeWidth={1.6} />
          <path d={`M54 ${eyeY - 5} h18 q-1 10 -10 10 q-9 -1 -8 -10 Z`} fill="#2b2b36" stroke="#15151c" strokeWidth={1.6} />
          <path d={`M46 ${eyeY - 4} q4 -2 8 0`} fill="none" stroke="#15151c" strokeWidth={2} />
          <path d={`M31 ${eyeY - 2.5} l4 0 M57 ${eyeY - 2.5} l4 0`} stroke="#fff" strokeWidth={1.6} opacity={0.7} />
        </g>
      )
    case 'heartBlush':
      return (
        <g fill="#ff6f93" opacity={0.85}>
          {[31, 69].map(x => (
            <path key={x} d={`M${x} ${by + 3} l-4.2 -4 a2.4 2.4 0 0 1 4.2 -2.8 a2.4 2.4 0 0 1 4.2 2.8 Z`} />
          ))}
        </g>
      )
    case 'freckles':
      return (
        <g fill="#b97c5a" opacity={0.8}>
          {[[29, by - 2], [33, by - 3], [31, by + 1], [71, by - 2], [67, by - 3], [69, by + 1]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.95} />)}
        </g>
      )
    case 'star':
      return (
        <path
          d={`M70 ${eyeY - 13} l1.9 3.9 4.3 0.6 -3.1 3 0.7 4.3 -3.8 -2 -3.8 2 0.7 -4.3 -3.1 -3 4.3 -0.6 Z`}
          fill="#ffd34d" stroke="#e0a91c" strokeWidth={1} strokeLinejoin="round"
        />
      )
    case 'mustache':
      return (
        <path
          d={`M50 ${eyeY + 8} q-4 -3 -8 -1 q-4 2 -7 -1 q1 5 7 5 q5 0 8 -3 q3 3 8 3 q6 0 7 -5 q-3 3 -7 1 q-4 -2 -8 1 Z`}
          fill="#5a3b2c" stroke="#3a2418" strokeWidth={0.8} strokeLinejoin="round"
        />
      )
    case 'bandage':
      return (
        <g transform={`rotate(-20 69 ${eyeY + 9})`}>
          <rect x={62} y={eyeY + 6} width={14} height={6} rx={3} fill="#ffe0bd" stroke="#d8a77a" strokeWidth={1} />
          <rect x={67} y={eyeY + 6} width={4} height={6} fill="#f3c99c" />
        </g>
      )
    default:
      return null
  }
}

export function Hat({ part }: { part: HatPart }) {
  switch (part) {
    case 'strawberry':
      return (
        <g>
          <path d="M30 24 Q50 -6 70 24 Q50 30 30 24 Z" fill="#ff5d6e" stroke="#c93a4b" strokeWidth={2} strokeLinejoin="round" />
          {[[40, 14], [50, 10], [60, 14], [45, 20], [55, 20], [37, 21], [63, 21]].map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={1} ry={1.5} fill="#ffe680" />
          ))}
          <path d="M50 5 l-7 -3 l4 4 l-6 1 l7 2 l2 -5 l2 5 l7 -2 l-6 -1 l4 -4 Z" fill="#5dc46a" stroke="#3a9448" strokeWidth={1} strokeLinejoin="round" />
          <path d="M50 4 q1 -5 3 -6" fill="none" stroke="#3a9448" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      )
    case 'crown':
      return (
        <g strokeLinejoin="round">
          <path d="M35 24 L34 8 L42 15 L50 4 L58 15 L66 8 L65 24 Z" fill="#ffd34d" stroke="#d29a17" strokeWidth={2} />
          <circle cx={50} cy={18} r={2.6} fill="#ff6b81" />
          <circle cx={34} cy={8} r={1.8} fill="#ffd34d" stroke="#d29a17" strokeWidth={1} />
          <circle cx={50} cy={4} r={1.8} fill="#ffd34d" stroke="#d29a17" strokeWidth={1} />
          <circle cx={66} cy={8} r={1.8} fill="#ffd34d" stroke="#d29a17" strokeWidth={1} />
        </g>
      )
    case 'beanie':
      return (
        <g {...LJ}>
          <path d="M28 25 Q29 -2 50 -1 Q71 -2 72 25 Z" fill="#7ec8f0" stroke="#4a94bf" strokeWidth={2} />
          {[38, 46, 54, 62].map(x => <path key={x} d={`M${x} 3 q-1 9 0 18`} fill="none" stroke="#5aaad8" strokeWidth={1.4} />)}
          <rect x={26} y={19} width={48} height={9} rx={4.5} fill="#ffffff" stroke="#4a94bf" strokeWidth={2} />
          <circle cx={50} cy={-4} r={6} fill="#ffffff" stroke="#4a94bf" strokeWidth={2} />
        </g>
      )
    case 'ribbon':
      return (
        <g transform="translate(14 0)" {...LJ} stroke="#d9466f" strokeWidth={1.8}>
          <path d="M50 16 L38 8 Q35 16 38 24 Z" fill="#ff7aa2" />
          <path d="M50 16 L62 8 Q65 16 62 24 Z" fill="#ff7aa2" />
          <path d="M48 18 l-4 9 M52 18 l4 9" fill="none" />
          <circle cx={50} cy={16} r={3.6} fill="#ff98b8" />
        </g>
      )
    case 'party':
      return (
        <g {...LJ} transform="rotate(10 50 22)">
          <path d="M39 25 L50 -8 L61 25 Z" fill="#7cc6ff" stroke="#3f8fd0" strokeWidth={2} />
          <path d="M42.5 15 L57.5 15 M45.8 5 L54.2 5" stroke="#ffffff" strokeWidth={3} />
          <circle cx={50} cy={-9} r={4} fill="#ffd34d" stroke="#d29a17" strokeWidth={1.4} />
          <path d="M37 25 q13 4 26 0" fill="none" stroke="#3f8fd0" strokeWidth={2} />
        </g>
      )
    case 'cap':
      return (
        <g {...LJ}>
          <path d="M22 22 Q22 26 34 25 L44 23 Z" fill="#2f66c9" stroke="#1d4590" strokeWidth={2} />
          <path d="M30 24 Q30 2 50 2 Q70 2 70 24 Q50 27 30 24 Z" fill="#3b7be0" stroke="#1d4590" strokeWidth={2} />
          <path d="M50 3 L50 24" stroke="#2d63c0" strokeWidth={1.4} />
          <circle cx={50} cy={2} r={2.4} fill="#2f66c9" stroke="#1d4590" strokeWidth={1.4} />
          <circle cx={58} cy={14} r={4} fill="#ffffff" />
          <path d="M56.4 14 h3.2 M58 12.4 v3.2" stroke="#3b7be0" strokeWidth={1.4} />
        </g>
      )
    case 'flower':
      return (
        <g transform="translate(15 1)">
          {[0, 72, 144, 216, 288].map(r => (
            <ellipse key={r} cx={50} cy={10} rx={4.2} ry={6} transform={`rotate(${r} 50 16)`} fill="#fff6a8" stroke="#e0b93a" strokeWidth={1.3} />
          ))}
          <circle cx={50} cy={16} r={3.8} fill="#ffa53a" stroke="#d97a1c" strokeWidth={1.3} />
        </g>
      )
    case 'chick':
      return (
        <g {...LJ}>
          <ellipse cx={50} cy={13} rx={10} ry={9} fill="#ffe27a" stroke="#d8ad2a" strokeWidth={1.8} />
          <path d="M47 4.5 q1 -5 4 -4 q-2 2 -1 4.5" fill="#ffe27a" stroke="#d8ad2a" strokeWidth={1.4} />
          <circle cx={46.5} cy={12} r={1.4} fill="#2a1f26" />
          <circle cx={53.5} cy={12} r={1.4} fill="#2a1f26" />
          <path d="M48.5 14.5 L51.5 14.5 L50 16.8 Z" fill="#ffa53a" stroke="#d97a1c" strokeWidth={0.8} />
          <ellipse cx={44} cy={15.5} rx={1.8} ry={1.1} fill="#ff9db0" opacity={0.7} />
          <ellipse cx={56} cy={15.5} rx={1.8} ry={1.1} fill="#ff9db0" opacity={0.7} />
        </g>
      )
    case 'sprout':
      return (
        <g {...LJ}>
          <path d="M50 21 Q50 12 50 7" fill="none" stroke="#4c9e4a" strokeWidth={2.2} />
          <path d="M50 9 Q41 1 36 7 Q42 13 50 9 Z" fill="#7fd67a" stroke="#4c9e4a" strokeWidth={1.6} />
          <path d="M50 8 Q59 -1 64 5 Q58 12 50 8 Z" fill="#8fe08a" stroke="#4c9e4a" strokeWidth={1.6} />
        </g>
      )
    default:
      return null
  }
}

// 몸 뒤에 그리는 부분
export function Back({ part }: { part: BackPart }) {
  switch (part) {
    case 'wings':
      return (
        <g fill="#ffffff" stroke="#c9d6e8" strokeWidth={2} strokeLinejoin="round">
          <path d="M33 72 C 20 58, 4 62, 6 72 C 2 78, 12 84, 18 80 C 16 88, 28 88, 33 80 Z" />
          <path d="M67 72 C 80 58, 96 62, 94 72 C 98 78, 88 84, 82 80 C 84 88, 72 88, 67 80 Z" />
        </g>
      )
    case 'batWings':
      return (
        <g fill="#46464f" stroke="#26262c" strokeWidth={2} strokeLinejoin="round">
          <path d="M33 72 L10 60 Q12 68 6 72 Q13 74 12 80 Q19 77 22 83 Q26 77 33 80 Z" />
          <path d="M67 72 L90 60 Q88 68 94 72 Q87 74 88 80 Q81 77 78 83 Q74 77 67 80 Z" />
        </g>
      )
    case 'cape':
      return <path d="M30 64 Q50 70 70 64 Q80 78 84 95 Q50 102 16 95 Q20 78 30 64 Z" fill="#ff6b6b" stroke="#c94545" strokeWidth={2} strokeLinejoin="round" />
    case 'backpack':
      return <rect x={24} y={64} width={52} height={28} rx={10} fill="#ffb84d" stroke="#d08a1f" strokeWidth={2} />
    case 'balloon':
      return (
        <g {...LJ}>
          <path d="M70 80 Q80 60 84 40" fill="none" stroke="#9a8a80" strokeWidth={1.2} />
          <ellipse cx={86} cy={26} rx={11} ry={13} fill="#ff7a8a" stroke="#d44b5e" strokeWidth={2} />
          <path d="M84 39 l2 3 l2 -3 Z" fill="#ff7a8a" stroke="#d44b5e" strokeWidth={1.2} />
          <ellipse cx={82} cy={21} rx={3} ry={4.5} fill="#fff" opacity={0.6} />
        </g>
      )
    default:
      return null
  }
}

// 등 부품 중 몸 앞에 보이는 부분 (망토 매듭, 가방끈)
export function BackFront({ part }: { part: BackPart }) {
  if (part === 'cape')
    return (
      <g stroke="#c94545" strokeWidth={1.4} strokeLinejoin="round">
        <path d="M50 74 L42 70 L42 78 Z M50 74 L58 70 L58 78 Z" fill="#ff6b6b" />
        <circle cx={50} cy={74} r={2.4} fill="#ffd34d" stroke="#d29a17" />
      </g>
    )
  if (part === 'backpack')
    return (
      <g fill="#ffb84d" stroke="#d08a1f" strokeWidth={1.4}>
        <rect x={36} y={68} width={5} height={22} rx={2.5} />
        <rect x={59} y={68} width={5} height={22} rx={2.5} />
      </g>
    )
  return null
}

// 몸에 입는 옷 — 몸통 타원으로 잘라 그린다 (clipId는 Critter가 만든 몸통 clipPath)
export function Outfit({ part, clipId }: { part: OutfitPart; clipId: string }) {
  const clip = `url(#${clipId})`
  switch (part) {
    case 'scarf':
      return (
        <g {...LJ} stroke="#c94545" strokeWidth={1.6}>
          <path d="M60 74 l-1 15 q4 1 7 -1 l-1 -13 Z" fill="#ff6b6b" />
          <rect x={31} y={69} width={38} height={9} rx={4.5} fill="#ff6b6b" />
          <path d="M38 70 v7 M45 70 v7 M52 70 v7 M60 70 v7" stroke="#ffffff" strokeWidth={1.6} opacity={0.6} />
          <path d="M60 85 h6" stroke="#ffffff" strokeWidth={1.6} opacity={0.6} />
        </g>
      )
    case 'bowtie':
      return (
        <g {...LJ} stroke="#2a4f9e" strokeWidth={1.4}>
          <path d="M50 77 L41 72.5 L41 81.5 Z" fill="#4a7fe0" />
          <path d="M50 77 L59 72.5 L59 81.5 Z" fill="#4a7fe0" />
          <rect x={47.5} y={74.5} width={5} height={5} rx={1.6} fill="#6b98ea" />
        </g>
      )
    case 'stripe':
      return (
        <g clipPath={clip}>
          <rect x={28} y={64} width={44} height={32} fill="#ffffff" />
          {[69, 75, 81, 87, 93].map(y => <rect key={y} x={28} y={y} width={44} height={3} fill="#6aa8f0" />)}
        </g>
      )
    case 'overalls':
      return (
        <g>
          <g clipPath={clip}>
            <rect x={28} y={83} width={44} height={14} fill="#5b8fd9" />
            <rect x={40} y={73} width={20} height={12} rx={2} fill="#5b8fd9" />
            <path d="M41 73 L35 67 M59 73 L65 67" stroke="#5b8fd9" strokeWidth={4} strokeLinecap="round" />
            <rect x={45} y={77} width={10} height={5} rx={1.5} fill="#4a7bc4" />
          </g>
          <circle cx={42.5} cy={75.5} r={1.5} fill="#ffd34d" />
          <circle cx={57.5} cy={75.5} r={1.5} fill="#ffd34d" />
        </g>
      )
    case 'sweater':
      return (
        <g clipPath={clip}>
          <rect x={28} y={64} width={44} height={32} fill="#ffcf6b" />
          <path d="M28 82 l4 -4 4 4 4 -4 4 4 4 -4 4 4 4 -4 4 4 4 -4 4 4 4 -4" fill="none" stroke="#ffffff" strokeWidth={2} />
          <rect x={28} y={89} width={44} height={6} fill="#f0b845" />
          <path d="M44 66 q6 5 12 0" fill="none" stroke="#f0b845" strokeWidth={3} />
        </g>
      )
    case 'raincoat':
      return (
        <g>
          <g clipPath={clip}>
            <rect x={28} y={64} width={44} height={32} fill="#ffe14d" />
            <path d="M50 70 V96" stroke="#e0b81f" strokeWidth={1.4} />
          </g>
          {[76, 83, 90].map(y => <circle key={y} cx={53} cy={y} r={1.4} fill="#c99a12" />)}
        </g>
      )
    default:
      return null
  }
}
