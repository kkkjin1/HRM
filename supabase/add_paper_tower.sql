-- 🗼 서류탑(홈 "한 판" 카드) — 팀 공용 탑. 아무나 언제든 한 개씩 올리고, 무너뜨리면 범인 + 새 탑.
-- 규칙(모두 DB 함수가 확인 — 화면을 조작해도 우회 불가):
--   · 한 탑에 1인 5회 (paper_tower_claim 의 v_limit, 2026-11-09 2→5)
--   · 관리자(팀장, is_lead)는 지금 탑을 리셋할 수 있음 (paper_tower_reset) — 기록은 end_reason='reset'으로 남김
--   · 같은 사람 연속 금지 (마지막에 놓은 사람은 다른 사람이 놓을 때까지 못 놓음)
--   · 누가 놓는 중이면 잠금(20초). [지금 놓기]를 누르는 순간 1회로 침(창을 닫아도 소모)
--   · 날짜(서울)가 바뀐 뒤 처음 잡으면 어제 탑은 '완공'으로 마감하고 새 탑
-- 물리 결과는 놓은 사람 화면의 계산이 정답: 탑이 멈춘 뒤 물건 목록(종류·위치·각도·크기·놓은 사람)을 state 로 저장.
-- 함수 본문은 채팅 복붙 때 달러 기호가 사라지지 않게 작은따옴표 본문('' 이스케이프)으로 쓴다.
-- Safe to re-run. 앱 코드 배포 전에 먼저 실행. 실시간 설정(맨 아래 주석)은 처음 한 번만 따로 실행.

