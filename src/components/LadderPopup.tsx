'use client'

import { useEffect, useMemo, useState } from 'react'

export type LadderCandidate = { name: string; icon: string; score: number }

type Props = {
  candidates: LadderCandidate[]
  winner: string
  onClose: () => void
}

const ROWS = 6
const LANE_GAP = 64
const ROW_GAP = 38
const TOP_MARGIN = 30
const SIDE_MARGIN = 32
const DRAW_MS = 4800

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 한 row에 놓을 rung(가로줄) 조합을 무작위로 고른다. pair p는 레인 p와 p+1을 잇는다.
// 같은 row에 인접한 pair를 동시에 놓으면 레인 하나가 두 방향으로 당겨지므로, 항상
// pair 값이 연속되지 않게(레인을 공유하지 않게) 고른다.
function randomRow(pairCount: number): number[] {
  const row: number[] = []
  let lastUsed = -2
  for (let p = 0; p < pairCount; p++) {
    if (p === lastUsed + 1) continue
    if (Math.random() < 0.6) { row.push(p); lastUsed = p }
  }
  return row
}

function tracePath(rungs: number[][], laneCount: number) {
  let lane = 0
  const path = [lane]
  const visited = new Set([lane])
  for (const row of rungs) {
    // pair === lane 이면 오른쪽 레인으로, pair === lane - 1 이면 왼쪽 레인으로 건너간다.
    // pair는 항상 0..laneCount-2 범위라 lane은 절대 0보다 작아지거나 laneCount-1보다 커지지 않는다.
    if (row.includes(lane)) lane += 1
    else if (row.includes(lane - 1)) lane -= 1
    path.push(lane)
    visited.add(lane)
  }
  return { path, endLane: lane, coversAllLanes: visited.size >= laneCount }
}

// 모든 세로선을 최소 한 번씩 지나가는(=더 많이 움직이는, 더 재밌는) 사다리가 나올 때까지
// 무작위로 다시 그려본다. 레인이 적고 row 수가 넉넉해서 몇 번 안에 항상 찾는다.
function buildLadder(laneCount: number) {
  const pairCount = Math.max(laneCount - 1, 0)
  if (pairCount === 0) return { rungs: Array.from({ length: ROWS }, () => []), path: Array(ROWS + 1).fill(0), endLane: 0 }

  for (let attempt = 0; attempt < 500; attempt++) {
    const rungs = Array.from({ length: ROWS }, () => randomRow(pairCount))
    const { path, endLane, coversAllLanes } = tracePath(rungs, laneCount)
    if (coversAllLanes) return { rungs, path, endLane }
  }

  // 극히 드문 폴백: 0번 레인에서 마지막 레인까지 순서대로 한 칸씩 건너가도록 강제한다.
  const rungs = Array.from({ length: ROWS }, () => [] as number[])
  for (let p = 0; p < pairCount && p < ROWS; p++) rungs[p] = [p]
  const { path, endLane } = tracePath(rungs, laneCount)
  return { rungs, path, endLane }
}

