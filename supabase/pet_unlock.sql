-- 호떡: 간식·놀기·쓰담·훈련 횟수를 시간 따라 하나씩 연다 (2026-11-25)
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

REVOKE ALL ON FUNCTION pet_unlock_times(text), pet_unlock_info(text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION pet_state(), pet_act(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pet_state(), pet_act(text, text, boolean) TO authenticated;
