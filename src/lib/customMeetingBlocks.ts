// 회의창 "내가 만든 박스" — 팀장이 회의창에 박스를 직접 추가·이름변경·삭제한다.
// 박스 목록은 팀 공용 설정(team_log_settings 'custom_meeting_blocks'), 박스 안 카드는 team_log_meeting_items(kind 'custom', block_id).
// 업무보고 행처럼 회의마다 복사하지 않고 회의 날짜로 보이기를 정한다:
//   만든 회의 날짜(created_on)부터 보이고, 삭제한 회의 날짜(removed_on)부터 안 보인다.
//   단, 그 회의에 이 박스 카드가 남아 있으면 삭제 뒤에도(또는 만든 날짜 전이라도) 보인다 — 기록이 사라져 보이지 않게.

export type CustomMeetingBlock = { id: string; icon: string; label: string; created_on: string; removed_on: string | null }

// 박스 아이콘 고르기 목록(30개)
export const CUSTOM_BLOCK_ICONS = [
  '📝', '📌', '📋', '🗂️', '📁', '📄', '📅', '🕘', '👥', '🙋',
  '🏖️', '🤝', '💬', '📢', '💡', '🎯', '✅', '⚠️', '🔥', '⭐',
  '📊', '📈', '💰', '🎓', '🏢', '🧾', '🔍', '🛠️', '❤️', '🎉',
] as const
export const DEFAULT_CUSTOM_BLOCK_ICON = '📝'

// 회의창 기본 박스(고정 안건·오늘 안건·인력관리·업무보고·결정/액션)
export const BUILTIN_MEETING_BLOCKS = ['pinned', 'today', 'staff', 'report', 'decisions'] as const
export type BuiltinMeetingBlock = typeof BUILTIN_MEETING_BLOCKS[number]

export const CUSTOM_BLOCK_PREFIX = 'c:'
export const CUSTOM_BLOCK_LABEL_MAX = 40
export const customBlockKey = (id: string) => `${CUSTOM_BLOCK_PREFIX}${id}`
export const customBlockIdOf = (key: string) => key.startsWith(CUSTOM_BLOCK_PREFIX) ? key.slice(CUSTOM_BLOCK_PREFIX.length) : null

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

// 저장값 검사 — 모양이 깨진 항목·중복 id는 버린다.
export function parseCustomBlocks(saved: unknown): CustomMeetingBlock[] {
  if (!Array.isArray(saved)) return []
  const seen = new Set<string>()
  const out: CustomMeetingBlock[] = []
  for (const v of saved) {
    if (!v || typeof v !== 'object') continue
    const b = v as Record<string, unknown>
    if (typeof b.id !== 'string' || !ID_RE.test(b.id) || seen.has(b.id)) continue
    if (typeof b.label !== 'string' || !b.label.trim()) continue
    if (typeof b.created_on !== 'string' || !DATE_RE.test(b.created_on)) continue
    const removed = typeof b.removed_on === 'string' && DATE_RE.test(b.removed_on) ? b.removed_on : null
    seen.add(b.id)
    const icon = typeof b.icon === 'string' && (CUSTOM_BLOCK_ICONS as readonly string[]).includes(b.icon) ? b.icon : DEFAULT_CUSTOM_BLOCK_ICON
    out.push({ id: b.id, icon, label: b.label.trim().slice(0, CUSTOM_BLOCK_LABEL_MAX), created_on: b.created_on, removed_on: removed })
  }
  return out
}

// 날짜는 모두 'YYYY-MM-DD'라 문자열 비교로 충분하다.
export function isCustomBlockVisible(block: CustomMeetingBlock, meetingDate: string, hasItems: boolean) {
  if (hasItems) return true
  return block.created_on <= meetingDate && (block.removed_on === null || meetingDate < block.removed_on)
}

// 박스 순서 저장값 → 실제 순서. 모르는 키·중복은 버리고, 빠진 기본 박스와 내가 만든 박스는 뒤에 붙인다.
export function normalizeBlockOrder(saved: unknown, customs: CustomMeetingBlock[]): string[] {
  const known = new Set<string>([...BUILTIN_MEETING_BLOCKS, ...customs.map(c => customBlockKey(c.id))])
  const list = Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string' && known.has(k)) : []
  const uniq = [...new Set(list)]
  return [...uniq, ...[...known].filter(k => !uniq.includes(k))]
}

// 새 박스를 afterKey 박스 바로 아래에 끼운다(afterKey가 없거나 모르는 키면 맨 뒤).
export function insertBlockAfter(order: string[], newKey: string, afterKey: string | null) {
  const rest = order.filter(k => k !== newKey)
  const at = afterKey ? rest.indexOf(afterKey) : -1
  return at < 0 ? [...rest, newKey] : [...rest.slice(0, at + 1), newKey, ...rest.slice(at + 1)]
}

export function newCustomBlockId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// 'YYYY-MM-DD' 다음 날(삭제한 회의엔 남기고 그다음 회의부터 숨길 때).
export function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
