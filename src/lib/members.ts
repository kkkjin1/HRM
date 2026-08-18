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
