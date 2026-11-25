-- 🐶 팀 강아지 키우기(홈 2행 3칸, 연상퀴즈 자리) — 설계 docs/pet-dog-design.md
-- 규칙은 전부 아래 DB 함수가 판정한다(화면을 조작해도 시간·횟수 우회 불가). 산책 성공/실패만 화면 판정을 믿는다(서류탑과 같은 방식).
--   · 밥: 평일 아침 9~11 / 점심 12~14 / 저녁 17~19 구간 안에서 날짜마다 다른 시각(해시)에 배고파함 → 그때부터 구간 끝까지
--         "같이 주기": 사람마다 한 숟갈. 첫 숟갈 +5, 다음 사람 +3, 3명째부터 모두 +2 보너스(배불러요)
--   · 똥: 그 끼니 첫 숟갈 60분 뒤 생김, 먼저 치운 1명 +3
--   · 개인(하루): 간식 2회 +2, 놀기 3회 +2, 쓰담 5회 +1, 산책 1회(실패하면 1번 더) 성공 +6/실패 +1, 훈련(31일~) 3회 +2
--   · 가출: 평일 이틀 연속 밥 0회 → 가출. 팀 합산 '이름 부르며 찾기' 300번(1인 하루 60번)이면 귀가, 가장 많이 찾은 사람 +10
--   · 나이: 태어난 날부터(가출 기간 제외). 31일~ 옷(팀 친밀도 구간) · 개인기(훈련 누적)
-- Safe to re-run.

-- 지금 시각(서버). 시험 때만 postgres 세션에서 pet.fake_now 로 바꿀 수 있다(API 세션은 무시).
CREATE OR REPLACE FUNCTION pet_now()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN session_user = 'postgres' AND COALESCE(current_setting('pet.fake_now', true), '') <> ''
              THEN current_setting('pet.fake_now', true)::timestamptz ELSE now() END
$$;

CREATE TABLE IF NOT EXISTS pets (
  id           bigserial PRIMARY KEY,
  species      text NOT NULL DEFAULT 'dog',
  breed        text NOT NULL DEFAULT 'shiba',
  name         text NOT NULL,
  born_on      date NOT NULL DEFAULT (pet_now() AT TIME ZONE 'Asia/Seoul')::date,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'runaway', 'graduated')),
  runaway_on   date,
  runaway_at   timestamptz,
  returned_on  date,
  paused_days  int  NOT NULL DEFAULT 0,
  outfit       text NOT NULL DEFAULT 'none',
  outfit_by    uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  graduated_at timestamptz
);
-- 키우는 중(가출 포함)인 동물은 늘 하나
CREATE UNIQUE INDEX IF NOT EXISTS pets_one_current ON pets ((true)) WHERE status <> 'graduated';

CREATE TABLE IF NOT EXISTS pet_actions (
  id         bigserial PRIMARY KEY,
  pet_id     bigint NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  member_id  uuid   NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       text   NOT NULL,          -- meal · meal_bonus · poop · snack · play · pat · walk · train · search · return · equip
  slot       text,                     -- 끼니: 'YYYY-MM-DD:b|l|d', 옷: 아이템 키
  day        date   NOT NULL DEFAULT (pet_now() AT TIME ZONE 'Asia/Seoul')::date,
  result     text,                     -- 산책: success / fail
  points     int    NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pet_now()
);
CREATE INDEX IF NOT EXISTS pet_actions_pet_day ON pet_actions (pet_id, day);
CREATE INDEX IF NOT EXISTS pet_actions_pet_kind ON pet_actions (pet_id, kind);
-- 한 끼니에 사람마다 한 숟갈 · 보너스 1번
CREATE UNIQUE INDEX IF NOT EXISTS pet_actions_meal_once ON pet_actions (pet_id, kind, slot, member_id) WHERE kind IN ('meal', 'meal_bonus');
-- 똥 하나는 한 사람만 치움
CREATE UNIQUE INDEX IF NOT EXISTS pet_actions_poop_once ON pet_actions (pet_id, slot) WHERE kind = 'poop';

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select" ON pets;
DROP POLICY IF EXISTS "auth_select" ON pet_actions;
CREATE POLICY "auth_select" ON pets FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON pet_actions FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON pets, pet_actions FROM authenticated, anon;
REVOKE ALL ON pets, pet_actions FROM anon;
GRANT SELECT ON pets, pet_actions TO authenticated;
GRANT ALL ON pets, pet_actions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pets_id_seq, pet_actions_id_seq TO service_role;

