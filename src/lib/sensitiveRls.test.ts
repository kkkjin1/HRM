import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findViolations, SENSITIVE_TABLES, type PolicyRow } from './sensitiveRls'

// 권한 스냅샷 테스트 — 민감 테이블에 "로그인만 하면 전체 허용" 정책이 생기면 실패한다.
// 실제 DB 점검은 npm run db:rls-check (scripts/check-sensitive-rls.mjs)가 같은 규칙으로 한다.

const supa = path.join(process.cwd(), 'supabase')
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(supa, f), 'utf8'))

describe('findViolations 규칙', () => {
  const p = (over: Partial<PolicyRow>): PolicyRow => ({ tablename: 'notifications', policyname: 'x', roles: '{authenticated}', cmd: 'ALL', qual: null, with_check: null, ...over })

  it('USING (true) / WITH CHECK (true)를 잡는다', () => {
    expect(findViolations([p({ qual: 'true', with_check: 'true' })])).toHaveLength(1)
    expect(findViolations([p({ cmd: 'INSERT', with_check: 'true' })])).toHaveLength(1)
    expect(findViolations([p({ cmd: 'SELECT', qual: '(true)', roles: ['anon'] })])).toHaveLength(1)
  })
  it('조건이 있는 정책, 서버 전용 역할, 민감하지 않은 테이블은 통과', () => {
    expect(findViolations([p({ cmd: 'SELECT', qual: '(member_id = current_member_id())' })])).toEqual([])
    expect(findViolations([p({ cmd: 'SELECT', qual: 'is_member()' })])).toEqual([])
    expect(findViolations([p({ roles: '{service_role}', qual: 'true' })])).toEqual([])
    expect(findViolations([p({ tablename: 'baseball_plays', qual: 'true' })])).toEqual([])
  })
})

describe('스냅샷', () => {
  it('2026-11-10 변경 전 운영 스냅샷: 대상 8개 테이블의 auth_all을 정확히 잡는다(규칙이 실제 구멍을 감지하는지)', () => {
    const snap = readJson('snapshots/prod-rls-2026-11-10.json')
    const v = findViolations(snap.policies.filter((x: { schemaname: string }) => x.schemaname === 'public'))
    expect(v.map(x => `${x.table}.${x.policy}`).sort()).toEqual([
      'belbin_responses.auth_all', 'disc_responses.auth_all', 'notifications.auth_all', 'team_log_goal_retro_qa.auth_all',
      'team_log_goal_retros.auth_all', 'team_log_meeting_items.auth_all', 'team_log_meeting_progress.auth_all', 'team_log_report_updates.auth_all',
    ])
  })
  it('기대 정책 스냅샷(policy-expected.json)에는 위반이 없다', () => {
    const rows: PolicyRow[] = readJson('snapshots/policy-expected.json')
    expect(rows.length).toBeGreaterThan(0)
    expect(findViolations(rows)).toEqual([])
    // 변경한 8개 테이블에서 auth_all이 다시 나타나면 안 된다
    expect(rows.filter(r => r.policyname === 'auth_all')).toEqual([])
  })
  it('이번 마이그레이션(tighten_sensitive_rls.sql)이 만드는 정책에 true 조건이 없다', () => {
    const sql = fs.readFileSync(path.join(supa, 'tighten_sensitive_rls.sql'), 'utf8')
    const created = [...sql.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)\s+TO\s+(\w+)([\s\S]*?);/g)].map(m => {
      const body = m[5]
      return {
        policyname: m[1], tablename: m[2], cmd: m[3], roles: `{${m[4]}}`,
        qual: body.match(/USING\s*\(([\s\S]*?)\)\s*(?:WITH|$)/)?.[1] ?? null,
        with_check: body.match(/WITH CHECK\s*\(([\s\S]*?)\)\s*$/)?.[1] ?? null,
      }
    })
    expect(created.length).toBe(14) // 읽기 전용 5 + 알림 3 + DISC 3 + Belbin 3
    expect(findViolations(created)).toEqual([])
    expect(new Set(created.map(c => c.tablename)).size).toBe(8)
    expect(created.every(c => (SENSITIVE_TABLES as readonly string[]).includes(c.tablename))).toBe(true)
  })
})
