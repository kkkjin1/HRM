-- 2026-11-10 민감 테이블 "로그인만 하면 전부 허용(auth_all)" 정책 제거.
-- 되돌리기: rollback_tighten_sensitive_rls.sql (운영 기준 스냅샷: snapshots/prod-rls-2026-11-10.json)
--
-- 배경: 서버 API는 service_role이라 RLS와 무관하다. 이 정책들이 막는 건 "브라우저가 anon 키 + 로그인 세션으로
-- DB에 직접 붙는 경로"다. 지금은 auth_all이라 팀원 누구나 API의 권한 검사를 건너뛰고 남의 회고 덮어쓰기,
-- 팀장 코멘트·피드백 작성, 남의 알림 읽기 등을 할 수 있었다.
--
-- 원칙: 브라우저가 실제로 쓰는 만큼만 연다.
--   · 서버만 쓰는 테이블(회고·회고Q&A·회의 진행/팀장 코멘트·업무보고 업데이트/피드백·회의 항목(근태 포함))
--       → 읽기는 "재직 중인 연결된 팀원"만(실시간 반영에 필요), 쓰기는 브라우저에서 불가(서버 API만).
--   · 알림 → 본인 것만 읽기·읽음 표시, 보내기(남에게 insert)는 팀원이면 가능(오늘의 한마디·낙서판 태그 알림).
--       보낸 사람 칸(sender_id)을 새로 두고 로그인 본인으로 자동 기록·강제한다(남인 척 보내기 차단).
--   · DISC·Belbin → 팀 화면이 전원 결과를 보여주므로 읽기는 팀원, 쓰기는 본인 행만.
--   · 익명채팅·익명투표, 생일·입사일(members)은 이번 범위 밖(변경 없음).
--
-- 실행: 한 트랜잭션. 중간에 실패하면 아무것도 바뀌지 않는다.

BEGIN;

-- 재직 중이고 로그인 계정이 연결된 팀원인지 (current_member_id()가 left_at 없는 행만 돌려준다)
CREATE OR REPLACE FUNCTION public.is_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.current_member_id() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.is_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated, service_role;

-- ── 1. 서버만 쓰는 테이블: 읽기만 팀원 ─────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON public.team_log_goal_retros;
CREATE POLICY "member_select" ON public.team_log_goal_retros FOR SELECT TO authenticated USING (public.is_member());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_log_goal_retros FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.team_log_goal_retro_qa;
CREATE POLICY "member_select" ON public.team_log_goal_retro_qa FOR SELECT TO authenticated USING (public.is_member());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_log_goal_retro_qa FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.team_log_meeting_progress;
CREATE POLICY "member_select" ON public.team_log_meeting_progress FOR SELECT TO authenticated USING (public.is_member());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_log_meeting_progress FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.team_log_report_updates;
CREATE POLICY "member_select" ON public.team_log_report_updates FOR SELECT TO authenticated USING (public.is_member());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_log_report_updates FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.team_log_meeting_items;
CREATE POLICY "member_select" ON public.team_log_meeting_items FOR SELECT TO authenticated USING (public.is_member());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.team_log_meeting_items FROM authenticated;

-- ── 2. 알림: 본인 것만 읽기·읽음 표시, 보내기는 팀원(보낸 사람 = 로그인 본인 고정) ─────
-- 보낸 사람: 브라우저는 이 칸을 보내지 않으므로 기본값이 로그인 본인으로 채운다. 서버(service_role)가 보내는
-- 시스템 알림은 로그인 사용자가 없어 null. 다른 값을 직접 넣으면 아래 INSERT 정책이 거부한다.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id uuid DEFAULT public.current_member_id() REFERENCES public.members(id) ON DELETE SET NULL;
DROP POLICY IF EXISTS "auth_all" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());
CREATE POLICY "notifications_insert_member" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_member() AND sender_id = public.current_member_id());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id()) WITH CHECK (member_id = public.current_member_id());
REVOKE UPDATE, DELETE, TRUNCATE ON public.notifications FROM authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;  -- 브라우저는 읽음 표시만 바꾼다

-- ── 3. DISC·Belbin: 읽기 팀원, 쓰기 본인 행만 ─────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON public.disc_responses;
CREATE POLICY "disc_select_member" ON public.disc_responses FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "disc_insert_self" ON public.disc_responses FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
CREATE POLICY "disc_update_self" ON public.disc_responses FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id()) WITH CHECK (member_id = public.current_member_id());
REVOKE DELETE, TRUNCATE ON public.disc_responses FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.belbin_responses;
CREATE POLICY "belbin_select_member" ON public.belbin_responses FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "belbin_insert_self" ON public.belbin_responses FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
CREATE POLICY "belbin_update_self" ON public.belbin_responses FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id()) WITH CHECK (member_id = public.current_member_id());
REVOKE DELETE, TRUNCATE ON public.belbin_responses FROM authenticated;

COMMIT;