-- 평일(주말·팀 휴일 제외)인지
CREATE OR REPLACE FUNCTION pet_is_workday(d date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT extract(isodow FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM team_log_holidays h WHERE h.date = d)
$$;

-- 끼니 창: 구간 시작 + 날짜별 0~90분(해시) ~ 구간 끝
CREATE OR REPLACE FUNCTION pet_slot_open(d date, s text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ((d + make_time(CASE s WHEN 'b' THEN 9 WHEN 'l' THEN 12 ELSE 17 END, 0, 0)) AT TIME ZONE 'Asia/Seoul')
         + make_interval(mins => (abs(hashtext(d::text || ':' || s || ':hotteok')) % 91))
$$;
CREATE OR REPLACE FUNCTION pet_slot_close(d date, s text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT (d + make_time(CASE s WHEN 'b' THEN 11 WHEN 'l' THEN 14 ELSE 19 END, 0, 0)) AT TIME ZONE 'Asia/Seoul'
$$;

-- 나이(1부터, 가출 기간 제외)
CREATE OR REPLACE FUNCTION pet_age(p pets, v_today date)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (v_today - p.born_on) + 1 - p.paused_days
         - CASE WHEN p.status = 'runaway' AND p.runaway_on IS NOT NULL THEN v_today - p.runaway_on ELSE 0 END
$$;

-- 옷 해금 기준(31일~, 팀 친밀도 합계)
CREATE OR REPLACE FUNCTION pet_outfit_need(item text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE item WHEN 'none' THEN 0 WHEN 'scarf' THEN 250 WHEN 'badge' THEN 400 WHEN 'santa' THEN 550 WHEN 'shades' THEN 700 ELSE NULL END
$$;

-- 가출 판정(키우는 중일 때만): 오늘 이전 평일 2일이 모두 밥 0회면 가출
CREATE OR REPLACE FUNCTION pet_check_runaway(p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p pets;
  v_today date := (pet_now() AT TIME ZONE 'Asia/Seoul')::date;
  v_from date;
  d date;
  v_days date[] := '{}';
BEGIN
  SELECT * INTO p FROM pets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'active' THEN RETURN; END IF;
  v_from := GREATEST(p.born_on, COALESCE(p.returned_on, p.born_on));
  d := v_today - 1;
  WHILE array_length(v_days, 1) IS DISTINCT FROM 2 AND d >= v_from LOOP
    IF pet_is_workday(d) THEN v_days := v_days || d; END IF;
    d := d - 1;
  END LOOP;
  IF array_length(v_days, 1) IS DISTINCT FROM 2 THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pet_actions a WHERE a.pet_id = p.id AND a.kind = 'meal' AND a.day = ANY (v_days)) THEN RETURN; END IF;
  UPDATE pets SET status = 'runaway', runaway_on = v_today, runaway_at = pet_now() WHERE id = p.id;
END $$;

-- 간식·놀기·쓰담·훈련은 하루 횟수를 시간 따라 하나씩 연다(아침에 한꺼번에 다 쓰지 않게). KST 시각.
CREATE OR REPLACE FUNCTION pet_unlock_times(p_kind text)
RETURNS time[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind
    WHEN 'snack' THEN ARRAY['10:00', '15:00']::time[]
    WHEN 'play'  THEN ARRAY['09:00', '13:00', '16:30']::time[]
    WHEN 'pat'   THEN ARRAY['09:00', '11:00', '13:00', '15:00', '17:00']::time[]
    WHEN 'train' THEN ARRAY['10:30', '14:00', '17:30']::time[]
  END
$$;

-- {limit, open(지금까지 열린 수), next(다음 열리는 시각 | null)}
CREATE OR REPLACE FUNCTION pet_unlock_info(p_kind text, p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH l AS (SELECT (p_now AT TIME ZONE 'Asia/Seoul') AS ts), t AS (SELECT unnest(pet_unlock_times(p_kind)) AS at)
  SELECT jsonb_build_object(
    'limit', cardinality(pet_unlock_times(p_kind)),
    'open', (SELECT count(*) FROM t, l WHERE t.at <= l.ts::time),
    'next', (SELECT ((l.ts::date + min(t.at)) AT TIME ZONE 'Asia/Seoul') FROM t, l WHERE t.at > l.ts::time GROUP BY l.ts))
$$;

-- 화면이 쓰는 상태 전체(한 번에)
CREATE OR REPLACE FUNCTION pet_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := current_member_id();
  v_now timestamptz := pet_now();
  v_today date := (pet_now() AT TIME ZONE 'Asia/Seoul')::date;
  p pets;
  v_work boolean;
  v_slots jsonb := '[]'::jsonb;
  v_poops jsonb := '[]'::jsonb;
  s text;
  v_key text;
  v_first timestamptz;
  v_open timestamptz;
  v_close timestamptz;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('pet', NULL, 'now', v_now); END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id;
  v_work := pet_is_workday(v_today);

  FOREACH s IN ARRAY ARRAY['b', 'l', 'd'] LOOP
    v_key := v_today::text || ':' || s;
    v_open := pet_slot_open(v_today, s);
    v_close := pet_slot_close(v_today, s);
    SELECT min(created_at) INTO v_first FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key;
    v_slots := v_slots || jsonb_build_object(
      'slot', s, 'key', v_key, 'open_at', v_open, 'close_at', v_close,
      'state', CASE WHEN NOT v_work THEN 'off' WHEN v_now < v_open THEN 'before' WHEN v_now < v_close THEN 'open' ELSE 'closed' END,
      'feeders', COALESCE((SELECT jsonb_agg(member_id ORDER BY created_at) FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key), '[]'::jsonb));
    IF v_first IS NOT NULL AND v_first + interval '60 minutes' <= v_now
       AND NOT EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'poop' AND slot = v_key) THEN
      v_poops := v_poops || jsonb_build_object('key', v_key, 'slot', s);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'now', v_now,
    'today', v_today,
    'workday', v_work,
    'me', v_me,
    'pet', to_jsonb(p) || jsonb_build_object('age', pet_age(p, v_today)),
    'slots', v_slots,
    'poops', v_poops,
    'mine', COALESCE((SELECT jsonb_object_agg(kind, n) FROM (
        SELECT kind, count(*) AS n FROM pet_actions
        WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind IN ('snack', 'play', 'pat', 'walk', 'train', 'search')
        GROUP BY kind) x), '{}'::jsonb)
      || jsonb_build_object('walk_success', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk' AND result = 'success')),
    'unlock', jsonb_build_object('snack', pet_unlock_info('snack', v_now), 'play', pet_unlock_info('play', v_now),
      'pat', pet_unlock_info('pat', v_now), 'train', pet_unlock_info('train', v_now)),
    'affection', COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'points', pts) ORDER BY pts DESC)
        FROM (SELECT member_id, sum(points) AS pts FROM pet_actions WHERE pet_id = p.id GROUP BY member_id) t), '[]'::jsonb),
    'team_total', COALESCE((SELECT sum(points) FROM pet_actions WHERE pet_id = p.id), 0),
    'today_total', COALESCE((SELECT sum(points) FROM pet_actions WHERE pet_id = p.id AND day = v_today), 0),
    'train_total', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND kind = 'train'),
    'search_total', CASE WHEN p.status = 'runaway' THEN (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at) ELSE 0 END,
    'searchers', CASE WHEN p.status = 'runaway' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'n', n) ORDER BY n DESC)
        FROM (SELECT member_id, count(*) AS n FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at GROUP BY member_id) t), '[]'::jsonb) ELSE '[]'::jsonb END,
    'recent', COALESCE((SELECT jsonb_agg(r ORDER BY (r->>'created_at') DESC) FROM (
        SELECT jsonb_build_object('member_id', member_id, 'kind', kind, 'result', result, 'points', points, 'created_at', created_at) AS r
        FROM pet_actions WHERE pet_id = p.id AND kind NOT IN ('meal_bonus', 'search') ORDER BY created_at DESC LIMIT 8) t), '[]'::jsonb)
  );