CREATE TABLE IF NOT EXISTS paper_towers (
  id           bigserial PRIMARY KEY,
  day          date        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  end_reason   text CHECK (end_reason IN ('collapse', 'complete')),
  collapsed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  floors       int  NOT NULL DEFAULT 0,
  state        jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_kind    text,
  version      int  NOT NULL DEFAULT 0,
  last_by      uuid REFERENCES members(id) ON DELETE SET NULL,
  lock_by      uuid REFERENCES members(id) ON DELETE SET NULL,
  lock_until   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- 진행 중인 탑은 늘 하나
CREATE UNIQUE INDEX IF NOT EXISTS paper_towers_one_open ON paper_towers ((true)) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS paper_tower_moves (
  id         bigserial PRIMARY KEY,
  tower_id   bigint NOT NULL REFERENCES paper_towers(id) ON DELETE CASCADE,
  member_id  uuid   NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  floor      int    NOT NULL,           -- 몇 번째 차례였는지(1부터)
  kind       text   NOT NULL,
  result     text CHECK (result IN ('safe', 'collapse')),  -- NULL = 놓는 중 또는 시간 초과로 미기록
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paper_tower_moves_tower ON paper_tower_moves (tower_id, id);

-- 마감 사유에 관리자 리셋 추가(처음 만든 표의 CHECK 를 바꿔 끼움)
ALTER TABLE paper_towers DROP CONSTRAINT IF EXISTS paper_towers_end_reason_check;
ALTER TABLE paper_towers ADD CONSTRAINT paper_towers_end_reason_check CHECK (end_reason IN ('collapse', 'complete', 'reset'));

-- 읽기는 로그인한 팀원 누구나, 쓰기는 아래 함수로만
ALTER TABLE paper_towers ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_tower_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select" ON paper_towers;
DROP POLICY IF EXISTS "auth_select" ON paper_tower_moves;
CREATE POLICY "auth_select" ON paper_towers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON paper_tower_moves FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON paper_towers, paper_tower_moves FROM authenticated;
GRANT SELECT ON paper_towers, paper_tower_moves TO authenticated;
GRANT ALL ON paper_towers, paper_tower_moves TO service_role;
GRANT USAGE, SELECT ON SEQUENCE paper_towers_id_seq, paper_tower_moves_id_seq TO service_role;

-- 진행 중인 탑(없으면 만들고, 어제 탑이면 완공 마감 후 새로)
CREATE OR REPLACE FUNCTION paper_tower_current()
RETURNS paper_towers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  t paper_towers;
  v_open boolean;
  v_today date := (now() AT TIME ZONE ''Asia/Seoul'')::date;
BEGIN
  SELECT * INTO t FROM paper_towers WHERE ended_at IS NULL FOR UPDATE;
  v_open := FOUND;
  IF v_open AND t.day < v_today AND t.floors = 0 AND NOT EXISTS (SELECT 1 FROM paper_tower_moves WHERE tower_id = t.id) THEN
    -- 아무도 안 쌓은 어제 탑은 기록 없이 날짜만 오늘로
    UPDATE paper_towers SET day = v_today, updated_at = now() WHERE id = t.id RETURNING * INTO t;
  ELSIF v_open AND t.day < v_today AND (t.lock_until IS NULL OR t.lock_until < now()) THEN
    UPDATE paper_towers SET ended_at = now(), end_reason = ''complete'', lock_by = NULL, lock_until = NULL, updated_at = now() WHERE id = t.id;
    v_open := false;
  END IF;
  IF NOT v_open THEN
    INSERT INTO paper_towers (day) VALUES (v_today) ON CONFLICT DO NOTHING;
    SELECT * INTO t FROM paper_towers WHERE ended_at IS NULL;
  END IF;
  RETURN t;
END ';

-- [지금 놓기] — 잠금을 잡고 회차를 1회 소모. 못 잡으면 이유 코드로 예외.
-- 반환: 탑 행(잡은 뒤 상태) — 화면은 이 state 로 탑을 다시 세우고, next_kind 를 이번 물건으로 쓴다.
CREATE OR REPLACE FUNCTION paper_tower_claim(p_kind text)
RETURNS paper_towers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  v_limit int := 5;
  v_used int;
  t paper_towers;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  t := paper_tower_current();
  SELECT * INTO t FROM paper_towers WHERE id = t.id FOR UPDATE;
  IF t.lock_by IS NOT NULL AND t.lock_until > now() THEN
    IF t.lock_by = v_me THEN RAISE EXCEPTION ''ALREADY_MINE''; END IF;
    RAISE EXCEPTION ''LOCKED'';
  END IF;
  IF t.last_by = v_me THEN RAISE EXCEPTION ''CONSECUTIVE''; END IF;
  SELECT count(*) INTO v_used FROM paper_tower_moves WHERE tower_id = t.id AND member_id = v_me;
  IF v_used >= v_limit THEN RAISE EXCEPTION ''LIMIT''; END IF;
  INSERT INTO paper_tower_moves (tower_id, member_id, floor, kind)
  VALUES (t.id, v_me, (SELECT count(*) + 1 FROM paper_tower_moves WHERE tower_id = t.id), COALESCE(t.next_kind, p_kind));
  UPDATE paper_towers SET lock_by = v_me, lock_until = now() + interval ''20 seconds'',
    next_kind = COALESCE(next_kind, p_kind), updated_at = now()
  WHERE id = t.id RETURNING * INTO t;
  RETURN t;
END ';

-- 결과 저장 — 탑이 멈춘 뒤 호출. 잠금이 내 것이고 버전이 같아야 함.
-- p_collapsed = true 면 이 탑을 범인과 함께 마감하고 새 탑을 연다.
CREATE OR REPLACE FUNCTION paper_tower_commit(p_tower_id bigint, p_version int, p_state jsonb, p_collapsed boolean, p_next_kind text)
RETURNS paper_towers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  v_move bigint;
  t paper_towers;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  SELECT * INTO t FROM paper_towers WHERE id = p_tower_id FOR UPDATE;
  IF NOT FOUND OR t.ended_at IS NOT NULL THEN RAISE EXCEPTION ''TOWER_CLOSED''; END IF;
  IF t.lock_by IS DISTINCT FROM v_me OR t.lock_until < now() - interval ''3 seconds'' THEN RAISE EXCEPTION ''LOCK_LOST''; END IF;
  IF t.version <> p_version THEN RAISE EXCEPTION ''VERSION''; END IF;
  SELECT id INTO v_move FROM paper_tower_moves WHERE tower_id = t.id AND member_id = v_me AND result IS NULL ORDER BY id DESC LIMIT 1;
  UPDATE paper_tower_moves SET result = CASE WHEN p_collapsed THEN ''collapse'' ELSE ''safe'' END WHERE id = v_move;
  IF p_collapsed THEN
    UPDATE paper_towers SET ended_at = now(), end_reason = ''collapse'', collapsed_by = v_me,
      lock_by = NULL, lock_until = NULL, last_by = v_me, version = version + 1, updated_at = now()
    WHERE id = t.id;
    INSERT INTO paper_towers (day, next_kind) VALUES ((now() AT TIME ZONE ''Asia/Seoul'')::date, p_next_kind);
    SELECT * INTO t FROM paper_towers WHERE ended_at IS NULL;
  ELSE
    UPDATE paper_towers SET state = COALESCE(p_state, ''[]''::jsonb), floors = jsonb_array_length(COALESCE(p_state, ''[]''::jsonb)),
      next_kind = p_next_kind, last_by = v_me, lock_by = NULL, lock_until = NULL, version = version + 1, updated_at = now()
    WHERE id = t.id RETURNING * INTO t;
  END IF;
  RETURN t;
END ';

-- 잠금 풀기(화면을 떠날 때 등). 내 잠금일 때만. 회차는 이미 소모됨.
CREATE OR REPLACE FUNCTION paper_tower_release()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS '
  UPDATE paper_towers SET lock_by = NULL, lock_until = NULL, updated_at = now()
  WHERE ended_at IS NULL AND lock_by = current_member_id();
';

-- 관리자 리셋: 지금 탑을 'reset'으로 마감하고 빈 새 탑을 연다(놓는 중이던 사람의 저장은 TOWER_CLOSED 로 거절됨)
CREATE OR REPLACE FUNCTION paper_tower_reset()
RETURNS paper_towers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  t paper_towers;
BEGIN
  IF NOT is_lead() THEN RAISE EXCEPTION ''NOT_LEAD''; END IF;
  UPDATE paper_towers SET ended_at = now(), end_reason = ''reset'', collapsed_by = NULL,
    lock_by = NULL, lock_until = NULL, version = version + 1, updated_at = now()
  WHERE ended_at IS NULL;
  INSERT INTO paper_towers (day) VALUES ((now() AT TIME ZONE ''Asia/Seoul'')::date);
  SELECT * INTO t FROM paper_towers WHERE ended_at IS NULL;
  RETURN t;
END ';

REVOKE EXECUTE ON FUNCTION paper_tower_current() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION paper_tower_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION paper_tower_reset() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION paper_tower_claim(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION paper_tower_commit(bigint, int, jsonb, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION paper_tower_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION paper_tower_current() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION paper_tower_claim(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION paper_tower_commit(bigint, int, jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION paper_tower_release() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 실시간 반영(다른 사람이 놓으면 내 화면 탑이 바로 바뀜). 이미 추가돼 있으면 42710 에러가 나고
-- SQL Editor가 위 문장까지 되돌리므로, 위를 실행한 뒤 처음 한 번만 따로 실행한다:
-- ALTER PUBLICATION supabase_realtime ADD TABLE paper_towers, paper_tower_moves;
