-- 호떡: 밥·산책은 깜짝 10분 + 가출 하루 + 물주기 코인 상점(집·장난감) (2026-11-25)
--   · 밥(평일 3번)·산책(평일 2번)은 그날 처음 조회될 때 서버가 random()으로 시각을 뽑아 pet_windows 에 적어 둔다.
--     열린 뒤 10분만. 미리 알려 주지 않는다(팀원은 pet_windows 를 못 읽고, 시각 함수도 못 부른다).
--       밥  아침 9:00~10:50 · 점심 12:00~13:50 · 저녁 17:00~18:50 사이에 시작
--       산책 오전 10:00~11:50 · 오후 14:00~17:20 사이에 시작 — 창마다 1번, 하루 성공은 1번. 결과는 닫힌 뒤 5분까지 받아 준다(게임 중 닫힘)
--   · 간식·놀기·쓰담·훈련은 그대로 정해진 시각에 열리되, 다음 시각은 화면에 안 보낸다(soon 여부만).
--   · 가출: 직전 평일 하루 밥 0회 → 가출 (2026-11-26부터 센다)
--   · 코인: 팀 나무 물주기 1번 = 🪙10 (2026-11-25부터). 상점 물건은 팀에 하나씩, 산 사람 이름이 남는다.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS pet_windows (
  day     date NOT NULL,
  kind    text NOT NULL,            -- b · l · d (밥) / am · pm (산책)
  open_at timestamptz NOT NULL,
  PRIMARY KEY (day, kind)
);
ALTER TABLE pet_windows ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 팀원은 못 읽는다
REVOKE ALL ON pet_windows FROM authenticated, anon;
GRANT ALL ON pet_windows TO service_role;

CREATE TABLE IF NOT EXISTS pet_items (
  id         bigserial PRIMARY KEY,
  pet_id     bigint NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  item       text   NOT NULL,
  member_id  uuid   NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  price      int    NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pet_now(),
  UNIQUE (pet_id, item)
);
ALTER TABLE pet_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select" ON pet_items;
CREATE POLICY "auth_select" ON pet_items FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON pet_items FROM authenticated, anon;
REVOKE ALL ON pet_items FROM anon;
GRANT SELECT ON pet_items TO authenticated;
GRANT ALL ON pet_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pet_items_id_seq TO service_role;

