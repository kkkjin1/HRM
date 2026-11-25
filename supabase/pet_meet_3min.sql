-- 🐾 호떡 만나기 2분 → 3분 (2026-11-25)
CREATE OR REPLACE FUNCTION public.pet_act(p_kind text, p_slot text DEFAULT NULL::text, p_success boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  v_hour int := extract(hour FROM (pet_now() AT TIME ZONE 'Asia/Seoul'))::int;
  v_asleep boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PET'; END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id FOR UPDATE;   -- 모든 행동을 한 줄로 세운다(동시 클릭 경합 방지)
  v_age := pet_age(p, v_today);
  -- 자는 시간(주말·휴일 하루 종일, 평일 9시 전·19시부터) — 누가 깨우면 10분 동안은 깨어 있다
  v_asleep := (NOT pet_is_workday(v_today) OR v_hour < 9 OR v_hour >= 19) AND (p.awake_until IS NULL OR p.awake_until <= v_now);

  IF p.status = 'runaway' AND p_kind NOT IN ('search', 'apology', 'buy') THEN RAISE EXCEPTION 'RUNAWAY'; END IF;
  IF p.status = 'active' AND p_kind = 'search' THEN RAISE EXCEPTION 'NOT_RUNAWAY'; END IF;

  IF p_kind = 'meal' THEN
    IF p_slot IS NULL OR p_slot NOT IN ('b', 'l', 'd') THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
    IF NOT pet_is_workday(v_today) THEN RAISE EXCEPTION 'OFF_DAY'; END IF;
    v_open := pet_slot_open(v_today, p_slot);
    IF v_now < v_open THEN RAISE EXCEPTION 'NOT_YET'; END IF;
    IF v_now >= pet_slot_close(v_today, p_slot) THEN RAISE EXCEPTION 'CLOSED'; END IF;
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

  ELSIF p_kind IN ('search', 'apology') THEN
    -- 가출한 호떡 찾기: 팀이 부르기(1인 하루 60번) + 서운하게 한 사람의 🙇 사과 간식(가출 1번에 1번, 부르기 30번 몫).
    -- 합계가 pet_search_goal()이 되면 돌아오고, 제일 많이 부른 사람에게 먼저 달려온다(+10).
    IF p_kind = 'search' THEN
      SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'search';
      IF v_n >= 60 THEN RAISE EXCEPTION 'LIMIT'; END IF;
      v_pts := CASE WHEN (v_n + 1) % 10 = 0 THEN 1 ELSE 0 END;
      INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, 'search', v_today, v_pts);
    ELSE
      IF p.runaway_by IS DISTINCT FROM v_me THEN RAISE EXCEPTION 'NOT_CULPRIT'; END IF;
      IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'apology' AND created_at >= p.runaway_at) THEN RAISE EXCEPTION 'DONE'; END IF;
      v_pts := 3;
      INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, 'apology', v_today, v_pts);
    END IF;
    v_total := pet_search_total(p.id, p.runaway_at);
    IF v_total >= pet_search_goal() THEN
      SELECT member_id INTO v_hero FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at
      GROUP BY member_id ORDER BY count(*) DESC, max(created_at) ASC LIMIT 1;
      v_hero := COALESCE(v_hero, v_me);
      UPDATE pets SET status = 'active', paused_days = paused_days + (v_today - runaway_on), returned_on = v_today,
        runaway_on = NULL, runaway_at = NULL, runaway_by = NULL WHERE id = p.id;
      INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_hero, 'return', v_today, 10);
      v_res := jsonb_build_object('returned', true, 'hero', v_hero);
    END IF;
    v_res := v_res || jsonb_build_object('search_total', v_total);

  ELSIF p_kind = 'equip' THEN
    IF pet_outfit_need(p_slot) IS NULL THEN RAISE EXCEPTION 'BAD_ITEM'; END IF;
    IF p_slot <> 'none' AND v_age < 31 THEN RAISE EXCEPTION 'TOO_YOUNG'; END IF;
    IF (SELECT COALESCE(sum(GREATEST(points, 0)), 0) FROM pet_actions WHERE pet_id = p.id) < pet_outfit_need(p_slot) THEN RAISE EXCEPTION 'LOCKED_ITEM'; END IF;
    UPDATE pets SET outfit = p_slot, outfit_by = v_me WHERE id = p.id;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'equip', p_slot, v_today, 0);

  ELSIF p_kind = 'toy' THEN
    -- 산 장난감으로 놀기: 1인 하루 1번(어느 장난감이든), +1
    IF p_slot IS NULL OR pet_item_price(p_slot) IS NULL OR p_slot NOT IN ('ball', 'rope', 'duck', 'bear') THEN RAISE EXCEPTION 'BAD_ITEM'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pet_items WHERE pet_id = p.id AND item = p_slot) THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;
    IF EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'toy') THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_pts := 1;
    INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'toy', p_slot, v_today, v_pts);

  ELSIF p_kind = 'wake' THEN
    -- ⏰ 자는 호떡 깨우기: 짜증 — 깨운 사람 애정도 -3, 10분 동안 깨어 있음. 1인 하루 3번
    IF p.status <> 'active' THEN RAISE EXCEPTION 'RUNAWAY'; END IF;
    IF NOT v_asleep THEN RAISE EXCEPTION 'AWAKE'; END IF;
    SELECT count(*) INTO v_n FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'wake';
    IF v_n >= 3 THEN RAISE EXCEPTION 'LIMIT'; END IF;
    v_pts := -3;
    INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, 'wake', v_today, v_pts);
    UPDATE pets SET awake_until = v_now + interval '10 minutes', awake_by = v_me WHERE id = p.id;
    v_res := jsonb_build_object('awake_until', v_now + interval '10 minutes');

  ELSIF p_kind = 'meet' THEN
    -- 🐾 호떡 만나기: 1인 하루 1번, 2분. 2분 안이면 다시 들어올 수 있다(점수는 처음 1번만 +1)
    IF p.status <> 'active' THEN RAISE EXCEPTION 'RUNAWAY'; END IF;
    SELECT created_at INTO v_first FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'meet' ORDER BY created_at LIMIT 1;
    IF v_first IS NOT NULL THEN
      IF v_first + interval '3 minutes' <= v_now THEN RAISE EXCEPTION 'LIMIT'; END IF;
      v_res := jsonb_build_object('until', v_first + interval '3 minutes', 'again', true);
    ELSE
      IF v_asleep THEN RAISE EXCEPTION 'SLEEPING'; END IF;
      v_pts := 1;
      INSERT INTO pet_actions (pet_id, member_id, kind, day, points) VALUES (p.id, v_me, 'meet', v_today, v_pts);
      v_res := jsonb_build_object('until', v_now + interval '3 minutes');
    END IF;

  ELSIF p_kind = 'buy' THEN
    RAISE EXCEPTION 'USE_FUND';   -- 상점은 pet_fund(나눠 보태기)로만

  ELSE
    RAISE EXCEPTION 'BAD_KIND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'points', v_pts) || v_res;
