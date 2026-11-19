-- ⚽ 오늘의 PK (운동장 ⚽ 축구장) — 하루 5번, 키퍼는 날짜마다 바뀌는 NPC. 2026-11-19
-- 규칙(모두 DB 함수가 확인):
--   · 하루(서울 날짜) 1인 5번. 차는 순간(공이 발을 떠날 때) 결과를 바로 저장 — soccer_pk_kick
--   · detail = 찬 순서대로 'O'(골)/'X'(실패), goals = 'O' 개수
--   · 연습은 저장하지 않는다(화면만)
-- 함수 본문은 작은따옴표 본문('' 이스케이프)으로 쓴다(달러 태그 복붙 깨짐 방지). Safe to re-run.

CREATE TABLE IF NOT EXISTS soccer_pk (
  id         bigserial PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  detail     text NOT NULL DEFAULT '' CHECK (detail ~ '^[OX]{0,5}$'),
  goals      int NOT NULL DEFAULT 0 CHECK (goals BETWEEN 0 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, day)
);
CREATE INDEX IF NOT EXISTS soccer_pk_day ON soccer_pk (day);

ALTER TABLE soccer_pk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select" ON soccer_pk;
CREATE POLICY "auth_select" ON soccer_pk FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON soccer_pk FROM authenticated, anon;
REVOKE SELECT ON soccer_pk FROM anon;
GRANT SELECT ON soccer_pk TO authenticated;
GRANT ALL ON soccer_pk TO service_role;
GRANT USAGE, SELECT ON SEQUENCE soccer_pk_id_seq TO service_role;

-- 한 번 찼다 — 오늘 5번 다 찼으면 FULL
CREATE OR REPLACE FUNCTION soccer_pk_kick(p_goal boolean)
RETURNS soccer_pk
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  v_c text;
  r soccer_pk;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  IF p_goal IS NULL THEN RAISE EXCEPTION ''BAD_INPUT''; END IF;
  v_c := CASE WHEN p_goal THEN ''O'' ELSE ''X'' END;
  INSERT INTO soccer_pk (member_id, detail, goals) VALUES (v_me, v_c, CASE WHEN p_goal THEN 1 ELSE 0 END)
  ON CONFLICT (member_id, day) DO UPDATE
    SET detail = soccer_pk.detail || v_c,
        goals = soccer_pk.goals + CASE WHEN p_goal THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE length(soccer_pk.detail) < 5
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION ''FULL''; END IF;
  RETURN r;
END ';

REVOKE EXECUTE ON FUNCTION soccer_pk_kick(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soccer_pk_kick(boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