-- 창 시작 시각(없으면 지금 뽑아서 적는다)
CREATE OR REPLACE FUNCTION pet_window_open(d date, k text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v timestamptz; v_start time; v_span int;
BEGIN
  SELECT open_at INTO v FROM pet_windows WHERE day = d AND kind = k;
  IF FOUND THEN RETURN v; END IF;
  SELECT x.s, x.n INTO v_start, v_span FROM (VALUES
    ('b', time '09:00', 110), ('l', time '12:00', 110), ('d', time '17:00', 110),
    ('am', time '10:00', 110), ('pm', time '14:00', 200)) AS x(wk, s, n) WHERE x.wk = k;
  IF v_start IS NULL THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
  INSERT INTO pet_windows (day, kind, open_at)
  VALUES (d, k, ((d + v_start) AT TIME ZONE 'Asia/Seoul') + make_interval(mins => floor(random() * (v_span + 1))::int))
  ON CONFLICT (day, kind) DO NOTHING;
  SELECT open_at INTO v FROM pet_windows WHERE day = d AND kind = k;
  RETURN v;
END $$;

-- 밥 창(예전 이름 그대로 — pet_state/pet_act/시험이 쓴다)
CREATE OR REPLACE FUNCTION pet_slot_open(d date, s text)
RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT pet_window_open(d, s)
$$;
CREATE OR REPLACE FUNCTION pet_slot_close(d date, s text)
RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT pet_window_open(d, s) + interval '10 minutes'
$$;

-- 상점 가격(없는 물건이면 NULL). 집은 제일 비싼 것 하나가 마당에 놓인다.
CREATE OR REPLACE FUNCTION pet_item_price(item text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE item
    WHEN 'ball' THEN 20 WHEN 'rope' THEN 30 WHEN 'duck' THEN 40 WHEN 'bear' THEN 60
    WHEN 'house_box' THEN 30 WHEN 'house_wood' THEN 80 WHEN 'house_red' THEN 150
    ELSE NULL END
$$;

-- 내 코인 = 물주기(2026-11-25~) × 10 − 쓴 돈
CREATE OR REPLACE FUNCTION pet_coins(p_member uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*)::int * 10 FROM team_tree_waterings WHERE member_id = p_member AND watered_date >= DATE '2026-11-25')
       - (SELECT COALESCE(sum(price), 0)::int FROM pet_items WHERE member_id = p_member)
$$;

-- 가출 판정: 직전 평일 하루 밥 0회면 가출 (2026-11-26부터 센다)
CREATE OR REPLACE FUNCTION pet_check_runaway(p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p pets;
  v_today date := (pet_now() AT TIME ZONE 'Asia/Seoul')::date;
  v_from date;
  d date;
BEGIN
  SELECT * INTO p FROM pets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'active' THEN RETURN; END IF;
  v_from := GREATEST(p.born_on, COALESCE(p.returned_on, p.born_on), DATE '2026-11-26');
  d := v_today - 1;
  WHILE d >= v_from AND NOT pet_is_workday(d) LOOP d := d - 1; END LOOP;
  IF d < v_from THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pet_actions a WHERE a.pet_id = p.id AND a.kind = 'meal' AND a.day = d) THEN RETURN; END IF;
  UPDATE pets SET status = 'runaway', runaway_on = v_today, runaway_at = pet_now() WHERE id = p.id;
END $$;

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
  v_walk jsonb := NULL;
  s text;
  v_key text;
  v_first timestamptz;
  v_open timestamptz;
  v_close timestamptz;
  v_unlock jsonb;
  k text;
  u jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('pet', NULL, 'now', v_now); END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id;
  v_work := pet_is_workday(v_today);

  FOREACH s IN ARRAY ARRAY['b', 'l', 'd'] LOOP
    v_key := v_today::text || ':' || s;
    IF v_work THEN
      v_open := pet_slot_open(v_today, s);
      v_close := v_open + interval '10 minutes';
    END IF;
    SELECT min(created_at) INTO v_first FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key;
    -- 시각은 열려 있을 때 닫히는 시각만 보낸다(미리 알려 주지 않음)
    v_slots := v_slots || jsonb_build_object(
      'slot', s, 'key', v_key,
      'state', CASE WHEN NOT v_work THEN 'off' WHEN v_now < v_open THEN 'before' WHEN v_now < v_close THEN 'open' ELSE 'closed' END,
      'close_at', CASE WHEN v_work AND v_now >= v_open AND v_now < v_close THEN v_close END,
      'feeders', COALESCE((SELECT jsonb_agg(member_id ORDER BY created_at) FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key), '[]'::jsonb));
    IF v_first IS NOT NULL AND v_first + interval '60 minutes' <= v_now
       AND NOT EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'poop' AND slot = v_key) THEN
      v_poops := v_poops || jsonb_build_object('key', v_key, 'slot', s);
    END IF;
  END LOOP;

  IF v_work THEN
    FOREACH s IN ARRAY ARRAY['am', 'pm'] LOOP
      v_open := pet_window_open(v_today, s);
      IF v_now >= v_open AND v_now < v_open + interval '10 minutes' THEN
        v_key := v_today::text || ':' || s;
        v_walk := jsonb_build_object('slot', s, 'key', v_key, 'close_at', v_open + interval '10 minutes',
          'tried', EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND kind = 'walk' AND slot = v_key));
      END IF;
    END LOOP;
  END IF;

  v_unlock := '{}'::jsonb;
  FOREACH k IN ARRAY ARRAY['snack', 'play', 'pat', 'train'] LOOP
    u := pet_unlock_info(k, v_now);
    v_unlock := v_unlock || jsonb_build_object(k, jsonb_build_object('limit', u->'limit', 'open', u->'open', 'soon', (u->>'next') IS NOT NULL));
  END LOOP;

  RETURN jsonb_build_object(
    'now', v_now,
    'today', v_today,
    'workday', v_work,
    'me', v_me,
    'pet', to_jsonb(p) || jsonb_build_object('age', pet_age(p, v_today)),
    'slots', v_slots,
    'poops', v_poops,
    'walk', v_walk,
    'fed_today', EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND day = v_today),
    'mine', COALESCE((SELECT jsonb_object_agg(kind, n) FROM (
        SELECT kind, count(*) AS n FROM pet_actions
        WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind IN ('snack', 'play', 'pat', 'walk', 'train', 'search')
        GROUP BY kind) x), '{}'::jsonb)
      || jsonb_build_object('walk_success', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk' AND result = 'success')),
    'unlock', v_unlock,
    'coins', pet_coins(v_me),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('item', item, 'member_id', member_id) ORDER BY created_at) FROM pet_items WHERE pet_id = p.id), '[]'::jsonb),
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
  v_open timestamptz;
  v_limit int;
  v_total int;
  v_hero uuid;
  v_price int;
  v_res jsonb := '{}'::jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PET'; END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id FOR UPDATE;   -- 모든 행동을 한 줄로 세운다(동시 클릭 경합 방지)
  v_age := pet_age(p, v_today);

  IF p.status = 'runaway' AND p_kind NOT IN ('search', 'buy') THEN RAISE EXCEPTION 'RUNAWAY'; END IF;
  IF p.status = 'active' AND p_kind = 'search' THEN RAISE EXCEPTION 'NOT_RUNAWAY'; END IF;

  IF p_kind = 'meal' THEN
    IF p_slot IS NULL OR p_slot NOT IN ('b', 'l', 'd') THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
    IF NOT pet_is_workday(v_today) THEN RAISE EXCEPTION 'OFF_DAY'; END IF;
    v_open := pet_slot_open(v_today, p_slot);
    IF v_now < v_open THEN RAISE EXCEPTION 'NOT_YET'; END IF;
    IF v_now >= v_open + interval '10 minutes' THEN RAISE EXCEPTION 'CLOSED'; END IF;
    v_key := v_today::text || ':' || p_slot;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key AND member_id = v_me) THEN RAISE EXCEPTION 'DONE'; END IF;
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key;
    v_pts := CASE WHEN v_n = 0 THEN 5 ELSE 3 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'meal', v_key, v_today, v_pts);
    v_n := v_n + 1;
    IF v_n >= 3 THEN
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
    IF p_slot IS NULL OR p_slot !~ '^\d{4}-\d{2}-\d{2}:[bld]$' THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
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
    IF v_n >= (pet_unlock_info(p_kind, v_now)->>'open')::int THEN RAISE EXCEPTION 'WAIT'; END IF;
    v_pts := CASE p_kind WHEN 'pat' THEN 1 ELSE 2 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, p_kind, v_today, v_pts);
    IF p_kind = 'train' THEN v_res := jsonb_build_object('train_total', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND kind = 'train')); END IF;

  ELSIF p_kind = 'walk' THEN
    -- 산책: 열린 창(am/pm)마다 1번, 하루 성공 1번. 게임 도중 닫힐 수 있어 결과는 닫힌 뒤 5분까지 받는다.
    IF p_success IS NULL THEN RAISE EXCEPTION 'BAD_RESULT'; END IF;
    IF p_slot IS NULL OR p_slot NOT IN ('am', 'pm') THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
    IF NOT pet_is_workday(v_today) THEN RAISE EXCEPTION 'OFF_DAY'; END IF;
    v_open := pet_window_open(v_today, p_slot);
    IF v_now < v_open THEN RAISE EXCEPTION 'NOT_YET'; END IF;
    IF v_now >= v_open + interval '15 minutes' THEN RAISE EXCEPTION 'CLOSED'; END IF;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk' AND result = 'success') THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_key := v_today::text || ':' || p_slot;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND kind = 'walk' AND slot = v_key) THEN RAISE EXCEPTION 'DONE'; END IF;
    v_pts := CASE WHEN p_success THEN 6 ELSE 1 END;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, result, points)
    VALUES (p.id, v_me, 'walk', v_key, v_today, CASE WHEN p_success THEN 'success' ELSE 'fail' END, v_pts);

  ELSIF p_kind = 'search' THEN
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'search';
    IF v_n >= 60 THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_pts := CASE WHEN (v_n + 1) % 10 = 0 THEN 1 ELSE 0 END;
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

  ELSIF p_kind = 'buy' THEN
    v_price := pet_item_price(p_slot);
    IF v_price IS NULL THEN RAISE EXCEPTION 'BAD_ITEM'; END IF;
    IF EXISTS (SELECT 1 FROM pet_items WHERE pet_id = p.id AND item = p_slot) THEN RAISE EXCEPTION 'OWNED'; END IF;
    IF pet_coins(v_me) < v_price THEN RAISE EXCEPTION 'NO_COIN'; END IF;
    INSERT INTO pet_items (pet_id, item, member_id, price) VALUES (p.id, p_slot, v_me, v_price);
    v_res := jsonb_build_object('coins', pet_coins(v_me));

  ELSE
    RAISE EXCEPTION 'BAD_KIND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'points', v_pts) || v_res;
END $$;

-- 팀원(authenticated)은 pet_state·pet_act 두 개만 부를 수 있다. 시각을 알 수 있는 보조 함수는 막는다.
-- (Supabase 기본 권한이 authenticated 에 EXECUTE 를 주므로 PUBLIC 만 막아서는 안 된다)
REVOKE ALL ON FUNCTION pet_window_open(date, text), pet_slot_open(date, text), pet_slot_close(date, text),
  pet_unlock_times(text), pet_unlock_info(text, timestamptz), pet_item_price(text), pet_coins(uuid),
  pet_check_runaway(bigint), pet_is_workday(date), pet_age(pets, date), pet_outfit_need(text), pet_now()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pet_state(), pet_act(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pet_state(), pet_act(text, text, boolean) TO authenticated;

-- 실시간(처음 한 번만, 따로 실행):
-- ALTER PUBLICATION supabase_realtime ADD TABLE pet_items;
