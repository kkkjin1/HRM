import type { Member } from '@/lib/members'

// 본문에서 "@이름" 패턴으로 태그된 멤버를 찾는다. 이름이 서로의 부분문자열일 수 있어서
// (예: "김진" vs "김진일") 긴 이름부터 매칭해 짧은 이름이 잘못 걸리는 걸 막는다.
export function extractTaggedMembers(text: string, members: Member[]): Member[] {
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length)
  const found = new Map<string, Member>()
  for (const m of sorted) {
    if (text.includes(`@${m.name}`)) found.set(m.id, m)
  }
  return Array.from(found.values())
}

export type MentionPart = { type: 'text' | 'mention'; content: string }

// 표시용: 본문을 "@이름" 기준으로 일반 텍스트/태그 조각으로 쪼갠다 (렌더링에서 태그만 강조).
export function splitMentions(text: string, members: Member[]): MentionPart[] {
  const names = [...members].map(m => m.name).sort((a, b) => b.length - a.length)
  if (names.length === 0 || !text) return [{ type: 'text', content: text }]

  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`@(${escaped.join('|')})`, 'g')
  const parts: MentionPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    parts.push({ type: 'mention', content: match[0] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) })
  return parts
}
