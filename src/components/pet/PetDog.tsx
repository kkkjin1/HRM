// 🐶 팀 강아지 그림 — 그림 파일 없이 SVG 한 장(약 3KB). 움직임은 globals.css 의 pet-* 애니메이션(transform만)으로.
// 나이(1~30)에 따라 머리·다리·몸통 비율이 매일 조금씩 바뀐다. 후보 4종 중 A(시바)로 확정, 다음 동물용으로 나머지도 남겨 둔다.
export type Breed = 'shiba' | 'corgi' | 'bichon' | 'beagle'
export type Mood = 'normal' | 'happy' | 'hungry' | 'sad' | 'sleepy' | 'poop'
export type Outfit = 'none' | 'scarf' | 'badge' | 'santa' | 'shades'
export type Pose = 'walk' | 'stand' | 'sit' | 'sleep' | 'sniff' | 'jump' | 'paw' | 'down'

export const BREEDS: { key: Breed; label: string; note: string }[] = [
  { key: 'shiba', label: 'A. 시바 콩떡', note: '주황+흰 볼, 점 눈썹, 말린 꼬리' },
  { key: 'corgi', label: 'B. 코기 식빵', note: '큰 세모 귀, 이마 흰 줄, 아주 짧은 다리' },
  { key: 'bichon', label: 'C. 비숑 솜뭉치', note: '하얀 구름 털, 까만 콩 눈' },
  { key: 'beagle', label: 'D. 비글 점박이', note: '늘어진 큰 귀, 등에 까만 안장' },
]

const LINE = '#4A3426'
const PAL: Record<Breed, { fur: string; dark: string; light: string; line: string }> = {
  shiba: { fur: '#EE9F57', dark: '#D7823C', light: '#FFF4E6', line: LINE },
  corgi: { fur: '#F2A65A', dark: '#DC8A3E', light: '#FFFAF2', line: LINE },
  bichon: { fur: '#FFFFFF', dark: '#EFE8DF', light: '#FFFFFF', line: '#8C7B6B' },
  beagle: { fur: '#DFA165', dark: '#9A6438', light: '#FFF8EE', line: LINE },
}

