// 민감 테이블 권한 가드 규칙 — "로그인만 하면 전부 허용" 같은 정책이 다시 생기면 잡아낸다.
// 쓰는 곳: src/lib/sensitiveRls.test.ts(기대 상태 파일 검사), scripts/check-sensitive-rls.mjs(실제 DB 검사, npm run db:rls-check)
// Node가 바로 import할 수 있게(타입 제거만으로 실행) enum·namespace 같은 TS 전용 문법은 쓰지 않는다.

// 개인정보·평가성 내용·팀장 코멘트가 들어가는 테이블. 익명채팅·투표(anon_chat, anon_poll_votes)와
// members(생일·입사일은 팀 달력·입사예정 필터에 필요해 전원 공개 유지)는 2026-11-10 결정으로 제외.
export const SENSITIVE_TABLES = [
  'team_log_goal_retros', 'team_log_goal_retro_qa', 'team_log_meeting_progress', 'team_log_report_updates',
  'team_log_meeting_items', 'notifications', 'disc_responses', 'belbin_responses',
  'team_log_personal_notes', 'team_plan_retro_answers', 'team_rounds', 'team_responses', 'team_round_analyses',
  'rr_entries', 'rr_entry_history', 'team_health_responses', 'johari_picks',
] as const

export type PolicyRow = {
  tablename: string
  policyname: string
  roles: string | string[]   // pg_policies.roles ('{authenticated}' 문자열 또는 배열)
  cmd: string                // ALL / SELECT / INSERT / UPDATE / DELETE
  qual: string | null        // USING
  with_check: string | null  // WITH CHECK
}

export type Violation = { table: string; policy: string; reason: string }

const OPEN_ROLES = ['authenticated', 'anon', 'public']
const isLiteralTrue = (expr: string | null) => !!expr && /^\(*\s*true\s*\)*$/i.test(expr.trim())
const roleList = (roles: PolicyRow['roles']) =>
  (Array.isArray(roles) ? roles : roles.replace(/[{}"]/g, '').split(',')).map(r => r.trim()).filter(Boolean)

// 민감 테이블에 로그인 사용자(또는 비로그인)에게 조건 없이(true) 열리는 정책이 있으면 위반.
export function findViolations(policies: PolicyRow[], tables: readonly string[] = SENSITIVE_TABLES): Violation[] {
  const out: Violation[] = []
  for (const p of policies) {
    if (!tables.includes(p.tablename)) continue
    if (!roleList(p.roles).some(r => OPEN_ROLES.includes(r))) continue
    if (isLiteralTrue(p.qual)) out.push({ table: p.tablename, policy: p.policyname, reason: `${p.cmd} USING (true) — 로그인만 하면 전체 허용` })
    else if (isLiteralTrue(p.with_check)) out.push({ table: p.tablename, policy: p.policyname, reason: `${p.cmd} WITH CHECK (true) — 로그인만 하면 아무 행이나 쓰기 허용` })
  }
  return out
}
