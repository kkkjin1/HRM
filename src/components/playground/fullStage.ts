// 운동장 경기 풀화면 공통 기준(2026-11-21 STEP B) — 폭탄·축구·PK처럼 따로 뜨는 경기 창이 같이 쓴다.
// 예전엔 반투명 배경 위 흰 창이 1배를 못 넘고 사방 16px씩 비워서, 큰 모니터에선 작고 폰에선 더 작았다.
// 이제 화면 전체를 어둡게 덮고(뒤 홈 화면이 안 비침), 창을 화면 끝까지(최대 2배) 키운다.
import type { CSSProperties } from 'react'

export const FULL_MAX_ZOOM = 2
const EDGE = 6 // 화면 끝과 창 사이 최소 여백(px)

// 노치·홈 막대를 피하고, 주소창이 접히고 펴져도 높이를 맞춘다
export const FULL_OVERLAY_STYLE: CSSProperties = {
  height: '100dvh',
  padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
}

// 원래 크기(boxW × boxH)의 창을 지금 화면에 넣을 배율
export function fullFitScale(boxW: number, boxH: number) {
  return Math.max(0.2, Math.min(FULL_MAX_ZOOM, (window.innerWidth - EDGE * 2) / boxW, (window.innerHeight - EDGE * 2) / boxH))
}
