-- 🎯 오늘의 한 발 (홈 "한 판" 카드) — 하루 1발 다트, 팀 공용 과녁·주간 순위. 2026-11-18
-- 규칙(모두 DB 함수가 확인):
--   · 하루(서울 날짜) 1인 1발. [쏘기]를 누르는 순간 1발로 침(새로고침해도 다시 못 쏨) — daily_shot_start
--   · 결과 저장은 시작 후 60초 안에 한 번만 — daily_shot_finish. 안 끝내면 점수 없이 '놓침'(0점)
--   · 점수는 서버가 맞은 자리(x, y: 과녁 반지름 1 기준, -1.5~1.5)로 계산: 가운데(0.05 안) 100, 그 밖은 95×(1-거리), 과녁 밖 0
-- 함수 본문은 작은따옴표 본문('' 이스케이프)으로 쓴다(달러 태그 복붙 깨짐 방지). Safe to re-run.

CREATE TABLE IF NOT EXISTS daily_shots (
  id         bigserial PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  x          real,
  y          real,
  score      int CHECK (score BETWEEN 0 AND 100),
  started_at timestamptz NOT NULL DEFAULT now(),
  shot_at    timestamptz,
  UNIQUE (member_id, day)
);
CREATE INDEX IF NOT EXISTS daily_shots_day ON daily_shots (day);

ALTER TABLE daily_shots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select" ON daily_shots;
CREATE POLICY "auth_select" ON daily_shots FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON daily_shots FROM authenticated;
GRANT SELECT ON daily_shots TO authenticated;
GRANT ALL ON daily_shots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE daily_shots_id_seq TO service_role;

-- [쏘기] — 오늘 1발을 잡는다. 이미 쐈거나 잡았으면 ALREADY.
CREATE OR REPLACE FUNCTION daily_shot_start()
RETURNS daily_shots
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  r daily_shots;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  INSERT INTO daily_shots (member_id) VALUES (v_me)
  ON CONFLICT (member_id, day) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION ''ALREADY''; END IF;
  RETURN r;
END ';

-- 맞은 자리 저장 — 점수는 여기서 계산
CREATE OR REPLACE FUNCTION daily_shot_finish(p_x real, p_y real)
RETURNS daily_shots
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  v_d double precision;
  v_score int;
  r daily_shots;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  IF p_x IS NULL OR p_y IS NULL OR abs(p_x) > 1.5 OR abs(p_y) > 1.5 THEN RAISE EXCEPTION ''BAD_INPUT''; END IF;
  v_d := sqrt(p_x * p_x + p_y * p_y);
  v_score := CASE WHEN v_d <= 0.05 THEN 100 WHEN v_d >= 1 THEN 0 ELSE round(95 * (1 - v_d))::int END;
  UPDATE daily_shots SET x = p_x, y = p_y, score = v_score, shot_at = now()
  WHERE member_id = v_me AND day = (now() AT TIME ZONE ''Asia/Seoul'')::date
    AND score IS NULL AND started_at > now() - interval ''60 seconds''
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION ''EXPIRED''; END IF;
  RETURN r;
END ';

REVOKE EXECUTE ON FUNCTION daily_shot_start() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION daily_shot_finish(real, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION daily_shot_start() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION daily_shot_finish(real, real) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 실시간 반영은 처음 한 번만 따로 실행(이미 있으면 42710):
-- ALTER PUBLICATION supabase_realtime ADD TABLE daily_shots;
