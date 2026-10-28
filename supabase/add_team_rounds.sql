-- U2. 팀 진단 회차(R0 최초 진단 + 이후 정기 진단) — 실명 응답·마감·이력. Safe to re-run.
-- 전제: add_auth_identity.sql, tighten_team_rls.sql(U1) 적용 완료.
--
-- 구조
--   team_rounds    회차(문항 스냅샷·버전, 참여자 명단, 마감 시점 팀 집계 결과를 그대로 보존)
--   team_responses 실명 응답(회차당 1인 1행, 마감 전까지 본인만 수정, 마감 후 잠김)
--   team_events    변경 이력(추가만). 응답 원문은 넣지 않는다 — 변경 사실과 참조 id만.
--
-- 권한
--   브라우저(authenticated)는 team_rounds·team_responses를 직접 읽거나 쓸 수 없다(정책 없음 + 권한 회수).
--   모든 읽기·쓰기는 /api/team-rounds(서버, service role)가 로그인 계정 id로 본인을 확인한 뒤 아래 함수로 한다.
--   "마감 전엔 본인 응답과 제출률만, 마감 후 전체 공개"는 그 API가 강제하고, 마감·잠금은 DB(함수·트리거)가 강제한다.
--   team_events는 팀원이 읽을 수만 있다(응답 원문이 없어서).
--
-- 마감 규칙
--   R0(baseline)는 팀의 첫 기준점이라 "명단 전원 제출"일 때만 마감된다(팀장도 일부만 받고 확정할 수 없음 — DB 함수가 거부).
--   명단을 바꿔야 하는 예외(장기 부재·퇴사 등)는 team_round_exclude_member()로만 — 사유 필수, 아직 제출 안 한 사람만, 이력에 남는다.
--   정기 진단(periodic)은 팀장이 제출한 사람 기준으로 마감할 수 있다(R0와 별개 규칙).
--   진단 응답은 회차별 스냅샷으로만 남는다. 마감해도 개인의 "나와 일하는 법"(work_styles)을 덮어쓰지 않는다.
--
-- 기존 익명 데이터: 이 파일부터 johari_picks·team_health_responses는 쓰기를 닫는다(읽기는 U1 그대로 본인 행만, 팀은 집계 함수로만).
--   새 조하리·건강도 응답은 실명 회차(team_responses)로만 받는다 — 익명 자료와 섞이지 않는다.
--
-- 되돌리기: rollback_team_rounds.sql
-- Supabase SQL Editor가 "<" 문자에서 문장을 깨뜨리는 문제가 있어 비교는 ">"·"@>" 쪽으로만 쓴다(<, <=, <@, <> 금지).

-- ── 1) 테이블 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('baseline', 'periodic', 'check', 'interpret')),
  title text NOT NULL,
  items jsonb NOT NULL,
  items_version text NOT NULL,
  roster uuid[] NOT NULL CHECK (cardinality(roster) > 0),
  required boolean NOT NULL DEFAULT true,
  topic_id uuid,
  experiment_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  closed_at timestamptz,
  close_reason text CHECK (close_reason IN ('all_submitted', 'manual', 'deadline')),
  result jsonb,
  created_by uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  CHECK ((closed_at IS NULL) = (result IS NULL)),
  CHECK ((closed_at IS NULL) = (close_reason IS NULL))
);

-- R0는 한 번만, 진단(baseline·periodic)은 동시에 하나만 열린다.
CREATE UNIQUE INDEX IF NOT EXISTS team_rounds_one_baseline ON team_rounds (kind) WHERE kind = 'baseline';

CREATE UNIQUE INDEX IF NOT EXISTS team_rounds_one_open_diagnosis ON team_rounds ((true)) WHERE kind IN ('baseline', 'periodic') AND closed_at IS NULL;

