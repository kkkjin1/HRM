import type { MemberRole } from '@/lib/data'

export type Member = {
  id: string
  name: string
  nickname: string | null
  role: MemberRole
  color_key: number
  position: string | null
  hired_at: string | null
  birthday: string | null
  gives: string | null
  needs: string | null
  avatar_url: string | null
  back_number: number | null // 야구 등번호(0~99, 팀원끼리 안 겹침). 없으면 이름으로 정한 번호
  left_at?: string | null // 퇴사일 — 있으면 앱 명단에서 빠진다(행은 기록 보존을 위해 지우지 않음). add_auth_identity.sql 적용 전엔 없음
}

// 그 날짜(YYYY-MM-DD)에 이미 입사한 사람인지 — 입사 예정자는 한마디·팀 운세·팀 운명·식사 주인공 같은 "오늘의 팀" 기능에서 뺀다.
// 입사일이 비어 있으면 기존 팀원으로 본다.
export function isHiredBy(member: Pick<Member, 'hired_at'>, date: string) {
  return !member.hired_at || member.hired_at <= date
}

// 아바타 이니셜처럼 "짧은 한 단어"가 필요한 곳 전용 — 닉네임이 있으면 닉네임, 없으면 실명.
// 실명 자체가 필요한 곳(로그인 매칭, 관리자 화면)은 member.name을 직접 쓴다.
export function displayName(member: Pick<Member, 'name' | 'nickname'> | null | undefined) {
  return member?.nickname?.trim() || member?.name || ''
}

// 화면에 이름을 "문장/라벨"로 보여줄 땐 항상 이걸로 — 닉네임이 있으면 "닉네임(실명)",
// 없으면 실명만. 닉네임 뒤에 실명이 안 보이면 누가 누군지 못 알아보는 문제를 막기 위함.
export function displayNameFull(member: Pick<Member, 'name' | 'nickname'> | null | undefined) {
  const name = member?.name ?? ''
  const nickname = member?.nickname?.trim()
  return nickname ? `${nickname}(${name})` : name
}
