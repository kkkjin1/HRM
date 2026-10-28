// 외부 LLM 심층 분석 버전(team_round_analyses) — 서버·화면이 같이 쓰는 타입과 표시 규칙.

export const ANALYSIS_CONTENT_MAX = 30000

export type AnalysisStatus = 'draft' | 'published' | 'superseded' | 'withdrawn'
export type AnalysisRow = {
  id: string; round_id: string; version: number; source: string; content: string; status: AnalysisStatus
  based_on: string | null; created_by: string; created_at: string
  published_at: string | null; published_by: string | null; withdrawn_at: string | null; withdrawn_by: string | null
}

export const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = {
  draft: '초안(팀장만 보임)',
  published: '현재 게시본',
  superseded: '이전 게시본',
  withdrawn: '게시 취소됨',
}

// 확정본이어도 팀 합의·검증된 결과가 아니다 — 모든 화면에 이 문구를 붙인다.
export const ANALYSIS_DISCLAIMER = '외부 AI가 응답을 바탕으로 쓴 해석입니다. 팀이 함께 검토하기 전의 가설이며, 검증된 관찰 사실이나 개선 결과가 아닙니다.'
// 팀장의 "게시 승인" = 팀원에게 공개해도 된다는 승인. 팀 전체의 공식 합의가 아니다.
export const ANALYSIS_PUBLISH_NOTE = '게시 승인은 팀장이 이 분석문을 팀원에게 공개하기로 한 것이며, 팀 전체의 공식 합의가 아닙니다.'
// 검증된 관찰 사실은 원본 응답과 위 ①~④의 "관찰된 사실"뿐 — 분석문 속 인용 칩은 그 원본을 가리킨다.
export const ANALYSIS_FACT_NOTE = '파란 칩은 원본 응답 항목(관찰된 사실)을 가리키고, 그 밖의 문장은 외부 AI의 해석입니다.'

// 붙여 넣은 분석 본문 정리 — 화면은 항상 일반 텍스트로만 그린다(HTML·스크립트를 해석하지 않음).
// 여기서는 보이지 않는 제어 문자와 글자 방향을 뒤집는 문자(내용을 숨기는 데 쓰일 수 있음)만 걷어 낸다. 줄바꿈·탭은 둔다.
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g
export function sanitizeAnalysisText(v: string) {
  return v.replace(/\r\n?/g, '\n').replace(HIDDEN, '')
}