export default function PetDog({ breed, age, mood, outfit = 'none', pose = 'stand', muddy = false }: { breed: Breed; age: number; mood: Mood; outfit?: Outfit; pose?: Pose; muddy?: boolean }) {
  const t = Math.min(1, Math.max(0, (age - 1) / 29))
  const c = PAL[breed]
  const sw = 1.7
  const ground = 95
  const sitting = pose === 'sit'
  const sleeping = pose === 'sleep' || mood === 'sleepy'
  const lying = pose === 'sleep' || pose === 'down'
  const legH = sitting || lying ? 2.5 : (breed === 'corgi' ? 3.5 : 5) + (breed === 'corgi' ? 2 : 5) * t
  const rx = 14 + 9 * t + (breed === 'corgi' ? 3 : 0)
  const ry = 11 + 3.5 * t
  const bx = 40
  const by = ground - legH - ry + 2 + (lying ? 3 : 0)
  const headR = 21 - 2.5 * t
  const hx = bx + rx * 0.55 + 6 + (pose === 'sniff' ? 5 : 0)
  const hy = by - ry * 0.55 - headR * 0.55 + (pose === 'sniff' ? 10 : 0) + (lying ? 11 : 0) + (sitting ? -2 : 0)
  const legXs = [bx - rx * 0.62, bx - rx * 0.22, bx + rx * 0.22, bx + rx * 0.6]
  const wag = mood === 'happy' ? 'pet-wag-fast' : mood === 'sad' || sleeping ? '' : 'pet-wag'
  const tailX = bx - rx + 3, tailY = by - ry * 0.35

  /* 눈·입 */
  const exL = hx - 8, exR = hx + 8, ey = hy + 1
  const eyeRx = (breed === 'bichon' ? 3.4 : 3.1) + (1 - t) * 0.9
  const eyeRy = eyeRx * 1.18
  const eyes = sleeping
    ? <g stroke={LINE} strokeWidth={1.7} fill="none" strokeLinecap="round"><path d={`M${exL - 3} ${ey} q3 2.6 6 0`} /><path d={`M${exR - 3} ${ey} q3 2.6 6 0`} /></g>
    : mood === 'happy'
      ? <g stroke={LINE} strokeWidth={1.9} fill="none" strokeLinecap="round"><path d={`M${exL - 3} ${ey + 1.2} q3 -4.2 6 0`} /><path d={`M${exR - 3} ${ey + 1.2} q3 -4.2 6 0`} /></g>
      : (
        <g>
          {[exL, exR].map(x => (
            <g key={x}>
              <ellipse cx={x} cy={ey} rx={eyeRx} ry={eyeRy} fill="#2B1D16" />
              <circle cx={x + 1.1} cy={ey - 1.5} r={1.35} fill="#fff" />
              <circle cx={x - 1.1} cy={ey + 1.4} r={0.6} fill="#fff" />
            </g>
          ))}
          {mood === 'sad' && <g stroke={LINE} strokeWidth={1.3} strokeLinecap="round"><path d={`M${exL - 4.5} ${ey - 4.6} l5.5 -2.4`} /><path d={`M${exR + 4.5} ${ey - 4.6} l-5.5 -2.4`} /></g>}
          {mood === 'sad' && <path className="pet-tear" d={`M${exR + 2} ${ey + 4} q2 3.6 0 5 q-2 -1.4 0 -5z`} fill="#7CC4F2" />}
        </g>
      )
  const mx = hx, my = hy + 9
  const mouth = mood === 'hungry'
    ? <g><ellipse cx={mx} cy={my + 2.4} rx={2.8} ry={2.6} fill="#8E3B34" stroke={LINE} strokeWidth={1.1} /><path className="pet-drool" d={`M${mx + 2.5} ${my + 4} q1 3 0 4.5`} stroke="#8FD0F5" strokeWidth={1.4} fill="none" strokeLinecap="round" /></g>
    : mood === 'happy'
      ? <g><path d={`M${mx - 4} ${my} q4 6.5 8 0z`} fill="#E86F6F" stroke={LINE} strokeWidth={1.1} strokeLinejoin="round" /><path d={`M${mx - 1.6} ${my + 3} q1.6 2 3.2 0`} fill="#F7A3A3" /></g>
      : mood === 'sad'
        ? <path d={`M${mx - 3} ${my + 2.6} q3 -2.6 6 0`} stroke={LINE} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        : <path d={`M${mx - 3.6} ${my} q1.8 2.4 3.6 0 q1.8 2.4 3.6 0`} stroke={LINE} strokeWidth={1.3} fill="none" strokeLinecap="round" />

  /* 귀 */
  const earFlop = (1 - t) * 18 + (mood === 'sad' ? 22 : 0)
  const ears = (() => {
    if (breed === 'shiba' || breed === 'corgi') {
      const h = breed === 'corgi' ? 17 + 3 * t : 12 + 3 * t
      const w = breed === 'corgi' ? 7 : 6
      const one = (side: 1 | -1) => {
        const bx0 = hx + side * 9
        const tip = `${bx0 + side * 6} ${hy - headR - h + 8}`
        return (
          <g key={side} style={{ transformOrigin: `${bx0}px ${hy - headR + 8}px`, transform: `rotate(${side * earFlop}deg)` }}>
            <path d={`M${bx0 - w} ${hy - headR + 10} L${tip} L${bx0 + side * 2 + w} ${hy - headR + 12}z`} fill={c.fur} stroke={c.line} strokeWidth={sw} strokeLinejoin="round" />
            <path d={`M${bx0 - w * 0.4} ${hy - headR + 10} L${bx0 + side * 5} ${hy - headR - h + 13} L${bx0 + side * 2 + w * 0.5} ${hy - headR + 11}z`} fill="#F6B7A8" />
          </g>
        )
      }
      return [one(-1), one(1)]
    }
    if (breed === 'beagle') {
      return [-1, 1].map(side => (
        <ellipse key={side} cx={hx + side * (headR - 2)} cy={hy + 4} rx={6.5} ry={13 + 2 * t} fill={c.dark} stroke={c.line} strokeWidth={sw}
          style={{ transformOrigin: `${hx + side * (headR - 4)}px ${hy - 8}px`, transform: `rotate(${side * (12 + (mood === 'sad' ? 4 : 0))}deg)` }} />
      ))
    }
    // bichon: 몽글한 귀털
    return [-1, 1].map(side => (
      <g key={side} fill={c.fur} stroke={c.line} strokeWidth={1.3}>
        <circle cx={hx + side * (headR - 1)} cy={hy + 2} r={6.5} /><circle cx={hx + side * (headR + 1)} cy={hy + 9} r={5.5} />
      </g>
    ))
  })()

  /* 머리 모양 */
  const head = breed === 'bichon'
    ? (
      <g fill={c.fur} stroke={c.line} strokeWidth={1.3}>
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2
          return <circle key={i} cx={hx + Math.cos(a) * headR * 0.78} cy={hy + Math.sin(a) * headR * 0.74} r={headR * 0.36} />
        })}
        <circle cx={hx} cy={hy} r={headR * 0.82} stroke="none" />
      </g>
    )
    : <ellipse cx={hx} cy={hy} rx={headR} ry={headR * 0.92} fill={c.fur} stroke={c.line} strokeWidth={sw} />

  const body = breed === 'bichon'
    ? (
      <g fill={c.fur} stroke={c.line} strokeWidth={1.3}>
        {Array.from({ length: 9 }).map((_, i) => {
          const a = (i / 9) * Math.PI * 2
          return <circle key={i} cx={bx + Math.cos(a) * rx * 0.75} cy={by + Math.sin(a) * ry * 0.65} r={ry * 0.55} />
        })}
        <ellipse cx={bx} cy={by} rx={rx * 0.8} ry={ry * 0.75} stroke="none" />
      </g>
    )
    : <ellipse cx={bx} cy={by} rx={rx} ry={ry} fill={c.fur} stroke={c.line} strokeWidth={sw} />

  const tail = breed === 'shiba'
    ? <path d={`M${tailX + 2} ${tailY + 2} q-9 -4 -6 -12 q4 -6 9 -1 q2 4 -3 5`} fill="none" stroke={c.line} strokeWidth={6.5} strokeLinecap="round" />
    : breed === 'bichon'
      ? <circle cx={tailX - 2} cy={tailY - 4} r={6} fill={c.fur} stroke={c.line} strokeWidth={1.3} />
      : breed === 'corgi'
        ? <ellipse cx={tailX - 2} cy={tailY - 1} rx={5} ry={4} fill={c.fur} stroke={c.line} strokeWidth={sw} />
        : <path d={`M${tailX} ${tailY} q-6 -6 -4 -15`} fill="none" stroke={c.line} strokeWidth={6} strokeLinecap="round" />
  const tailInner = breed === 'shiba'
    ? <path d={`M${tailX + 2} ${tailY + 2} q-9 -4 -6 -12 q4 -6 9 -1 q2 4 -3 5`} fill="none" stroke={c.fur} strokeWidth={3.4} strokeLinecap="round" />
    : breed === 'beagle'
      ? <g><path d={`M${tailX} ${tailY} q-6 -6 -4 -15`} fill="none" stroke={c.fur} strokeWidth={3} strokeLinecap="round" /><circle cx={tailX - 4} cy={tailY - 15} r={2} fill="#fff" /></g>
      : null

  return (
    <svg viewBox="0 8 100 92" className={`pet-svg ${pose === 'walk' ? 'pet-walking' : ''} ${pose === 'jump' ? 'pet-jump' : ''}`} style={{ overflow: 'visible' }}>
      <ellipse cx={bx + 8} cy={ground + 1.2} rx={rx + 12} ry={2.8} fill="#000" opacity={0.09} />
      <g className={wag} style={{ transformOrigin: `${tailX + 2}px ${tailY + 2}px` }}>{tail}{tailInner}</g>
      {/* 다리 */}
      {legXs.map((x, i) => (
        <g key={i} className={i % 2 ? 'pet-leg-b' : 'pet-leg-a'} style={{ transformOrigin: `${x}px ${by + ry - 4}px`, transform: pose === 'paw' && i === 3 ? 'rotate(-70deg)' : undefined }}>
          <rect x={x - 3.6} y={by + ry - 6} width={7.2} height={legH + 6.5} rx={3.6} fill={i === 0 || i === 2 ? c.dark : c.fur} stroke={c.line} strokeWidth={1.4} />
          <ellipse cx={x} cy={by + ry + legH - 0.2} rx={3.2} ry={1.6} fill={c.light} />
        </g>
      ))}
      {body}
      {breed !== 'bichon' && <ellipse cx={bx + rx * 0.25} cy={by + ry * 0.35} rx={rx * 0.5} ry={ry * 0.5} fill={c.light} />}
      {breed === 'beagle' && <path d={`M${bx - rx * 0.85} ${by - ry * 0.2} q${rx * 0.6} ${-ry * 1.1} ${rx * 1.3} ${-ry * 0.55} q${-rx * 0.3} ${ry * 0.7} ${-rx * 1.3} ${ry * 0.55}z`} fill="#3E3733" />}
      {muddy && <g fill="#7A5A3A" opacity={0.8}><circle cx={bx - 6} cy={by + 3} r={3.2} /><circle cx={bx + 6} cy={by - 3} r={2.3} /><circle cx={bx - 13} cy={by + 6} r={1.9} /></g>}
      {outfit === 'scarf' && <g><path d={`M${hx - 14} ${hy + headR * 0.78} q14 7 28 0`} stroke="#D94A4A" strokeWidth={6} fill="none" strokeLinecap="round" /><rect x={hx - 10} y={hy + headR * 0.85} width={5} height={11} rx={2} fill="#C13B3B" transform={`rotate(14 ${hx - 8} ${hy + headR})`} /></g>}
      {ears}
      {head}
      {/* 얼굴 무늬 */}
      {breed === 'shiba' && <g fill={c.light}><ellipse cx={hx - 10} cy={hy + 8} rx={8} ry={6.5} /><ellipse cx={hx + 10} cy={hy + 8} rx={8} ry={6.5} /><ellipse cx={hx - 8} cy={hy - 7} rx={2.2} ry={1.4} /><ellipse cx={hx + 8} cy={hy - 7} rx={2.2} ry={1.4} /></g>}
      {(breed === 'corgi' || breed === 'beagle') && <path d={`M${hx - 2.5} ${hy - headR + 3} q2.5 -1 5 0 l3 ${headR * 0.6} h-11z`} fill={c.light} />}
      {breed !== 'bichon' && <ellipse cx={hx} cy={hy + 8.5} rx={9.5} ry={6.8} fill={c.light} />}
      {muddy && <circle cx={hx - 9} cy={hy - 9} r={2.6} fill="#7A5A3A" opacity={0.8} />}
      <ellipse cx={hx - 15} cy={hy + 7} rx={3.8} ry={2.2} fill="#F49C9C" opacity={mood === 'sad' ? 0.3 : 0.65} />
      <ellipse cx={hx + 15} cy={hy + 7} rx={3.8} ry={2.2} fill="#F49C9C" opacity={mood === 'sad' ? 0.3 : 0.65} />
      {eyes}
      <ellipse cx={hx} cy={hy + 5.6} rx={3} ry={2.1} fill="#2B1D16" />
      <ellipse cx={hx - 0.8} cy={hy + 5} rx={0.9} ry={0.5} fill="#fff" opacity={0.8} />
      {mouth}
      {outfit === 'santa' && <g><path d={`M${hx - 15} ${hy - headR + 7} q10 -24 31 -4z`} fill="#D94A4A" stroke={LINE} strokeWidth={1.3} /><rect x={hx - 17} y={hy - headR + 4} width={34} height={6.5} rx={3.2} fill="#fff" stroke={LINE} strokeWidth={1.1} /><circle cx={hx + 17} cy={hy - headR - 5} r={3.6} fill="#fff" stroke={LINE} strokeWidth={1.1} /></g>}
      {outfit === 'shades' && <g><rect x={exL - 5} y={ey - 4} width={10} height={7} rx={2.6} fill="#1E1E1E" /><rect x={exR - 5} y={ey - 4} width={10} height={7} rx={2.6} fill="#1E1E1E" /><path d={`M${exL + 5} ${ey - 1.5} h6`} stroke="#1E1E1E" strokeWidth={1.4} /><path d={`M${exL - 3} ${ey - 2.6} l3 -1`} stroke="#fff" strokeWidth={0.9} opacity={0.6} /></g>}
      {outfit === 'badge' && <g><path d={`M${hx - 9} ${hy + headR * 0.7} L${hx} ${hy + headR + 10} L${hx + 9} ${hy + headR * 0.7}`} stroke="#2F6FD6" strokeWidth={1.6} fill="none" /><rect x={hx - 5} y={hy + headR + 8} width={10} height={12} rx={1.6} fill="#fff" stroke="#2F6FD6" strokeWidth={1.2} /><rect x={hx - 3} y={hy + headR + 10} width={6} height={3.6} rx={0.6} fill="#9CC0F5" /></g>}
      {sleeping && <text className="pet-zzz" x={hx + 18} y={hy - 14} fontSize={10} fill="#7B8AA6" fontWeight={800}>z</text>}
      {mood === 'poop' && <text x={hx + 17} y={hy - 12} fontSize={10}>💦</text>}
    </svg>
  )
}
