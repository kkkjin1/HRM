-- tighten_quiz_rls.sql 되돌리기 — 2026-11-10 운영 스냅샷 상태(auth_all + authenticated 전체 권한)로 복원.
-- 한 트랜잭션, DO 블록·달러 태그 없음. 여러 번 실행해도 결과가 같다.

BEGIN;

DROP POLICY IF EXISTS "quiz_game_select_member" ON public.quiz_game;
DROP POLICY IF EXISTS "quiz_game_update_member" ON public.quiz_game;
DROP POLICY IF EXISTS "auth_all" ON public.quiz_game;
CREATE POLICY "auth_all" ON public.quiz_game FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.quiz_game FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.quiz_game TO authenticated;

DROP POLICY IF EXISTS "quiz_meta_select_member" ON public.quiz_meta;
DROP POLICY IF EXISTS "quiz_meta_update_member" ON public.quiz_meta;
DROP POLICY IF EXISTS "auth_all" ON public.quiz_meta;
CREATE POLICY "auth_all" ON public.quiz_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.quiz_meta FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.quiz_meta TO authenticated;

COMMIT;