END $$;

CREATE OR REPLACE FUNCTION public.pet_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  v_hour int := extract(hour FROM (pet_now() AT TIME ZONE 'Asia/Seoul'))::int;
  v_from date;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('pet', NULL, 'now', v_now); END IF;
  PERFORM pet_check_runaway(p.id);
  SELECT * INTO p FROM pets WHERE id = p.id;
  v_work := pet_is_workday(v_today);
  v_from := GREATEST(p.born_on, COALESCE(p.returned_on, p.born_on), DATE '2026-11-26');

  FOREACH s IN ARRAY ARRAY['b', 'l', 'd'] LOOP
    v_key := v_today::text || ':' || s;
    IF v_work THEN
      v_open := pet_slot_open(v_today, s);
      v_close := pet_slot_close(v_today, s);
    END IF;
    SELECT min(created_at) INTO v_first FROM pet_actions WHERE pet_id = p.id AND kind = 'meal' AND slot = v_key;
    -- 밥 시간은 고정(아침 9~11 · 점심 14~16 · 저녁 18~20)
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
        WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind IN ('snack', 'play', 'pat', 'walk', 'train', 'search', 'toy', 'wake', 'meet')
        GROUP BY kind) x), '{}'::jsonb)
      || jsonb_build_object('walk_success', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'walk' AND result = 'success')),
    'unlock', v_unlock,
    'coins', pet_coins(v_me),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('item', item, 'member_id', member_id) ORDER BY created_at) FROM pet_items WHERE pet_id = p.id), '[]'::jsonb),
    'funds', COALESCE((SELECT jsonb_agg(jsonb_build_object('item', item, 'member_id', member_id, 'amount', amt) ORDER BY item, amt DESC)
        FROM (SELECT item, member_id, sum(amount)::int AS amt FROM pet_item_funds WHERE pet_id = p.id GROUP BY item, member_id) f), '[]'::jsonb),
    'affection', COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'points', pts) ORDER BY pts DESC)
        FROM (SELECT member_id, sum(points) AS pts FROM pet_actions WHERE pet_id = p.id GROUP BY member_id) t), '[]'::jsonb),
    'team_total', COALESCE((SELECT sum(GREATEST(points, 0)) FROM pet_actions WHERE pet_id = p.id), 0),
    'today_total', COALESCE((SELECT sum(GREATEST(points, 0)) FROM pet_actions WHERE pet_id = p.id AND day = v_today), 0),
    -- 자는 중인지(서버 기준) · 깨운 뒤 깨어 있는 시각 · 깨운 횟수(사람별 누적) · 지금 호떡 만나는 중인 사람들(2분)
    'asleep', (NOT v_work OR v_hour < 9 OR v_hour >= 20) AND (p.awake_until IS NULL OR p.awake_until <= v_now),
    'awake_until', CASE WHEN p.awake_until > v_now THEN p.awake_until END,
    'wakes', COALESCE((SELECT jsonb_object_agg(member_id, n) FROM (SELECT member_id, count(*) AS n FROM pet_actions WHERE pet_id = p.id AND kind = 'wake' GROUP BY member_id) w), '{}'::jsonb),
    'meeting', COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'until', created_at + interval '3 minutes')) FROM pet_actions
        WHERE pet_id = p.id AND kind = 'meet' AND day = v_today AND created_at + interval '3 minutes' > v_now), '[]'::jsonb),
    'meet_used', EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND member_id = v_me AND day = v_today AND kind = 'meet'),
    'train_total', (SELECT count(*) FROM pet_actions WHERE pet_id = p.id AND kind = 'train'),
    'search_total', CASE WHEN p.status = 'runaway' THEN pet_search_total(p.id, p.runaway_at) ELSE 0 END,
    'search_goal', pet_search_goal(),
    'runaway_by', p.runaway_by,
    'apologized', p.status = 'runaway' AND EXISTS (SELECT 1 FROM pet_actions WHERE pet_id = p.id AND kind = 'apology' AND created_at >= p.runaway_at),
    'awake_by', CASE WHEN p.awake_until > v_now THEN p.awake_by END,
    -- 최근 7일 애정도(최애·서운 판정용) · 오늘 쉬는 사람(일정의 휴가·반차·외근 → 빠지는 끼니) · 사람별 연속으로 못 준 끼니
    'affection_recent', COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'points', pts) ORDER BY pts DESC)
        FROM (SELECT member_id, sum(points) AS pts FROM pet_actions WHERE pet_id = p.id AND day > v_today - 7 GROUP BY member_id) t), '[]'::jsonb),
    'away_today', COALESCE((SELECT jsonb_object_agg(m.id, to_jsonb(pet_away_slots(m.id, v_today))) FROM members m
        WHERE m.left_at IS NULL AND m.auth_user_id IS NOT NULL AND cardinality(pet_away_slots(m.id, v_today)) > 0), '{}'::jsonb),
    'miss_streak', CASE WHEN v_from > v_today THEN '{}'::jsonb ELSE COALESCE((SELECT jsonb_object_agg(m.id, pet_miss_streak(p.id, m.id, v_from, v_now)) FROM members m
        WHERE m.left_at IS NULL AND m.auth_user_id IS NOT NULL), '{}'::jsonb) END,
    'searchers', CASE WHEN p.status = 'runaway' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'n', n) ORDER BY n DESC)
        FROM (SELECT member_id, count(*) AS n FROM pet_actions WHERE pet_id = p.id AND kind = 'search' AND created_at >= p.runaway_at GROUP BY member_id) t), '[]'::jsonb) ELSE '[]'::jsonb END,
    'recent', COALESCE((SELECT jsonb_agg(r ORDER BY (r->>'created_at') DESC) FROM (
        SELECT jsonb_build_object('member_id', member_id, 'kind', kind, 'result', result, 'points', points, 'created_at', created_at) AS r
        FROM pet_actions WHERE pet_id = p.id AND kind NOT IN ('meal_bonus', 'search') ORDER BY created_at DESC LIMIT 8) t), '[]'::jsonb)
  );
END $$;
