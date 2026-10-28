-- U2 확인용 (읽기 전용). add_team_rounds.sql 직후 실행.

-- 1) 한 줄 요약 — 기대: 테이블 3 / 함수 4 / 브라우저 직접 권한 0 / 이력 읽기 정책 1 / 익명 데이터 쓰기 정책 0
SELECT
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('team_rounds', 'team_responses', 'team_events')) AS tables,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('team_round_open', 'team_round_submit', 'team_round_close', 'team_round_exclude_member')) AS functions,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'authenticated' AND table_name IN ('team_rounds', 'team_responses')) AS browser_grants,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'team_events') AS event_policies,
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('johari_picks', 'team_health_responses') AND cmd IN ('INSERT', 'UPDATE')) AS legacy_write_policies;

-- 2) 회차 현황 (R0 시작 후)
SELECT kind, title, items_version, cardinality(roster) AS roster_n, opened_at, closed_at, close_reason,
       (SELECT count(*) FROM team_responses t WHERE t.round_id = r.id) AS submitted_n
FROM team_rounds r ORDER BY opened_at;
