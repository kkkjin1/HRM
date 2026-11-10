-- 2026-11-10 연상퀴즈 테이블(quiz_game, quiz_meta) "로그인만 하면 전부 허용(auth_all)" → 재직 중인 연결된 팀원만.
-- 되돌리기: rollback_tighten_quiz_rls.sql (기준: snapshots/prod-rls-2026-11-10.json)
--
-- 게임(public/drawing-game.html)과 대시보드(useQuizGameStatus)는 브라우저에서 조회·수정만 한다(추가·삭제 없음).
-- 조건은 current_member_id()로 직접 쓴다 — is_member()에 기대면 tighten_sensitive_rls 되돌리기 때
-- 함수 삭제가 이 정책에 막힌다.

BEGIN;

DROP POLICY IF EXISTS "auth_all" ON public.quiz_game;
CREATE POLICY "quiz_game_select_member" ON public.quiz_game FOR SELECT TO authenticated
  USING (public.current_member_id() IS NOT NULL);
CREATE POLICY "quiz_game_update_member" ON public.quiz_game FOR UPDATE TO authenticated
  USING (public.current_member_id() IS NOT NULL) WITH CHECK (public.current_member_id() IS NOT NULL);
REVOKE INSERT, DELETE, TRUNCATE ON public.quiz_game FROM authenticated;

DROP POLICY IF EXISTS "auth_all" ON public.quiz_meta;
CREATE POLICY "quiz_meta_select_member" ON public.quiz_meta FOR SELECT TO authenticated
  USING (public.current_member_id() IS NOT NULL);
CREATE POLICY "quiz_meta_update_member" ON public.quiz_meta FOR UPDATE TO authenticated
  USING (public.current_member_id() IS NOT NULL) WITH CHECK (public.current_member_id() IS NOT NULL);
REVOKE INSERT, DELETE, TRUNCATE ON public.quiz_meta FROM authenticated;

COMMIT;
