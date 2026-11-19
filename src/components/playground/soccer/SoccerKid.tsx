'use client'

// ⚽ 축구 선수 그림(SVG) — 유니폼 색(Kit, 야구 장비 연동)·등번호·자세. 위에서 비스듬히 본 옆모습(오른쪽을 봄, facing -1이면 뒤집기).
// 좌표: 40×56 상자, 발끝이 (20, 54). <KidG>는 SVG 안, <SoccerKid>는 HTML 안에 놓는다.

import { memo } from 'react'
import type { Kit } from '@/lib/soccerKit'

export type KidPose = 'stand' | 'run' | 'tackle' | 'down' | 'check' | 'dodge' | 'kick' | 'dive' | 'cheer'
const SKIN = '#F2C7A5'
const HAIR = '#3B2A20'
const BOOT = '#1F2937'

const CAMO: [number, number, number, number, string][] = [[15, 22, 4, 2, '#4A5530'], [24, 26, 4, 2, '#8F9C66'], [18, 30, 5, 2, '#3D4626']]

export function KidG(props: { kit: Kit; number?: number; pose?: KidPose; phase?: number; back?: boolean; name?: string; facing?: 1 | -1 }) {
  const { kit } = props
  const flip = props.facing === -1
  // 뒤집어 그려도 글자(번호·이름)는 바로 읽히게 — 글자만 제자리에서 다시 뒤집는다
  const unflip = (cx: number) => (flip ? `translate(${cx * 2} 0) scale(-1 1)` : undefined)
  const pose = props.pose ?? 'stand'
  const ph = props.phase ?? 0
  const swing = pose === 'run' ? Math.sin(ph) : pose === 'dodge' ? 0.9 : pose === 'kick' ? 1.1 : 0
  // 다리: 엉덩이(20,36)에서 각도
  const leg = (k: 1 | -1) => {
    const a = (k * swing * 32 * Math.PI) / 180
    const L = 15
    return { x: 20 + Math.sin(a) * L + k * 2.2, y: 36 + Math.cos(a) * L }
  }
  const lf = leg(1), lb = leg(-1)
  // 팔: 어깨(앞팔은 몸통 앞쪽 24, 뒷팔은 16)에서 흔들림 — 몸통 가운데(등번호)를 가리지 않게
  const SH = { 1: { x: 24.5, y: 18.5 }, [-1]: { x: 15.5, y: 18.5 } } as const
  const arm = (k: 1 | -1) => {
    const a = (-k * swing * 38 * Math.PI) / 180 + 0.12 * k
    const s0 = SH[k]
    return { sx: s0.x, sy: s0.y, ex: s0.x + Math.sin(a) * 9.5, ey: s0.y + Math.cos(a) * 9.5 }
  }
  const armLine = (r: { sx: number; sy: number; ex: number; ey: number }, w: number, op = 1) => (
    <g opacity={op}>
      <line x1={r.sx} y1={r.sy} x2={r.ex} y2={r.ey} stroke={SKIN} strokeWidth={w} strokeLinecap="round" />
      <line x1={r.sx} y1={r.sy} x2={r.sx + (r.ex - r.sx) * 0.38} y2={r.sy + (r.ey - r.sy) * 0.38} stroke={kit.jersey} strokeWidth={w + 1.2} strokeLinecap="round" />
      <line x1={r.sx + (r.ex - r.sx) * 0.36} y1={r.sy + (r.ey - r.sy) * 0.36} x2={r.sx + (r.ex - r.sx) * 0.42} y2={r.sy + (r.ey - r.sy) * 0.42} stroke={kit.trim} strokeWidth={w + 1.2} />
    </g>
  )
  const af = arm(1), ab = arm(-1)
  const num = props.number ?? 0
  let tf = ''
  if (pose === 'down') tf = 'rotate(-80 20 52) translate(0 4)'
  else if (pose === 'tackle') tf = 'rotate(-58 20 52) translate(-2 6)'
  else if (pose === 'check') tf = 'rotate(14 20 52)'
  else if (pose === 'dive') tf = 'rotate(-72 20 40)'
  const legLine = (f: { x: number; y: number }, front: boolean) => (
    <g>
      <line x1={20 + (front ? 2 : -2)} y1={35} x2={(20 + f.x) / 2} y2={(35 + f.y) / 2} stroke={SKIN} strokeWidth={4.2} strokeLinecap="round" />
      <line x1={(20 + f.x) / 2 + (front ? 0.5 : -0.5)} y1={(35 + f.y) / 2} x2={f.x} y2={f.y - 1.5} stroke={kit.socks} strokeWidth={4.6} strokeLinecap="round" />
      <ellipse cx={f.x + 1.6} cy={f.y} rx={3.6} ry={2} fill={BOOT} />
    </g>
  )
  return (
    <g transform={flip ? 'translate(40 0) scale(-1 1)' : undefined}>
    <g transform={tf}>
      {/* 뒤쪽 팔·다리 */}
      {legLine(lb, false)}
      {pose !== 'cheer' && !props.back && armLine(ab, 3.2, 0.9)}
      {/* 반바지 */}
      <path d="M13.5 30 L26.5 30 L27.5 38 L21 38 L20 35 L19 38 L12.5 38 Z" fill={kit.shorts} />
      {legLine(lf, true)}
      {/* 몸통(유니폼) */}
      <path d="M13 17 Q20 14 27 17 L28 31 Q20 33 12 31 Z" fill={kit.jersey} stroke={kit.trim} strokeWidth={1} />
      {kit.pinstripe && [15, 18, 21, 24].map(x => <line key={x} x1={x + 0.5} y1={16.5} x2={x} y2={31.5} stroke={kit.second} strokeWidth={0.5} opacity={0.5} />)}
      {kit.pattern === 'camo' && CAMO.map(([x, y, rx, ry, c], i) => <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={c} opacity={0.75} />)}
      {kit.pattern === 'snow' && [[15, 20], [24, 22], [18, 27], [25, 29]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.8} fill="#FFFFFF" />)}
      {props.back ? (
        <>
          {props.name && <text transform={unflip(20)} x={20} y={20.6} textAnchor="middle" fontSize={3.3} fontWeight={800} fill={kit.trim}>{props.name.slice(0, 6)}</text>}
          <text transform={unflip(20)} x={20} y={29.5} textAnchor="middle" fontSize={8.5} fontWeight={900} fill={kit.trim} stroke={kit.second} strokeWidth={0.25}>{num}</text>
        </>
      ) : (
        <text transform={unflip(19.5)} x={19.5} y={27.5} textAnchor="middle" fontSize={7} fontWeight={900} fill={kit.trim}>{num}</text>
      )}
      {/* 앞팔 */}
      {pose !== 'cheer' && !props.back && armLine(af, 3.4)}
      {/* 뒷모습: 양팔이 옆으로(이름·번호를 안 가린다) */}
      {pose !== 'cheer' && props.back && <>
        {armLine({ sx: 13.5, sy: 18.5, ex: 11 + (pose === 'kick' ? -3 : 0), ey: 28 }, 3.3)}
        {armLine({ sx: 26.5, sy: 18.5, ex: 29 + (pose === 'kick' ? 3 : 0), ey: 28 }, 3.3)}
      </>}
      {pose === 'cheer' && <>
        {armLine({ sx: 15, sy: 19, ex: 10, ey: 8.5 }, 3.3)}
        {armLine({ sx: 25, sy: 19, ex: 30, ey: 8.5 }, 3.3)}
      </>}
      {/* 머리 */}
      <circle cx={20.5} cy={9.5} r={7.4} fill={SKIN} />
      {props.back ? (
        <path d="M13.2 9.5 A7.4 7.4 0 0 1 27.8 9.5 L27.6 12 Q20.5 14.5 13.4 12 Z" fill={kit.cap ?? HAIR} />
      ) : kit.cap ? (
        <>
          <path d="M13.2 9 A7.4 7.4 0 0 1 27.8 8.6 Z" fill={kit.cap} />
          <path d="M26 8.4 L31.5 9.4 L26.5 10.2 Z" fill={kit.cap} />
        </>
      ) : (
        <path d="M13.2 10 A7.4 7.4 0 0 1 27.6 7.6 Q22 6.4 19 9 Q16 8 13.2 10 Z" fill={HAIR} />
      )}
      {!props.back && <>
        <circle cx={24.6} cy={10.2} r={1} fill="#1F2937" />
        <path d="M22.6 13.4 Q24.2 14.4 25.6 13.2" fill="none" stroke="#9A5B3F" strokeWidth={0.7} strokeLinecap="round" />
        <ellipse cx={23.8} cy={12.2} rx={1.3} ry={0.7} fill="#F59E8B" opacity={0.5} />
      </>}
    </g>
    </g>
  )
}

export const SoccerKid = memo(function SoccerKid(props: { kit: Kit; number?: number; pose?: KidPose; phase?: number; size?: number; facing?: 1 | -1; back?: boolean; name?: string }) {
  const size = props.size ?? 40
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" style={{ display: 'block', overflow: 'visible' }}>
      <KidG kit={props.kit} number={props.number} pose={props.pose} phase={props.phase} back={props.back} name={props.name} facing={props.facing} />
    </svg>
  )
})