export default function LadderPopup({ candidates, winner, onClose }: Props) {
  const laneCount = candidates.length
  const { rungs, path, endLane } = useMemo(() => buildLadder(laneCount), [laneCount])

  // candidates 전체를 섞은 뒤, 승자를 endLane 자리로 "교환"만 한다 — 항목을 새로
  // 채워 넣는 방식이 아니라 항상 꽉 찬 배열에서 위치만 바꾸는 것이라 빈 자리가 생길 수 없다.
  // winner 텍스트가 후보 이름과 정확히 안 맞는 경우(오래된 final_menu 등)에도
  // endLane 자리를 winner로 직접 대체해 최소한 결과 표시는 항상 유효하게 만든다.
  const bottomOrder = useMemo(() => {
    const shuffledAll = shuffle(candidates)
    const winnerIdx = shuffledAll.findIndex(c => c.name === winner)
    if (winnerIdx === -1) {
      return shuffledAll.map((c, i) => (i === endLane ? { name: winner, icon: '🍽️', score: 0 } : c))
    }
    if (winnerIdx === endLane) return shuffledAll
    const swapped = [...shuffledAll]
    ;[swapped[winnerIdx], swapped[endLane]] = [swapped[endLane], swapped[winnerIdx]]
    return swapped
  }, [candidates, winner, endLane])

  const [drawn, setDrawn] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setDrawn(true), 150)
    const t2 = setTimeout(() => setRevealed(true), 150 + DRAW_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const width = SIDE_MARGIN * 2 + LANE_GAP * (laneCount - 1)
  const height = TOP_MARGIN + ROW_GAP * (ROWS + 1) + 40
  const laneX = (i: number) => SIDE_MARGIN + i * LANE_GAP
  const rowY = (r: number) => TOP_MARGIN + r * ROW_GAP

  const pathD = (() => {
    const pts: string[] = [`M ${laneX(path[0])} ${rowY(0)}`]
    for (let r = 0; r < path.length - 1; r++) {
      const from = path[r], to = path[r + 1]
      if (from === to) {
        pts.push(`L ${laneX(to)} ${rowY(r + 1)}`)
      } else {
        pts.push(`L ${laneX(from)} ${rowY(r + 0.5)}`)
        pts.push(`L ${laneX(to)} ${rowY(r + 0.5)}`)
        pts.push(`L ${laneX(to)} ${rowY(r + 1)}`)
      }
    }
    return pts.join(' ')
  })()

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[#E8E8E4] p-6" onClick={e => e.stopPropagation()}>
        <p className="text-[14px] font-medium text-[#1F1F1D] mb-1 text-center">사다리타기로 메뉴 뽑는 중...</p>
        <p className="text-[12px] text-[#9C9C96] mb-4 text-center">누가 뽑아도 같은 메뉴가 나와요</p>

        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {Array.from({ length: laneCount }).map((_, i) => (
            <line key={i} x1={laneX(i)} y1={rowY(0)} x2={laneX(i)} y2={rowY(ROWS)} stroke="#E8E8E4" strokeWidth={3} />
          ))}
          {rungs.map((row, r) =>
            row.map(pair => (
              <line
                key={`${r}-${pair}`}
                x1={laneX(pair)} y1={rowY(r + 0.5)}
                x2={laneX(pair + 1)} y2={rowY(r + 0.5)}
                stroke="#E8E8E4" strokeWidth={3}
              />
            ))
          )}

          <path
            d={pathD}
            fill="none"
            stroke="#5B54C4"
            strokeWidth={4}
            strokeLinecap="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: drawn ? 0 : 1,
              transition: `stroke-dashoffset ${DRAW_MS}ms linear`,
            }}
          />

          <circle cx={laneX(0)} cy={rowY(0)} r={6} fill="#5B54C4" />

          {bottomOrder.map((c, i) => (
            <g key={c.name}>
              <text
                x={laneX(i)} y={rowY(ROWS) + 26}
                textAnchor="middle"
                fontSize={12}
                fontWeight={revealed && i === endLane ? 700 : 400}
                fill={revealed && i === endLane ? '#5B54C4' : '#6B6B66'}
              >
                {c.icon}
              </text>
              <text
                x={laneX(i)} y={rowY(ROWS) + 40}
                textAnchor="middle"
                fontSize={11}
                fontWeight={revealed && i === endLane ? 700 : 400}
                fill={revealed && i === endLane ? '#5B54C4' : '#9C9C96'}
              >
                {c.name}
              </text>
            </g>
          ))}
        </svg>

        <div className="mt-4 text-center">
          {revealed ? (
            <>
              <p className="text-[15px] text-[#1F1F1D] mb-3">
                오늘의 메뉴: <span className="font-semibold text-[#5B54C4]">{winner}</span> 🎉
              </p>
              <button
                onClick={onClose}
                className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] rounded-lg px-4 py-2"
              >
                확인
              </button>
            </>
          ) : (
            <p className="text-[13px] text-[#9C9C96]">사다리를 타는 중...</p>
          )}
        </div>
      </div>
    </div>
  )
}
