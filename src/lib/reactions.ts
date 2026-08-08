export type Reactions = Record<string, string[]>

export function toggleReaction(reactions: Reactions, emoji: string, memberId: string): Reactions {
  const current = reactions[emoji] ?? []
  const next = current.includes(memberId) ? current.filter(id => id !== memberId) : [...current, memberId]
  const updated: Reactions = { ...reactions, [emoji]: next }
  if (updated[emoji].length === 0) delete updated[emoji]
  return updated
}
