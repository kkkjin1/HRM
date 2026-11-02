// R&R 메모 페이지 — 서버(/api/rr-entries)와 화면(RrMemoPanel)이 같이 쓰는 타입·규칙.
// R&R 업무 하나에 회차 카드가 시간순으로 쌓인다 — 첫 카드는 "1차 기획", 그 뒤는 "2차 개선", "3차 개선"….
// 팀장 피드백은 별도 카드가 아니라 각 회차 카드 오른쪽 칸(feedback, 팀장만 작성)이다.
// 쓰기: 본문은 담당자(R&R 그룹 이름 = 팀원 이름)와 팀장, 피드백 칸은 팀장만. 나머지 팀원은 읽기만.
// kind의 report·feedback·etc는 예전(초기 시험) 카드 호환용으로만 남아 있다 — 새로 만들지 않는다.

import type { MemberRole } from '@/lib/data'

export type RrEntryKind = 'plan' | 'feedback' | 'improve' | 'report' | 'etc'
export const RR_ENTRY_KINDS: RrEntryKind[] = ['plan', 'improve', 'report', 'feedback', 'etc']
export const RR_KIND_LABEL: Record<RrEntryKind, string> = { plan: '기획', feedback: '피드백', improve: '개선', report: '보고', etc: '기타' }
// 칩 색(배경·글자·테두리) — 보라 계열은 쓰지 않는다
export const RR_KIND_TONE: Record<RrEntryKind, string> = {
  plan: 'bg-[#EAF1FD] text-[#2F5FC4] border-[#C9DAF8]',
  improve: 'bg-[#E9F7EF] text-[#2F855A] border-[#BFE3CF]',
  report: 'bg-[#FFF6E5] text-[#B7791F] border-[#F3DB94]',
  feedback: 'bg-[#FDECEC] text-[#C53030] border-[#F5C2C2]',
  etc: 'bg-[#F3F4F6] text-[#5B6570] border-[#E5E8EB]',
}
// 차수를 붙이는 종류. 예전 피드백·기타 카드는 차수 없이.
const NUMBERED: RrEntryKind[] = ['plan', 'improve', 'report']

export type RrEntry = {
  id: string; target_id: string; kind: RrEntryKind; entry_date: string
  title: string; body: string; author_id: string | null; author_name: string
  version: number; created_at: string; updated_at: string; updated_by: string | null
  feedback: string; feedback_version: number; feedback_by: string | null; feedback_at: string | null
}
export const RR_ENTRY_COLS = 'id, target_id, kind, entry_date, title, body, author_id, author_name, version, created_at, updated_at, updated_by, feedback, feedback_version, feedback_by, feedback_at'
export const RR_FEEDBACK_MAX = 10000

export const isRrEntryKind = (v: unknown): v is RrEntryKind => typeof v === 'string' && (RR_ENTRY_KINDS as string[]).includes(v)

// 시간순(날짜, 같은 날이면 만든 순) 정렬
export function sortRrEntries(list: RrEntry[]) {
  return [...list].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
}

// 카드 머리 라벨 — 순서대로 "1차 기획", "2차 개선", "3차 개선"…(예전 피드백·기타 카드는 종류 이름만)
export function rrEntryLabels(sorted: RrEntry[]): Map<string, string> {
  const labels = new Map<string, string>()
  let n = 0
  for (const e of sorted) {
    if (NUMBERED.includes(e.kind)) { n += 1; labels.set(e.id, `${n}차 ${n === 1 ? '기획' : '개선'}`) }
    else labels.set(e.id, RR_KIND_LABEL[e.kind])
  }
  return labels
}
// 다음에 만들 회차의 종류와 이름
export function nextRrRound(sorted: RrEntry[]): { kind: RrEntryKind; label: string } {
  const n = sorted.filter(e => NUMBERED.includes(e.kind)).length + 1
  return n === 1 ? { kind: 'plan', label: '1차 기획' } : { kind: 'improve', label: `${n}차 개선` }
}

type Who = { name: string; role: MemberRole } | null | undefined
export const isRrLead = (m: Who) => m?.role === 'lead'
// R&R 그룹 이름이 팀원 이름과 같으면 그 팀원이 담당자
export const isRrOwner = (m: Who, groupName: string) => !!m && m.name === groupName
// 이 종류의 카드를 새로 쓰거나 고칠 수 있는지
export function canWriteRrKind(m: Who, groupName: string, kind: RrEntryKind) {
  if (isRrLead(m)) return true
  return kind !== 'feedback' && isRrOwner(m, groupName)
}
// 회차 카드 오른쪽 피드백 칸
export const canWriteRrFeedback = (m: Who) => isRrLead(m)
// 프로젝트 고정·해제
export const canPinRr = (m: Who, groupName: string) => isRrLead(m) || isRrOwner(m, groupName)

export const RR_TITLE_MAX = 120
export const RR_BODY_MAX = 200000

// ── 첨부파일 (STEP 3) ── 비공개 버킷에 브라우저가 직접 올린다(서버가 발급한 업로드 허가 주소로) — Vercel 함수의 요청 크기 제한(4.5MB)을 피하려고.
// url이 있으면 링크 첨부(파일 없이 주소만 — 큰 자료는 드라이브·노션 링크로), 없으면 버킷에 올린 파일
export type RrAttachment = { id: string; entry_id: string; file_name: string; size: number; uploaded_by: string; created_at: string; url: string | null }
export const RR_ATTACHMENT_COLS = 'id, entry_id, file_name, size, uploaded_by, created_at, url'
export const RR_LINK_RE = /^https?:\/\/[^\s]{3,}$/i
export const RR_ATTACHMENT_BUCKET = 'rr-attachments'
export const RR_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
// 확장자로 거른다(한글 hwp 등은 브라우저가 MIME을 비워 보내는 경우가 많아서)
export const RR_ATTACHMENT_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip']
export function rrFileExt(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}
export function fmtFileSize(n: number) {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}