CREATE TABLE IF NOT EXISTS team_responses (
  round_id uuid NOT NULL REFERENCES team_rounds(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  items_version text NOT NULL,
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  PRIMARY KEY (round_id, member_id)
);

CREATE INDEX IF NOT EXISTS team_responses_member_idx ON team_responses (member_id, submitted_at);

CREATE TABLE IF NOT EXISTS team_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('round_opened', 'response_submitted', 'round_closed', 'roster_changed', 'profile_updated', 'correction')),
  actor_id uuid REFERENCES members(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES members(id) ON DELETE RESTRICT,
  round_id uuid REFERENCES team_rounds(id) ON DELETE RESTRICT,
  topic_id uuid,
  experiment_id uuid,
  dedupe_key text NOT NULL UNIQUE,
  schema_v smallint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS team_events_at_idx ON team_events (at DESC);

-- ── 2) 권한: 브라우저 직접 접근 차단 ───────────────────────────────────────────
ALTER TABLE team_rounds ENABLE ROW LEVEL SECURITY;

ALTER TABLE team_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON team_rounds FROM anon;

REVOKE ALL ON team_rounds FROM authenticated;

REVOKE ALL ON team_responses FROM anon;

REVOKE ALL ON team_responses FROM authenticated;

REVOKE ALL ON team_events FROM anon;

REVOKE ALL ON team_events FROM authenticated;

GRANT SELECT ON team_events TO authenticated;

GRANT ALL ON team_rounds TO service_role;

GRANT ALL ON team_responses TO service_role;

GRANT ALL ON team_events TO service_role;

DROP POLICY IF EXISTS "team_events_select" ON team_events;

CREATE POLICY "team_events_select" ON team_events FOR SELECT TO authenticated USING (true);

-- ── 3) 잠금 트리거: 마감된 회차·응답은 바뀌지 않고, 이력은 지워지지 않는다(service role 포함) ──────────
CREATE OR REPLACE FUNCTION team_rounds_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_rounds: rounds are kept as history and cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'team_rounds: a closed round is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.items IS DISTINCT FROM OLD.items OR NEW.items_version IS DISTINCT FROM OLD.items_version OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'team_rounds: items and kind are fixed when a round opens' USING ERRCODE = '42501';
  END IF;
  -- 명단은 예외 절차(team_round_exclude_member)에서만, 줄이는 방향으로만 바뀐다.
  IF NEW.roster IS DISTINCT FROM OLD.roster AND (
       coalesce(current_setting('hrm.roster_exception', true), '') != OLD.id::text
       OR NOT (OLD.roster @> NEW.roster) OR cardinality(NEW.roster) = 0) THEN
    RAISE EXCEPTION 'team_rounds: roster can only shrink through team_round_exclude_member()' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_rounds_guard ON team_rounds;

CREATE TRIGGER team_rounds_guard BEFORE UPDATE OR DELETE ON team_rounds
  FOR EACH ROW EXECUTE FUNCTION team_rounds_guard();

CREATE OR REPLACE FUNCTION team_responses_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_responses: responses are kept as history and cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM team_rounds r WHERE r.id = NEW.round_id AND r.closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'team_responses: the round is closed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.member_id IS DISTINCT FROM OLD.member_id) THEN
    RAISE EXCEPTION 'team_responses: round and member cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_responses_guard ON team_responses;

CREATE TRIGGER team_responses_guard BEFORE INSERT OR UPDATE OR DELETE ON team_responses
  FOR EACH ROW EXECUTE FUNCTION team_responses_guard();

CREATE OR REPLACE FUNCTION team_events_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'team_events: history is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS team_events_guard ON team_events;

CREATE TRIGGER team_events_guard BEFORE UPDATE OR DELETE ON team_events
  FOR EACH ROW EXECUTE FUNCTION team_events_guard();

