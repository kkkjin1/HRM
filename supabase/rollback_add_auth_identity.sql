-- U1 단계 A 되돌리기 — 반드시 (1) rollback_tighten_team_rls.sql 실행(C를 적용했다면) (2) Vercel을 U1 이전 배포로 되돌린 뒤 실행한다.
-- 새 코드는 이 함수·컬럼이 없으면 모든 사용자를 "연결 안 됨"으로 보고 권한을 거부한다(안전한 쪽으로 실패).
--
-- 1부(기본): 트리거·함수 제거, 동기화 트리거 함수는 예전 모양으로(sync_members.sql을 다시 실행하면 된다).
--           컬럼과 연결값은 남긴다 — 예전 코드는 이 컬럼을 읽지 않아 무해하고, 다시 적용할 때 연결을 반복하지 않아도 된다.
-- 2부(선택): 컬럼까지 지우려면 아래 주석을 푼다. 퇴사 처리(left_at)한 사람이 있으면 그 정보가 사라진다.

DROP TRIGGER IF EXISTS members_guard ON members;

DROP FUNCTION IF EXISTS members_guard();

DROP FUNCTION IF EXISTS johari_summary();

DROP FUNCTION IF EXISTS team_health_summary();

DROP FUNCTION IF EXISTS is_lead();

DROP FUNCTION IF EXISTS current_member_id();

-- 이어서 sync_members.sql 을 다시 실행해 동기화 트리거 함수를 예전 모양으로 되돌린다(재실행 안전).

-- ── 2부(선택) ──
-- DROP INDEX IF EXISTS team_log_members_member_id_key;
-- ALTER TABLE team_log_members DROP COLUMN IF EXISTS member_id;
-- DROP INDEX IF EXISTS members_auth_user_id_key;
-- ALTER TABLE members DROP COLUMN IF EXISTS auth_user_id;
-- ALTER TABLE members DROP COLUMN IF EXISTS can_manage_members;
-- ALTER TABLE members DROP COLUMN IF EXISTS left_at;
