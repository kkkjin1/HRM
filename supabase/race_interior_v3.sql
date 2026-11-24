-- 2026-11-25 실내 v3 — 값 전체 인하 + 소품도 차마다 따로(차를 바꾸면 처음부터) + 그 차에서 산 것 하나당 뒷유리 +1단계(클라이언트)
--   key: 실내 'trim:차:1|2' · 소품 'prop:차:소품:종류' / interior = { trims: {차: 0|1|2}, props: {차: {charm, doll, hands}} }
--   값은 lib/raceInterior.ts(P1·PROP_ADD·DRAW)와 같게 — raceInterior.test.ts가 맞는지 본다
--   적용 시점에 실내를 산 사람 0명 → 옮기거나 돌려줄 것 없음. 예전 모양(charm·doll·hands가 맨 위) 장착은 비운다.

BEGIN;

UPDATE race_garage SET interior = '{}'::jsonb, interior_gifts = '{}' WHERE interior ? 'charm' OR interior ? 'doll' OR interior ? 'hands';

CREATE OR REPLACE FUNCTION race_interior2_kind(p_key text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_key ~ '^trim:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):0$' THEN 'free'
    WHEN p_key ~ '^trim:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):[12]$' THEN 'shop'
    WHEN p_key ~ '^prop:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):(charm:none|doll:none|hands:glove)$' THEN 'free'
    WHEN p_key ~ '^prop:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):(charm:pennant|charm:ball|doll:dog|hands:mitten)$' THEN 'shop'
    WHEN p_key ~ '^prop:(kart|mini|compact|sedan|suv|grand|coupe|lux|sport|super):(charm:star|doll:penguin|doll:duck|hands:mitt)$' THEN 'random'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION race_interior2_price(p_key text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'trim:kart:1' THEN 2 WHEN 'trim:kart:2' THEN 3
    WHEN 'prop:kart:charm:pennant' THEN 2 WHEN 'prop:kart:charm:ball' THEN 2 WHEN 'prop:kart:doll:dog' THEN 4 WHEN 'prop:kart:hands:mitten' THEN 2
    WHEN 'trim:mini:1' THEN 2 WHEN 'trim:mini:2' THEN 3
    WHEN 'prop:mini:charm:pennant' THEN 2 WHEN 'prop:mini:charm:ball' THEN 2 WHEN 'prop:mini:doll:dog' THEN 4 WHEN 'prop:mini:hands:mitten' THEN 2
    WHEN 'trim:compact:1' THEN 3 WHEN 'trim:compact:2' THEN 5
    WHEN 'prop:compact:charm:pennant' THEN 2 WHEN 'prop:compact:charm:ball' THEN 2 WHEN 'prop:compact:doll:dog' THEN 4 WHEN 'prop:compact:hands:mitten' THEN 2
    WHEN 'trim:sedan:1' THEN 3 WHEN 'trim:sedan:2' THEN 5
    WHEN 'prop:sedan:charm:pennant' THEN 3 WHEN 'prop:sedan:charm:ball' THEN 3 WHEN 'prop:sedan:doll:dog' THEN 5 WHEN 'prop:sedan:hands:mitten' THEN 3
    WHEN 'trim:suv:1' THEN 4 WHEN 'trim:suv:2' THEN 6
    WHEN 'prop:suv:charm:pennant' THEN 3 WHEN 'prop:suv:charm:ball' THEN 3 WHEN 'prop:suv:doll:dog' THEN 5 WHEN 'prop:suv:hands:mitten' THEN 3
    WHEN 'trim:grand:1' THEN 5 WHEN 'trim:grand:2' THEN 8
    WHEN 'prop:grand:charm:pennant' THEN 3 WHEN 'prop:grand:charm:ball' THEN 3 WHEN 'prop:grand:doll:dog' THEN 5 WHEN 'prop:grand:hands:mitten' THEN 3
    WHEN 'trim:coupe:1' THEN 6 WHEN 'trim:coupe:2' THEN 10
    WHEN 'prop:coupe:charm:pennant' THEN 4 WHEN 'prop:coupe:charm:ball' THEN 4 WHEN 'prop:coupe:doll:dog' THEN 6 WHEN 'prop:coupe:hands:mitten' THEN 4
    WHEN 'trim:lux:1' THEN 7 WHEN 'trim:lux:2' THEN 11
    WHEN 'prop:lux:charm:pennant' THEN 4 WHEN 'prop:lux:charm:ball' THEN 4 WHEN 'prop:lux:doll:dog' THEN 6 WHEN 'prop:lux:hands:mitten' THEN 4
    WHEN 'trim:sport:1' THEN 8 WHEN 'trim:sport:2' THEN 13
    WHEN 'prop:sport:charm:pennant' THEN 5 WHEN 'prop:sport:charm:ball' THEN 5 WHEN 'prop:sport:doll:dog' THEN 7 WHEN 'prop:sport:hands:mitten' THEN 5
    WHEN 'trim:super:1' THEN 10 WHEN 'trim:super:2' THEN 16
    WHEN 'prop:super:charm:pennant' THEN 5 WHEN 'prop:super:charm:ball' THEN 5 WHEN 'prop:super:doll:dog' THEN 7 WHEN 'prop:super:hands:mitten' THEN 5
    ELSE 0 END
$$;

-- 장착 상태에 key 하나 끼우기(실내 = trims, 소품 = props.차)
CREATE OR REPLACE FUNCTION race_interior_put(p_int jsonb, p_key text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  i jsonb := COALESCE(p_int, '{}'::jsonb);
  x text[] := string_to_array(p_key, ':');
BEGIN
  IF x[1] = 'trim' THEN
    RETURN i || jsonb_build_object('trims', COALESCE(i -> 'trims', '{}'::jsonb) || jsonb_build_object(x[2], x[3]::int));
  ELSIF x[1] = 'prop' THEN
    RETURN i || jsonb_build_object('props', COALESCE(i -> 'props', '{}'::jsonb) || jsonb_build_object(x[2], COALESCE(i -> 'props' -> x[2], '{}'::jsonb) || jsonb_build_object(x[3], x[4])));
  END IF;
  RETURN i;
END
$$;

-- 사기(바로 장착)
CREATE OR REPLACE FUNCTION race_interior2_buy(p_member uuid, p_key text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := race_interior2_price(p_key);
  g race_garage;
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
    interior = race_interior_put(interior, p_key),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- 소품 뽑기(차마다): 그 차에 아직 없는 상점·뽑기 소품 중 하나. returns {garage, got}
DROP FUNCTION IF EXISTS race_interior2_draw(uuid);
CREATE OR REPLACE FUNCTION race_interior2_draw(p_member uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := CASE p_body WHEN 'kart' THEN 3 WHEN 'mini' THEN 3 WHEN 'compact' THEN 3 WHEN 'sedan' THEN 4 WHEN 'suv' THEN 4 WHEN 'grand' THEN 4 WHEN 'coupe' THEN 5 WHEN 'lux' THEN 5 WHEN 'sport' THEN 6 WHEN 'super' THEN 6 ELSE 0 END;
  g race_garage;
  k text;
BEGIN
  IF price <= 0 THEN RAISE EXCEPTION 'UNKNOWN_BODY %', p_body; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  SELECT 'prop:' || p_body || ':' || c INTO k FROM (VALUES ('charm:pennant'), ('charm:ball'), ('doll:dog'), ('hands:mitten'), ('charm:star'), ('doll:penguin'), ('doll:duck'), ('hands:mitt')) AS pool(c)
  WHERE NOT (('prop:' || p_body || ':' || c) = ANY (g.interior_owned)) ORDER BY random() LIMIT 1;
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

-- 장착: 가진 것(무료 포함) + 1일권으로 빌린 것만 남긴다. 장착한 key는 interior_gifts에서 빠진다
CREATE OR REPLACE FUNCTION race_interior2_set(p_member uuid, p_interior jsonb)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
  trims jsonb := '{}'::jsonb;
  props jsonb := '{}'::jsonb;
  one jsonb;
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
    IF v IN ('0', '1', '2') THEN
      k := 'trim:' || b || ':' || v;
      IF v = '0' OR k = ANY (g.interior_owned) OR race_interior_rented(p_member, k) THEN trims := trims || jsonb_build_object(b, v::int); seen := array_append(seen, k); END IF;
    END IF;
    one := '{}'::jsonb;
    FOREACH s IN ARRAY ARRAY['charm', 'doll', 'hands'] LOOP
      v := p_interior -> 'props' -> b ->> s;
      IF v IS NULL THEN CONTINUE; END IF;
      k := 'prop:' || b || ':' || s || ':' || v;
      IF race_interior2_kind(k) = 'free' OR k = ANY (g.interior_owned) OR race_interior_rented(p_member, k) THEN one := one || jsonb_build_object(s, v); seen := array_append(seen, k); END IF;
    END LOOP;
    IF one <> '{}'::jsonb THEN props := props || jsonb_build_object(b, one); END IF;
  END LOOP;
  UPDATE race_garage SET
    interior = jsonb_build_object('trims', trims, 'props', props),
    interior_gifts = ARRAY(SELECT x FROM unnest(interior_gifts) x WHERE NOT (x = ANY (seen))),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- 🎟 1일권 쓰기 — 실내도 새 key(prop:차:…)로 끼운다(race_tickets.sql 덮어씀)
CREATE OR REPLACE FUNCTION public.race_ticket_use(p_member uuid, p_ticket uuid, p_choice text)
 RETURNS race_garage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t race_tickets;
  g race_garage;
BEGIN
  SELECT * INTO t FROM race_tickets WHERE id = p_ticket AND member_id = p_member FOR UPDATE;
  IF NOT FOUND OR t.used_at IS NOT NULL OR t.expires_at <= now() THEN RAISE EXCEPTION 'TICKET_INVALID'; END IF;
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  IF t.kind = 'body' THEN
    IF NOT race_is_body(p_choice) THEN RAISE EXCEPTION 'BAD_CHOICE %', p_choice; END IF;
    INSERT INTO race_gifts (member_id, part, team, expires_at, given_by, message) VALUES (p_member, p_choice, NULL, t.expires_at, t.given_by, t.message);
    UPDATE race_garage SET equipped = (equipped - 'bodyTeam') || jsonb_build_object('body', p_choice), updated_at = now() WHERE member_id = p_member;
  ELSIF t.kind = 'part' THEN
    IF p_choice NOT IN ('flag', 'wheels', 'exhaust', 'wing', 'helmet', 'tail', 'neon', 'aura') THEN RAISE EXCEPTION 'BAD_CHOICE %', p_choice; END IF;
    INSERT INTO race_gifts (member_id, part, team, expires_at, given_by, message) VALUES (p_member, p_choice, NULL, t.expires_at, t.given_by, t.message);
    UPDATE race_garage SET equipped = equipped || jsonb_build_object(p_choice, 'own'), updated_at = now() WHERE member_id = p_member;
  ELSE
    IF race_interior2_kind(p_choice) IS NULL OR race_interior2_kind(p_choice) = 'free' THEN RAISE EXCEPTION 'BAD_CHOICE %', p_choice; END IF;
    UPDATE race_garage SET interior = race_interior_put(interior, p_choice), updated_at = now() WHERE member_id = p_member;
  END IF;
  UPDATE race_tickets SET used_at = now(), choice = p_choice WHERE id = t.id;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member;
  RETURN g;
END
$function$;

REVOKE ALL ON FUNCTION race_interior2_draw(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_interior2_draw(uuid, text) TO authenticated;

COMMIT;
