// 🗼 서류탑 — 게임 화면(PaperTower)과 기록 화면(PaperTowerStats)이 같이 쓰는 값

// 팀원 색(보라 계열 제외) — members.color_key 순번
export const TAG_COLORS = ['#E8833A', '#2F9E9A', '#4F9A3A', '#2563EB', '#D6A91F', '#C2410C', '#0E7490', '#B91C1C']
export const tagColor = (colorKey: number | null | undefined) => TAG_COLORS[((((colorKey ?? 0) % 8) + 8) % 8)]

// 물건 이름·아이콘(기록 화면 표시용 — 물리 모양은 PaperTower 의 PIECES)
export const PIECE_LABEL: Record<string, { icon: string; name: string }> = {
  binder: { icon: '📁', name: '바인더' },
  box: { icon: '📦', name: '박스' },
  papers: { icon: '📄', name: '서류 뭉치' },
  keyboard: { icon: '⌨', name: '키보드' },
  cup: { icon: '☕', name: '커피컵' },
  monitor: { icon: '🖥', name: '모니터' },
  chair: { icon: '🪑', name: '의자' },
  plant: { icon: '🪴', name: '화분' },
  ball: { icon: '⚽', name: '스트레스볼' },
}
