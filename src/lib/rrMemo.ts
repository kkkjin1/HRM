// R&R 메모 페이지 — 서버(/api/rr-entries)와 화면(RrMemoPanel)이 같이 쓰는 타입·규칙.
// R&R 업무 하나에 회차 카드(기획·피드백·개선·보고·기타)가 시간순으로 쌓인다.
// 쓰기: 담당자(R&R 그룹 이름 = 팀원 이름)와 팀장. 피드백 카드는 팀장만. 나머지 팀원은 읽기만.

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
// 차수를 붙이는 종류(1차 기획 → 2차 개선 → 3차 보고). 피드백·기타는 차수 없이.
const NUMBERED: RrEntryKind[] = ['plan', 'improve', 'report']

export type RrEntry = {
  id: string; target_id: string; kind: RrEntryKind; entry_date: string
  title: string; body: string; author_id: string | null; author_name: string
  version: number; created_at: string; updated_at: string; updated_by: string | null
}
export const RR_ENTRY_COLS = 'id, target_id, kind, entry_date, title, body, author_id, author_name, version, created_at, updated_at, updated_by'

export const isRrEntryKind = (v: unknown): v is RrEntryKind => typeof v === 'string' && (RR_ENTRY_KINDS as string[]).includes(v)

// 시간순(날짜, 같은 날이면 만든 순) 정렬
export function sortRrEntries(list: RrEntry[]) {
  return [...list].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
}

// 카드 머리 라벨 — "1차 기획", "2차 개선", "피드백"
export function rrEntryLabels(sorted: RrEntry[]): Map<string, string> {
  const labels = new Map<string, string>()
  let n = 0
  for (const e of sorted) {
    if (NUMBERED.includes(e.kind)) { n += 1; labels.set(e.id, `${n}차 ${RR_KIND_LABEL[e.kind]}`) }
    else labels.set(e.id, RR_KIND_LABEL[e.kind])
  }
  return labels
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
// 프로젝트 고정·해제
export const canPinRr = (m: Who, groupName: string) => isRrLead(m) || isRrOwner(m, groupName)

export const RR_TITLE_MAX = 120
export const RR_BODY_MAX = 200000
