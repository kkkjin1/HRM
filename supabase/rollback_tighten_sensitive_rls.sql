-- tighten_sensitive_rls.sql 되돌리기 — 2026-11-10 운영 스냅샷(snapshots/prod-rls-2026-11-10.json) 상태로 복원.
-- 대상 8개 테이블: 새 정책 삭제 → auth_all(로그인하면 전부 허용) 복원 → authenticated의 원래 테이블 권한 복원. 마지막에 is_member() 삭제.
-- 한 트랜잭션, DO 블록·달러 태그 없음(SQL 편집기에 그대로 붙여 넣어도 됨). 여러 번 실행해도 결과가 같다.

BEGIN;

-- team_log_goal_retros
DROP POLICY IF EXISTS "member_select" ON public.team_log_goal_retros;
DROP POLICY IF EXISTS "auth_all" ON public.team_log_goal_retros;
CREATE POLICY "auth_all" ON public.team_log_goal_retros FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.team_log_goal_retros FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_log_goal_retros TO authenticated;

-- team_log_goal_retro_qa
DROP POLICY IF EXISTS "member_select" ON public.team_log_goal_retro_qa;
DROP POLICY IF EXISTS "auth_all" ON public.team_log_goal_retro_qa;
CREATE POLICY "auth_all" ON public.team_log_goal_retro_qa FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.team_log_goal_retro_qa FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_log_goal_retro_qa TO authenticated;

-- team_log_meeting_progress
DROP POLICY IF EXISTS "member_select" ON public.team_log_meeting_progress;
DROP POLICY IF EXISTS "auth_all" ON public.team_log_meeting_progress;
CREATE POLICY "auth_all" ON public.team_log_meeting_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.team_log_meeting_progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_log_meeting_progress TO authenticated;

-- team_log_report_updates
DROP POLICY IF EXISTS "member_select" ON public.team_log_report_updates;
DROP POLICY IF EXISTS "auth_all" ON public.team_log_report_updates;
CREATE POLICY "auth_all" ON public.team_log_report_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.team_log_report_updates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_log_report_updates TO authenticated;

-- team_log_meeting_items
DROP POLICY IF EXISTS "member_select" ON public.team_log_meeting_items;
DROP POLICY IF EXISTS "auth_all" ON public.team_log_meeting_items;
CREATE POLICY "auth_all" ON public.team_log_meeting_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.team_log_meeting_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_log_meeting_items TO authenticated;

-- notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_member" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "auth_all" ON public.notifications;
CREATE POLICY "auth_all" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.notifications FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.notifications TO authenticated;
-- 이번에 추가한 보낸 사람 칸 제거(그 사이 기록된 보낸 사람 정보는 사라짐 — 알림 본문·수신자는 그대로)
ALTER TABLE public.notifications DROP COLUMN IF EXISTS sender_id;

-- disc_responses
DROP POLICY IF EXISTS "disc_select_member" ON public.disc_responses;
DROP POLICY IF EXISTS "disc_insert_self" ON public.disc_responses;
DROP POLICY IF EXISTS "disc_update_self" ON public.disc_responses;
DROP POLICY IF EXISTS "auth_all" ON public.disc_responses;
CREATE POLICY "auth_all" ON public.disc_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.disc_responses FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.disc_responses TO authenticated;

-- belbin_responses
DROP POLICY IF EXISTS "belbin_select_member" ON public.belbin_responses;
DROP POLICY IF EXISTS "belbin_insert_self" ON public.belbin_responses;
DROP POLICY IF EXISTS "belbin_update_self" ON public.belbin_responses;
DROP POLICY IF EXISTS "auth_all" ON public.belbin_responses;
CREATE POLICY "auth_all" ON public.belbin_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.belbin_responses FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.belbin_responses TO authenticated;

DROP FUNCTION IF EXISTS public.is_member();

COMMIT;
