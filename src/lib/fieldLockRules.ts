// 회의록 칸 잠금의 순수 규칙(useFieldLocks에서 사용) — Presence 상태에서 칸별 주인을 정한다.

// 세션 하나가 Presence에 올리는 값. fields: 이 세션이 잡은 칸 → 잡은 시각(서버 시계 기준 ms).
export type LockMeta = { name: string; fields: Record<string, number> }

// 같은 칸을 여럿이 잡았으면 먼저 잡은 쪽(시각이 이른 쪽, 같으면 세션 키 순)이 주인이다.
// 한 세션(탭)이 Presence에 meta를 여러 개 갖는 순간도 있어(재접속 등) 모두 본다.
export function resolveHolders(state: Record<string, LockMeta[]>) {
  const best: Record<string, { session: string; name: string; since: number }> = {}
  for (const [session, metas] of Object.entries(state)) {
    for (const m of metas) {
      for (const [field, since] of Object.entries(m.fields ?? {})) {
        const cur = best[field]
        if (!cur || since < cur.since || (since === cur.since && session < cur.session)) best[field] = { session, name: m.name, since }
      }
    }
  }
  const out: Record<string, { session: string; name: string }> = {}
  for (const [field, h] of Object.entries(best)) out[field] = { session: h.session, name: h.name }
  return out
}