END $$;

-- 행동 하나. 반환 {ok, points, ...} / 안 되면 예외(코드)
CREATE OR REPLACE FUNCTION pet_act(p_kind text, p_slot text DEFAULT NULL, p_success boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := current_member_id();
  v_now timestamptz := pet_now();
  v_today date := (pet_now() AT TIME ZONE 'Asia/Seoul')::date;
  p pets;
  v_age int;
  v_n int;
  v_pts int := 0;
  v_key text;
  v_first timestamptz;
  v_limit int;
  v_total int;
  v_hero uuid;
  v_res jsonb := '{}'::jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PET'; END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id FOR UPDATE;   -- 모든 행동을 한 줄로 세운다(동시 클릭 경합 방지)
  v_age := pet_age(p, v_today);

  IF p.status = 'runaway' AND p_kind <> 'search' THEN RAISE EXCEPTION 'RUNAWAY'; END IF;
  IF p.status = 'active' AND p_kind = 'search' THEN RAISE EXCEPTION 'NOT_RUNAWAY'; END IF;

  IF p_kind = 'meal' THEN
    IF p_slot NOT IN ('b', 'l', 'd') THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
    IF NOT pet_is_workday(v_today) THEN RAISE EXCEPTION 'OFF_DAY'; END IF;
    IF v_now < pet_slot_open(v_today, p_slot) THEN RAISE EXCEPTION 'NOT_YET'; END IF;
    IF v_now >= pet_slot_close(v_today, p_slot) THEN RAISE EXCEPTION 'CLOSED'; END IF;
    v_key := v_today::text || ':' || p_slot;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key AND member_id = v_me) THEN RAISE EXCEPTION 'DONE'; END IF;
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key;
    v_pts := CASE WHEN v_n = 0 THEN 5 ELSE 3 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'meal', v_key, v_today, v_pts);
    v_n := v_n + 1;
    IF v_n >= 3 THEN
      -- 3명째에 앞의 두 사람까지 보너스, 그 뒤로 온 사람은 본인만
      INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points)
      SELECT p.id, a.member_id, 'meal_bonus', v_key, v_today, 2 FROM pet_actions a
      WHERE a.pet_id = p.id AND a.kind = 'meal' AND a.slot = v_key
      ON CONFLICT DO NOTHING;
      v_res := jsonb_build_object('full', true);
      IF v_n = 3 THEN v_res := v_res || jsonb_build_object('bonus_all', true); END IF;
      v_pts := v_pts + 2;
    END IF;
    v_res := v_res || jsonb_build_object('nth', v_n);

  ELSIF p_kind = 'poop' THEN
    IF p_slot !~ '^\d{4}-\d{2}-\d{2}:[bld]$' THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
    SELECT min(created_at) INTO v_first FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = p_slot;
    IF v_first IS NULL OR v_first + interval '60 minutes' > v_now THEN RAISE EXCEPTION 'NO_POOP'; END IF;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'poop' AND slot = p_slot) THEN RAISE EXCEPTION 'DONE'; END IF;
    v_pts := 3;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'poop', p_slot, v_today, v_pts);

  ELSIF p_kind IN ('snack', 'play', 'pat', 'train') THEN
    v_limit := cardinality(pet_unlock_times(p_kind));
    IF p_kind = 'train' AND v_age < 31 THEN RAISE EXCEPTION 'TOO_YOUNG'; END IF;
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = p_kind;
    IF v_n >= v_limit THEN RAISE EXCEPTION 'LIMIT'; END IF;
    IF v_n >= (pet_unlock_info(p_kind, v_now)->>'open')::int THEN RAISE EXCEPTION 'WAIT'; END IF;   -- 아직 다음 횟수가 안 열림
    v_pts := CASE p_kind WHEN 'pat' THEN 1 ELSE 2 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, p_kind, v_today, v_pts);
    IF p_kind = 'train' THEN v_res := jsonb_build_object('train_total', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND kind = 'train')); END IF;

  ELSIF p_kind = 'walk' THEN
    IF p_success IS NULL THEN RAISE EXCEPTION 'BAD_RESULT'; END IF;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk' AND result = 'success') THEN RAISE EXCEPTION 'LIMIT'; END IF;
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk';
    IF v_n >= 2 THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_pts := CASE WHEN p_success THEN 6 ELSE 1 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, day, result, points)
    VALUES (p.id, v_me, 'walk', v_today, CASE WHEN p_success THEN 'success' ELSE 'fail' END, v_pts);

  ELSIF p_kind = 'search' THEN
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'search';
    IF v_n >= 60 THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_pts := CASE WHEN (v_n + 1) % 10 = 0 THEN 1 ELSE 0 END;   -- 정성 10번마다 친밀도 +1
    INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, 'search', v_today, v_pts);
    SELECT count(*) INTO v_total FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at;
    IF v_total >= 300 THEN
      SELECT member_id INTO v_hero FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at
      GROUP BY member_id ORDER BY count(*) DESC, max(created_at) ASC LIMIT 1;
      UPDATE pets SET status = 'active', paused_days = paused_days + (v_today - runaway_on), returned_on = v_today,
        runaway_on = NULL, runaway_at = NULL WHERE id = p.id;
      INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_hero, 'return', v_today, 10);
      v_res := jsonb_build_object('returned', true, 'hero', v_hero);
    END IF;
    v_res := v_res || jsonb_build_object('search_total', v_total);

  ELSIF p_kind = 'equip' THEN
    IF pet_outfit_need(p_slot) IS NULL THEN RAISE EXCEPTION 'BAD_ITEM'; END IF;
    IF p_slot <> 'none' AND v_age < 31 THEN RAISE EXCEPTION 'TOO_YOUNG'; END IF;
    IF (SELECT COALESCE(sum(points), 0) FROM pet_actions WHERE pet_id = p.id) < pet_outfit_need(p_slot) THEN RAISE EXCEPTION 'LOCKED_ITEM'; END IF;
    UPDATE pets SET outfit = p_slot, outfit_by = v_me WHERE id = p.id;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'equip', p_slot, v_today, 0);

  ELSE
    RAISE EXCEPTION 'BAD_KIND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'points', v_pts) || v_res;
END $$;

REVOKE ALL ON FUNCTION pet_state(), pet_act(text, text, boolean), pet_check_runaway(bigint), pet_is_workday(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION pet_unlock_times(text), pet_unlock_info(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pet_state(), pet_act(text, text, boolean) TO authenticated;

-- 첫 동물: 호떡(시바)
INSERT INTO pets (name, species, breed)
SELECT '호떡', 'dog', 'shiba' WHERE NOT EXISTS (SELECT 1 FROM pets);

-- 실시간(처음 한 번만, 따로 실행):
-- ALTER PUBLICATION supabase_realtime ADD TABLE pets, pet_actions;
