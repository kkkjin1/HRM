// 회의수정 서랍 "업무보고" — 팀원별 업무 행(report item)과 회차별 업데이트/피드백(report update).
// 업무 행은 회의마다 복사하지 않는다. 날짜 D 회의에는 start_date <= D 이고 아직 완료되지 않았거나
// D 당일 이후에 완료된 행이 보인다(완료한 회의에는 취소선으로 남고, 그다음 회의부터 사라진다).

export type ReportItem = {
  id: string
  member_id: string
  title: string
  start_date: string
  closed_on: string | null
  sort_order: number
  created_at?: string
  // 화면 전용: Enter 직후 서버 응답 전에 먼저 그려 둔 행(저장되면 실제 행으로 바뀜)
  pending?: boolean
}

export type ReportUpdate = {
  id: string
  item_id: string
  meeting_id: string
  update_text: string
  update_version: number
  feedback: string
  feedback_version: number
  updated_at: string | null
  updated_by: string | null
}

// 직전 회차 기록 — "지난 업데이트" 열(읽기 전용)에 보여준다.
export type PrevReport = { meeting_date: string; update_text: string; feedback: string }

export type ReportField = 'update' | 'feedback'

// 지난 회의에서 이 업무 행으로 등록했고 아직 안 끝난 액션아이템(표의 연동 칸에 "이전" 할 일로 보여줌).
export type OpenAction = { id: string; report_item_id: string; content: string; owner: string; due_date: string | null; meeting_date: string }

export const REPORT_TITLE_MAX = 200
export const REPORT_TEXT_MAX = 5000

// 날짜는 모두 'YYYY-MM-DD'라 문자열 비교로 충분하다.
export function isVisibleOn(item: Pick<ReportItem, 'start_date' | 'closed_on'>, date: string) {
  return item.start_date <= date && (item.closed_on === null || item.closed_on >= date)
}

// item별로 date보다 앞선 회의 중 가장 최근, 내용이 있는(업데이트나 피드백이 비어있지 않은) 기록을 고른다.
// 같은 날짜에 회의가 둘이면 그중 아무 하나가 아니라 날짜가 더 이른 쪽만 "지난"으로 친다(같은 날은 제외).
export function pickPrevious(
  rows: { item_id: string; update_text: string; feedback: string; meeting_date: string }[],
  date: string,
): Record<string, PrevReport> {
  const out: Record<string, PrevReport> = {}
  for (const r of rows) {
    if (r.meeting_date >= date) continue
    if (!r.update_text.trim() && !r.feedback.trim()) continue
    const cur = out[r.item_id]
    if (!cur || r.meeting_date > cur.meeting_date) {
      out[r.item_id] = { meeting_date: r.meeting_date, update_text: r.update_text, feedback: r.feedback }
    }
  }
  return out
}

export function fieldText(cell: ReportUpdate | undefined, field: ReportField) {
  if (!cell) return ''
  return field === 'update' ? cell.update_text : cell.feedback
}

export function fieldVersion(cell: ReportUpdate | undefined, field: ReportField) {
  if (!cell) return 0
  return field === 'update' ? cell.update_version : cell.feedback_version
}

// 같은 칸을 여러 경로(내 저장 응답, realtime 재조회)로 받는다. 응답 순서가 뒤집혀 옛 값이 늦게 와도
// 되돌아가지 않도록 필드별로 version이 더 높은 쪽을 남긴다.
export function mergeCell(prev: ReportUpdate | undefined, next: ReportUpdate): ReportUpdate {
  if (!prev) return next
  const out = { ...next }
  if (prev.update_version > next.update_version) { out.update_text = prev.update_text; out.update_version = prev.update_version }
  if (prev.feedback_version > next.feedback_version) { out.feedback = prev.feedback; out.feedback_version = prev.feedback_version }
  return out
}

export function sortReportItems<T extends Pick<ReportItem, 'sort_order' | 'created_at'>>(items: T[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}
