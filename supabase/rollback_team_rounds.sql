-- U2 되돌리기. 반드시 Vercel을 U2 이전 배포로 되돌린 뒤 실행한다. Safe to re-run.
-- 1부(기본): 기존 익명 데이터 쓰기 정책을 U1 상태로 복구하고, 회차 함수·트리거를 걷어낸다. 테이블과 기록은 남긴다.
-- 2부(선택): 회차·응답·이력 테이블까지 지우려면 주석을 푼다 — 실명 진단 기록이 영구히 사라진다.

DROP POLICY IF EXISTS "johari_picks_insert_own" ON johari_picks;

CREATE POLICY "johari_picks_insert_own" ON johari_picks FOR INSERT TO authenticated
  WITH CHECK (author_id = current_member_id());

DROP POLICY IF EXISTS "johari_picks_update_own" ON johari_picks;

CREATE POLICY "johari_picks_update_own" ON johari_picks FOR UPDATE TO authenticated
  USING (author_id = current_member_id()) WITH CHECK (author_id = current_member_id());

DROP POLICY IF EXISTS "team_health_insert_own" ON team_health_responses;

CREATE POLICY "team_health_insert_own" ON team_health_responses FOR INSERT TO authenticated
  WITH CHECK (member_id = current_member_id());

DROP POLICY IF EXISTS "team_health_update_own" ON team_health_responses;

CREATE POLICY "team_health_update_own" ON team_health_responses FOR UPDATE TO authenticated
  USING (member_id = current_member_id()) WITH CHECK (member_id = current_member_id());

DROP TRIGGER IF EXISTS work_styles_log_change ON work_styles;

DROP FUNCTION IF EXISTS work_styles_log_change();

DROP FUNCTION IF EXISTS team_round_open(text, text, jsonb, text, uuid[], timestamptz, uuid);

DROP FUNCTION IF EXISTS team_round_submit(uuid, uuid, text, jsonb);

DROP FUNCTION IF EXISTS team_round_close(uuid, text, jsonb, timestamptz, int, uuid);

DROP FUNCTION IF EXISTS team_round_exclude_member(uuid, uuid, text, uuid);

-- ── 2부(선택) ──
-- DROP TABLE IF EXISTS team_events;
-- DROP TABLE IF EXISTS team_responses;
-- DROP TABLE IF EXISTS team_rounds;
-- DROP FUNCTION IF EXISTS team_events_guard();
-- DROP FUNCTION IF EXISTS team_responses_guard();
-- DROP FUNCTION IF EXISTS team_rounds_guard();