-- ── 4) 회차 열기·제출·마감 (서버 전용: service_role만 실행) ─────────────────────────
CREATE OR REPLACE FUNCTION team_round_open(p_kind text, p_title text, p_items jsonb, p_items_version text,
  p_roster uuid[], p_closes_at timestamptz, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid;
BEGIN
  IF p_kind NOT IN ('baseline', 'periodic') THEN
    RAISE EXCEPTION 'only diagnosis rounds can be opened here' USING ERRCODE = '22023';
  END IF;
  INSERT INTO team_rounds (kind, title, items, items_version, roster, closes_at, created_by)
  VALUES (p_kind, p_title, p_items, p_items_version, p_roster, p_closes_at, p_actor)
  RETURNING id INTO rid;
  INSERT INTO team_events (type, actor_id, round_id, dedupe_key, payload)
  VALUES ('round_opened', p_actor, rid, 'round_opened:' || rid,
          jsonb_build_object('kind', p_kind, 'roster_n', cardinality(p_roster), 'items_version', p_items_version));
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION team_round_submit(p_round uuid, p_member uuid, p_items_version text, p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r team_rounds%ROWTYPE;
  is_first boolean;
  submitted int;
BEGIN
  SELECT * INTO r FROM team_rounds WHERE id = p_round FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'round_closed' USING ERRCODE = '42501'; END IF;
  IF NOT (p_member = ANY (r.roster)) THEN RAISE EXCEPTION 'not_in_roster' USING ERRCODE = '42501'; END IF;
  IF p_items_version IS DISTINCT FROM r.items_version THEN RAISE EXCEPTION 'version_mismatch' USING ERRCODE = '22023'; END IF;

  is_first := NOT EXISTS (SELECT 1 FROM team_responses WHERE round_id = p_round AND member_id = p_member);
  INSERT INTO team_responses (round_id, member_id, items_version, answers)
  VALUES (p_round, p_member, p_items_version, p_answers)
  ON CONFLICT (round_id, member_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now();

  SELECT count(*) INTO submitted FROM team_responses WHERE round_id = p_round;
  IF is_first THEN
    INSERT INTO team_events (type, actor_id, member_id, round_id, dedupe_key, payload)
    VALUES ('response_submitted', p_member, p_member, p_round, 'submitted:' || p_round || ':' || p_member,
            jsonb_build_object('submitted_n', submitted, 'roster_n', cardinality(r.roster)))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('submitted_n', submitted, 'roster_n', cardinality(r.roster), 'first', is_first);
END;
$$;

-- 마감: 서버가 응답을 읽어 계산한 팀 집계(p_result)를 회차에 고정한다. 그 사이 응답이 바뀌었으면 'stale'(서버가 다시 계산).
-- R0는 명단 전원이 제출해야만 마감된다('not_all_submitted'). 응답은 회차 스냅샷으로만 남고 개인 프로필은 건드리지 않는다.
CREATE OR REPLACE FUNCTION team_round_close(p_round uuid, p_reason text, p_result jsonb, p_as_of timestamptz,
  p_n int, p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r team_rounds%ROWTYPE;
  cnt int;
  latest timestamptz;
BEGIN
  SELECT * INTO r FROM team_rounds WHERE id = p_round FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF r.closed_at IS NOT NULL THEN RETURN 'already_closed'; END IF;
  SELECT count(*), max(coalesce(updated_at, submitted_at)) INTO cnt, latest FROM team_responses WHERE round_id = p_round;
  IF cnt != p_n OR (latest IS NOT NULL AND latest > p_as_of) THEN RETURN 'stale'; END IF;

  IF r.kind = 'baseline' AND cardinality(r.roster) > cnt THEN RETURN 'not_all_submitted'; END IF;
  IF cnt = 0 THEN RETURN 'no_responses'; END IF;

  UPDATE team_rounds SET closed_at = now(), close_reason = p_reason, result = p_result WHERE id = p_round;
  INSERT INTO team_events (type, actor_id, round_id, dedupe_key, payload)
  VALUES ('round_closed', p_actor, p_round, 'round_closed:' || p_round,
          jsonb_build_object('reason', p_reason, 'n', cnt, 'roster_n', cardinality(r.roster)));
  RETURN 'closed';
END;
$$;

-- 예외 절차: 아직 제출하지 않은 사람을 명단에서 뺀다(장기 부재·퇴사 등). 사유 필수, 이력에 남는다.
-- 앱 화면에는 없다 — 팀장이 판단한 뒤 SQL Editor에서 실행한다(team_round_roster_exception.sql). 그 뒤 남은 명단 전원이 제출해 있으면 마감할 수 있다.
CREATE OR REPLACE FUNCTION team_round_exclude_member(p_round uuid, p_member uuid, p_reason text, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r team_rounds%ROWTYPE;
BEGIN
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM team_rounds WHERE id = p_round FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'round_closed' USING ERRCODE = '42501'; END IF;
  IF NOT (p_member = ANY (r.roster)) THEN RAISE EXCEPTION 'not_in_roster' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM team_responses WHERE round_id = p_round AND member_id = p_member) THEN
    RAISE EXCEPTION 'already_submitted' USING ERRCODE = '42501';
  END IF;
  IF NOT (cardinality(r.roster) > 1) THEN RAISE EXCEPTION 'roster_would_be_empty' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('hrm.roster_exception', p_round::text, true);
  UPDATE team_rounds SET roster = array_remove(roster, p_member) WHERE id = p_round;
  PERFORM set_config('hrm.roster_exception', '', true);
  INSERT INTO team_events (type, actor_id, member_id, round_id, dedupe_key, payload)
  VALUES ('roster_changed', p_actor, p_member, p_round, 'roster_excluded:' || p_round || ':' || p_member,
          jsonb_build_object('op', 'exclude', 'reason', trim(p_reason), 'roster_n', cardinality(r.roster) - 1));
  RETURN jsonb_build_object('roster_n', cardinality(r.roster) - 1,
    'submitted_n', (SELECT count(*) FROM team_responses WHERE round_id = p_round));
END;
$$;

REVOKE EXECUTE ON FUNCTION team_round_exclude_member(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION team_round_exclude_member(uuid, uuid, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION team_round_open(text, text, jsonb, text, uuid[], timestamptz, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_round_submit(uuid, uuid, text, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_round_close(uuid, text, jsonb, timestamptz, int, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION team_round_open(text, text, jsonb, text, uuid[], timestamptz, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION team_round_submit(uuid, uuid, text, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION team_round_close(uuid, text, jsonb, timestamptz, int, uuid) TO service_role;

-- ── 5) "나와 일하는 법" 변경 이력 — 본인이 프로필을 고칠 때 바뀐 항목 이름만 남긴다(값은 남기지 않는다) ──────
CREATE OR REPLACE FUNCTION work_styles_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed text[] := ARRAY[]::text[];
  src text := nullif(current_setting('hrm.event_source', true), '');
BEGIN
  IF TG_OP = 'INSERT' OR NEW.gives_tags IS DISTINCT FROM OLD.gives_tags THEN changed := array_append(changed, 'gives_tags'); END IF;
  IF TG_OP = 'INSERT' OR NEW.needs_tags IS DISTINCT FROM OLD.needs_tags THEN changed := array_append(changed, 'needs_tags'); END IF;
  IF TG_OP = 'INSERT' OR NEW.when_stuck IS DISTINCT FROM OLD.when_stuck THEN changed := array_append(changed, 'when_stuck'); END IF;
  IF TG_OP = 'INSERT' OR NEW.feedback_pref IS DISTINCT FROM OLD.feedback_pref THEN changed := array_append(changed, 'feedback_pref'); END IF;
  IF TG_OP = 'INSERT' OR NEW.focus_time IS DISTINCT FROM OLD.focus_time THEN changed := array_append(changed, 'focus_time'); END IF;
  IF TG_OP = 'INSERT' OR NEW.meeting_pref IS DISTINCT FROM OLD.meeting_pref THEN changed := array_append(changed, 'meeting_pref'); END IF;
  IF TG_OP = 'INSERT' OR NEW.growth_edge IS DISTINCT FROM OLD.growth_edge THEN changed := array_append(changed, 'growth_edge'); END IF;
  IF TG_OP = 'INSERT' OR NEW.team_request IS DISTINCT FROM OLD.team_request THEN changed := array_append(changed, 'team_request'); END IF;
  IF cardinality(changed) = 0 THEN RETURN NEW; END IF;
  INSERT INTO team_events (type, member_id, round_id, dedupe_key, payload)
  VALUES ('profile_updated', NEW.member_id,
          CASE WHEN src LIKE 'round:%' THEN substring(src FROM 7)::uuid END,
          'profile:' || gen_random_uuid(),
          jsonb_build_object('fields', to_jsonb(changed), 'source', coalesce(src, 'profile')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_styles_log_change ON work_styles;

CREATE TRIGGER work_styles_log_change AFTER INSERT OR UPDATE ON work_styles
  FOR EACH ROW EXECUTE FUNCTION work_styles_log_change();

-- ── 6) 기존 익명 데이터 쓰기 동결 (읽기 정책은 U1 그대로: 본인 행만) ───────────────────────
DROP POLICY IF EXISTS "johari_picks_insert_own" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_update_own" ON johari_picks;

DROP POLICY IF EXISTS "team_health_insert_own" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_update_own" ON team_health_responses;

-- 확인: verify_team_rounds.sql
