'use client'

// 경기장 전광판(LED) — 포수·투수 시점 배경 가운데 위. 점수·이닝·볼카운트·지금 타자를 보여주고,
// 상황 문구(LAST OUT·동점! 등)가 오면 잠깐 깜빡이며 문구로 바뀐다. 그림 전용(판정과 무관).
// 투수가 앞에 서서 가운데 아래쪽을 가릴 수 있으므로 둘째 줄은 가운데를 비워 두고 양옆에 배치한다.

export type ScoreLine =
  | { kind: 'duel'; inning: string; away: { name: string; runs: number }; home: { name: string; runs: number }; homeBatting: boolean }
  | { kind: 'solo'; runs: number; pa: number }

export const BOARD_W = 236
export const BOARD_H = 35

const LED = '#FFD166'
const DIM = '#2A3846'
const TONE: Record<'gold' | 'red' | 'blue', string> = { gold: '#FFD166', red: '#FF7A6B', blue: '#7DB7FF' }
const short = (s: string, n = 4) => (s.length > n ? s.slice(0, n) : s)

function Lamps({ x, y, label, n, max, on }: { x: number; y: number; label: string; n: number; max: number; on: string }) {
  return (
    <g>
      <text x={x} y={y + 3} fontSize="8.5" fontWeight="800" fill="#9FB3C8">{label}</text>
      {Array.from({ length: max }, (_, i) => <circle key={i} cx={x + 10 + i * 7.5} cy={y} r="2.8" fill={i < n ? on : DIM} />)}
    </g>
  )
}

export function LedScoreboard({ cx, top, line, balls, strikes, outs, maxBalls, maxStrikes, maxOuts, batter, logo, flash }: {
  cx: number; top: number
  line: ScoreLine
  balls: number; strikes: number; outs: number; maxBalls: number; maxStrikes: number; maxOuts: number
  batter: string | null
  logo?: string | null
  flash?: { id: string; text: string; tone: 'gold' | 'red' | 'blue' } | null
}) {
  const x = cx - BOARD_W / 2
  const y = top
  const r1 = y + 14.5
  const r2 = y + 29
  return (
    <g data-layer="scoreboard" pointerEvents="none">
      {/* 받침대 + 테두리 + LED 면 */}
      <rect x={cx - 3} y={y + BOARD_H} width="6" height="6" fill="#3A4756" />
      <rect x={x - 2} y={y - 2} width={BOARD_W + 4} height={BOARD_H + 4} rx="3" fill="#3A4756" />
      <rect x={x} y={y} width={BOARD_W} height={BOARD_H} rx="2" fill="#101B26" />
      <g data-board-rows style={flash ? { animation: 'bb-board-rows 1700ms steps(1, end) forwards' } : undefined} key={`rows-${flash?.id ?? ''}`}>
        {logo
          ? <image href={logo} x={x + 3} y={y + 3} width="29" height="29" preserveAspectRatio="xMidYMid meet" opacity="0.9" />
          : <text x={x + 17} y={y + 22} textAnchor="middle" fontSize="14">⚾</text>}
        {line.kind === 'duel' ? (
          <>
            <text x={x + 36} y={r1} fontSize="9.5" fontWeight="800" fill="#9FB3C8">{line.inning}</text>
            <text x={cx + 8} y={r1} textAnchor="middle" fontSize="11.5" fontWeight="800" fill={LED} letterSpacing="0.3">
              <tspan fill={!line.homeBatting ? LED : '#C9D6E2'}>{!line.homeBatting ? '▸' : ''}{short(line.away.name)} {line.away.runs}</tspan>
              <tspan fill="#5E7286"> : </tspan>
              <tspan fill={line.homeBatting ? LED : '#C9D6E2'}>{line.home.runs} {short(line.home.name)}{line.homeBatting ? '◂' : ''}</tspan>
            </text>
          </>
        ) : (
          <>
            <text x={x + 36} y={r1} fontSize="9.5" fontWeight="800" fill="#9FB3C8">1회</text>
            <text x={cx + 8} y={r1} textAnchor="middle" fontSize="11.5" fontWeight="800" fill={LED}>득점 {line.runs}</text>
            <text x={x + BOARD_W - 6} y={r1} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#9FB3C8">{line.pa}번째 타석</text>
          </>
        )}
        {/* 둘째 줄: 왼쪽 B·S·O, 오른쪽 지금 타자 (가운데는 투수가 가릴 수 있어 비움) */}
        <Lamps x={x + 36} y={r2 - 3} label="B" n={balls} max={maxBalls} on="#34D399" />
        <Lamps x={x + 56} y={r2 - 3} label="S" n={strikes} max={maxStrikes} on="#FBBF24" />
        <Lamps x={x + 76} y={r2 - 3} label="O" n={outs} max={maxOuts} on="#F87171" />
        {batter && <text x={x + BOARD_W - 6} y={r2} textAnchor="end" fontSize="9.5" fontWeight="800" fill={LED}>{batter}</text>}
      </g>
      {/* 상황 문구 — LED가 바뀌듯 두 번 깜빡이고 머문 뒤 원래 화면으로 */}
      {flash && (
        <text key={flash.id} x={cx} y={y + 23} textAnchor="middle" fontSize="17" fontWeight="900" letterSpacing="0.8"
          fill={TONE[flash.tone]} opacity="0" style={{ animation: 'bb-board-msg 1700ms steps(1, end) forwards' }} data-moment={flash.text}>
          {flash.text}
        </text>
      )}
    </g>
  )
}

// FieldScene에 한 번 넣는다 — 문구가 뜨는 동안 원래 줄을 숨겼다가(깜빡임 2번) 1.7초 뒤 되돌린다
export const SCOREBOARD_KEYFRAMES =
  '@keyframes bb-board-msg{0%{opacity:1}12%{opacity:0}22%{opacity:1}34%{opacity:0}44%{opacity:1}92%{opacity:1}100%{opacity:0}}'
  + '@keyframes bb-board-rows{0%{opacity:0}92%{opacity:0}100%{opacity:1}}'
