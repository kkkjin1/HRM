// 진단 응답 임시 저장(브라우저 localStorage) — 15~20분 설문을 실수로 닫아도 이어서 쓰게 하는 본인 브라우저 전용 편의 기능.
// 격리 규칙
//   ① 키 = 문항 버전 + 회차 id + 팀원 id. 값에도 같은 세 값을 넣고, 복원할 때 키와 값이 모두 맞아야 쓴다(구버전 초안이 v3에 섞이지 않음).
//   ② 복원 전에 응답 모양을 확인한다(v3 구조가 아니면 버림).
//   ③ 초안을 만들 때의 서버 응답 시각(basedOn)을 남겨, 그 뒤 다른 기기에서 제출·수정했으면 오래된 초안을 버린다.
//   ④ 팀 진단 화면을 열 때 "지금 열린 회차 × 지금 로그인한 사람" 초안만 남기고 나머지(다른 계정·끝난/없어진 회차)는 지운다.
//   ⑤ 로그아웃하면 모두 지운다. 제출하거나 "처음 상태로"를 누르면 그 초안을 지운다.
// 서버에 저장되지 않으며, 팀원 간 공유되지 않는다. 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 건너뛴다.

import type { R0V3Answers } from '@/lib/team/r0v3'

export const DRAFT_PREFIX = 'hrm.r0draft.'
const LEGACY_PREFIXES = ['hrm.r0v3.draft.']   // 로컬 개발 중 잠시 쓴 키(운영 배포 전) — 보이면 지운다
type Who = { version: string; roundId: string; memberId: string }
type Stored = Who & { schema: 1; basedOn: string | null; savedAt: string; answers: unknown }

export const draftKey = (w: Who) => `${DRAFT_PREFIX}${w.version}.${w.roundId}.${w.memberId}`

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// v3 응답 모양인지(값의 허용 범위는 제출 때 서버·validateAnswersV3가 다시 검증한다)
export function looksLikeV3Draft(a: unknown): a is R0V3Answers {
  if (!isObj(a)) return false
  return isObj(a.ws) && isObj(a.behavior) && isObj(a.friction) && isObj(a.success) && isObj(a.improve) && isObj(a.friction_case)
    && Array.isArray(a.keep) && Array.isArray((a.improve as Record<string, unknown>).areas)
}

export function saveDraft(w: Who, basedOn: string | null, answers: R0V3Answers) {
  const s = storage()
  if (!s) return
  const v: Stored = { schema: 1, ...w, basedOn, savedAt: new Date().toISOString(), answers }
  try { s.setItem(draftKey(w), JSON.stringify(v)) } catch { /* 용량 초과 등 — 임시 저장만 건너뜀 */ }
}

export function loadDraft(w: Who, basedOn: string | null): R0V3Answers | null {
  const s = storage()
  if (!s) return null
  const key = draftKey(w)
  let raw: string | null = null
  try { raw = s.getItem(key) } catch { return null }
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<Stored>
    const ok = v.schema === 1 && v.version === w.version && v.roundId === w.roundId && v.memberId === w.memberId
      && (v.basedOn ?? null) === basedOn && looksLikeV3Draft(v.answers)
    if (ok) return v.answers as R0V3Answers
  } catch { /* 깨진 값 */ }
  clearDraft(w)
  return null
}

export function clearDraft(w: Who) {
  try { storage()?.removeItem(draftKey(w)) } catch { /* 무시 */ }
}

// keep 하나만 남기고 진단 초안을 모두 지운다(keep = null이면 전부). 지운 키 수를 돌려준다.
export function purgeDrafts(keep: Who | null) {
  const s = storage()
  if (!s) return 0
  const keepKey = keep ? draftKey(keep) : null
  const targets: string[] = []
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (!k || k === keepKey) continue
      if (k.startsWith(DRAFT_PREFIX) || LEGACY_PREFIXES.some(p => k.startsWith(p))) targets.push(k)
    }
    targets.forEach(k => s.removeItem(k))
  } catch { return 0 }
  return targets.length
}
