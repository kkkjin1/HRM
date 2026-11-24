-- 2026-11-24 운전석 실내 개편(src/lib/raceInterior.ts) — 구단은 선호 구단 로고 하나, 차마다 실내 3종 + 공통 소품.
--   item key: 'trim:<차>:<0|1|2>'(0 = 무료) · '<소품>:<종류>'(charm/doll/hands)
--   interior = { trims: {차: 번호}, charm, doll, hands } · interior_owned = 가진 key · interior_gifts = 새로 받은 key
-- 개편 전 실내 아이템을 산 사람은 0명(2026-11-24 조회) → 저장값만 비운다. 예전 함수(race_interior_*)는 지운다.
-- 가격·종류는 raceInterior.ts와 같게(raceInterior.test.ts가 이 파일을 읽어 확인).

BEGIN;

UPDATE race_garage SET interior = '{}'::jsonb, interior_owned = '{}', interior_gifts = '{}'
WHERE interior <> '{}'::jsonb OR interior_owned <> '{}' OR interior_gifts <> '{}';

DROP FUNCTION IF EXISTS race_interior_buy(uuid, text, text, text);
DROP FUNCTION IF EXISTS race_interior_draw(uuid);
DROP FUNCTION IF EXISTS race_interior_set(uuid, jsonb);
DROP FUNCTION IF EXISTS admin_race_interior_gift(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS race_interior_kind(text, text);
DROP FUNCTION IF EXISTS race_interior_price(text, text);
DROP FUNCTION IF EXISTS race_interior_team_ok(text);

CREATE OR REPLACE FUNCTION race_interior2_kind(p_key text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_key ~ '^trim:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):0$' THEN 'free'
    WHEN p_key ~ '^trim:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):[12]$' THEN 'shop'
    WHEN p_key IN ('charm:none', 'doll:none', 'hands:glove') THEN 'free'
    WHEN p_key IN ('charm:pennant', 'charm:ball', 'doll:dog', 'hands:mitten') THEN 'shop'
    WHEN p_key IN ('charm:star', 'doll:penguin', 'doll:duck', 'hands:mitt') THEN 'random'
    ELSE NULL END
$$;

-- 실내 3종 2번 = 등급 값, 3번 = 등급 값 × 1.8(반올림)
CREATE OR REPLACE FUNCTION race_interior2_price(p_key text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'trim:kart:1' THEN 3 WHEN 'trim:kart:2' THEN 5
    WHEN 'trim:mini:1' THEN 4 WHEN 'trim:mini:2' THEN 7
    WHEN 'trim:compact:1' THEN 6 WHEN 'trim:compact:2' THEN 11
    WHEN 'trim:sedan:1' THEN 8 WHEN 'trim:sedan:2' THEN 14
    WHEN 'trim:suv:1' THEN 10 WHEN 'trim:suv:2' THEN 18
    WHEN 'trim:grand:1' THEN 12 WHEN 'trim:grand:2' THEN 22
    WHEN 'trim:coupe:1' THEN 15 WHEN 'trim:coupe:2' THEN 27
    WHEN 'trim:lux:1' THEN 18 WHEN 'trim:lux:2' THEN 32
    WHEN 'trim:sport:1' THEN 22 WHEN 'trim:sport:2' THEN 40
    WHEN 'trim:super:1' THEN 28 WHEN 'trim:super:2' THEN 50
    WHEN 'charm:pennant' THEN 5 WHEN 'charm:ball' THEN 5
    WHEN 'doll:dog' THEN 10
    WHEN 'hands:mitten' THEN 5
    ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION race_interior2_buy(p_member uuid, p_key text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := race_interior2_price(p_key);
  g race_garage;
  parts text[] := string_to_array(p_key, ':');
BEGIN
  IF race_interior2_kind(p_key) IS DISTINCT FROM 'shop' OR price <= 0 THEN RAISE EXCEPTION 'NOT_FOR_SALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF p_key = ANY (g.interior_owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    interior_owned = array_append(interior_owned, p_key),
    interior = CASE WHEN parts[1] = 'trim'
      THEN jsonb_set(CASE WHEN interior ? 'trims' THEN interior ELSE interior || jsonb_build_object('trims', '{}'::jsonb) END, ARRAY['trims', parts[2]], to_jsonb(parts[3]::int))
      ELSE interior || jsonb_build_object(parts[1], parts[2]) END,
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- 소품 뽑기: 아직 없는 상점·뽑기 소품 중 하나(같은 확률). returns {garage, got}
CREATE OR REPLACE FUNCTION race_interior2_draw(p_member uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := 10;
  g race_garage;
  k text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  SELECT c INTO k FROM (VALUES ('charm:pennant'), ('charm:ball'), ('charm:star'), ('doll:dog'), ('doll:penguin'), ('doll:duck'), ('hands:mitten'), ('hands:mitt')) AS pool(c)
  WHERE NOT (c = ANY (g.interior_owned)) ORDER BY random() LIMIT 1;
  IF k IS NULL THEN RAISE EXCEPTION 'ALL_OWNED'; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    interior_owned = array_append(interior_owned, k),
    interior_gifts = array_append(interior_gifts, k),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN jsonb_build_object('garage', to_jsonb(g), 'got', k);
END
$$;

-- 장착: 가진 것(무료 포함)만 남긴다. 장착한 key는 interior_gifts에서 빠진다
CREATE OR REPLACE FUNCTION race_interior2_set(p_member uuid, p_interior jsonb)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
  trims jsonb := '{}'::jsonb;
  eq jsonb;
  b text;
  s text;
  v text;
  k text;
  seen text[] := '{}';
BEGIN
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  FOREACH b IN ARRAY ARRAY['kart', 'mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super'] LOOP
    v := p_interior -> 'trims' ->> b;
    IF v IS NULL OR v NOT IN ('0', '1', '2') THEN CONTINUE; END IF;
    k := 'trim:' || b || ':' || v;
    IF v = '0' OR k = ANY (g.interior_owned) THEN trims := trims || jsonb_build_object(b, v::int); seen := array_append(seen, k); END IF;
  END LOOP;
  eq := jsonb_build_object('trims', trims);
  FOREACH s IN ARRAY ARRAY['charm', 'doll', 'hands'] LOOP
    v := p_interior ->> s;
    IF v IS NULL THEN CONTINUE; END IF;
    k := s || ':' || v;
    IF race_interior2_kind(k) = 'free' OR k = ANY (g.interior_owned) THEN eq := eq || jsonb_build_object(s, v); seen := array_append(seen, k); END IF;
  END LOOP;
  UPDATE race_garage SET
    interior = eq,
    interior_gifts = ARRAY(SELECT x FROM unnest(interior_gifts) x WHERE NOT (x = ANY (seen))),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- 관리자 선물(무료 빼고 아무 key)
CREATE OR REPLACE FUNCTION admin_race_interior2_gift(p_admin uuid, p_member uuid, p_key text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  IF race_interior2_kind(p_key) IS NULL OR race_interior2_kind(p_key) = 'free' THEN RAISE EXCEPTION 'UNKNOWN_ITEM %', p_key; END IF;
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF p_key = ANY (g.interior_owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  UPDATE race_garage SET
    interior_owned = array_append(interior_owned, p_key),
    interior_gifts = array_append(interior_gifts, p_key),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION race_interior2_buy(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_interior2_draw(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_interior2_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_race_interior2_gift(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_interior2_buy(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION race_interior2_draw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION race_interior2_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_race_interior2_gift(uuid, uuid, text) TO authenticated;

COMMIT;
