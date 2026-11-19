-- 2026-11-19 연상퀴즈 참여율 개선
-- 1) quiz_game.turn_since : 지금 차례(라운드·단계)가 시작된 서버 시각 → 1시간 안 들어오면 건너뛰기 판단
-- 2) quiz_game.started_at : 판이 시작된 서버 시각 → "오늘 판이 이미 열렸나" 판단(평일 10시 자동 시작)
-- 3) quiz_game.skipped    : 이번 판에서 시간 초과로 건너뛴 사람
-- 4) quiz_history         : 끝난 판(reveal) 기록 — 갤러리. 서버 트리거가 한 번만 넣는다(화면이 넣지 않음).
-- Safe to re-run.

ALTER TABLE public.quiz_game ADD COLUMN IF NOT EXISTS turn_since timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.quiz_game ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.quiz_game ADD COLUMN IF NOT EXISTS skipped jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.quiz_history (
  id          bigserial PRIMARY KEY,
  word        text,
  drawers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  guesser     text,
  guess       text,
  correct     boolean,
  drawings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped     jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by  text,
  started_at  timestamptz,
  finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_history_finished_idx ON public.quiz_history (finished_at DESC);

ALTER TABLE public.quiz_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_history_select_member" ON public.quiz_history;
CREATE POLICY "quiz_history_select_member" ON public.quiz_history FOR SELECT TO authenticated
  USING (public.current_member_id() IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quiz_history FROM authenticated, anon;
GRANT SELECT ON public.quiz_history TO authenticated;
GRANT ALL ON public.quiz_history TO service_role;

-- 차례가 바뀔 때 서버 시각 기록 + 새 판 시작 때 시작 시각·건너뜀 초기화
CREATE OR REPLACE FUNCTION public.quiz_game_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.round IS DISTINCT FROM OLD.round THEN
    NEW.turn_since := now();
  END IF;
  IF NEW.status = 'drawing' AND OLD.status IN ('setup', 'reveal') THEN
    NEW.started_at := now();
    NEW.skipped := '[]'::jsonb;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quiz_game_stamp ON public.quiz_game;
CREATE TRIGGER quiz_game_stamp BEFORE UPDATE ON public.quiz_game
  FOR EACH ROW EXECUTE FUNCTION public.quiz_game_stamp();

-- 판이 끝나는 순간(→ reveal) 기록 한 줄
CREATE OR REPLACE FUNCTION public.quiz_game_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'reveal' AND OLD.status IS DISTINCT FROM 'reveal' THEN
    INSERT INTO public.quiz_history (word, drawers, guesser, guess, correct, drawings, skipped, started_by, started_at)
    VALUES (NEW.word, NEW.drawers, NEW.guesser, NEW.guess, NEW.correct, NEW.drawings, NEW.skipped, NEW.started_by, NEW.started_at);
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.quiz_game_archive() FROM PUBLIC;
DROP TRIGGER IF EXISTS quiz_game_archive ON public.quiz_game;
CREATE TRIGGER quiz_game_archive AFTER UPDATE ON public.quiz_game
  FOR EACH ROW EXECUTE FUNCTION public.quiz_game_archive();
