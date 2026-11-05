-- 2026-11-05 Race cockpit interior (driver view customizing). Run once in Supabase SQL Editor (after add_race_garage.sql, add_race_gifts.sql).
-- item = (slot, variant, team). team 'base' = no team. free variants are owned for every team.
-- interior        : equipped picks {slot: {v, team}}
-- interior_owned  : owned item keys 'slot:variant:team'
-- interior_gifts  : newly received keys (draw / admin gift) not equipped yet
-- Catalog, prices and draw price must match src/lib/raceInterior.ts (raceInterior.test.ts checks this file).

ALTER TABLE race_garage ADD COLUMN IF NOT EXISTS interior jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE race_garage ADD COLUMN IF NOT EXISTS interior_owned text[] NOT NULL DEFAULT '{}';
ALTER TABLE race_garage ADD COLUMN IF NOT EXISTS interior_gifts text[] NOT NULL DEFAULT '{}';

-- kind of a variant: free / shop / random (NULL = unknown)
CREATE OR REPLACE FUNCTION race_interior_kind(p_slot text, p_v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_slot || ':' || p_v
    WHEN 'wheel:toy' THEN 'free' WHEN 'wheel:race' THEN 'shop' WHEN 'wheel:bus' THEN 'random'
    WHEN 'dash:smooth' THEN 'free' WHEN 'dash:stitch' THEN 'shop' WHEN 'dash:carbon' THEN 'random' WHEN 'dash:wood' THEN 'shop'
    WHEN 'screen:basic' THEN 'free' WHEN 'screen:led' THEN 'shop' WHEN 'screen:tv' THEN 'random' WHEN 'screen:cheer' THEN 'shop'
    WHEN 'charm:none' THEN 'free' WHEN 'charm:pennant' THEN 'shop' WHEN 'charm:ball' THEN 'shop' WHEN 'charm:star' THEN 'random'
    WHEN 'frame:basic' THEN 'free' WHEN 'frame:chrome' THEN 'shop' WHEN 'frame:stripe' THEN 'shop' WHEN 'frame:neon' THEN 'random' WHEN 'frame:gold' THEN 'random'
    WHEN 'doll:none' THEN 'free' WHEN 'doll:dog' THEN 'shop' WHEN 'doll:penguin' THEN 'random' WHEN 'doll:duck' THEN 'random'
    WHEN 'hands:glove' THEN 'free' WHEN 'hands:mitt' THEN 'random' WHEN 'hands:mitten' THEN 'shop'
    ELSE NULL END
$$;

-- shop price (0 = not for sale)
CREATE OR REPLACE FUNCTION race_interior_price(p_slot text, p_v text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_slot || ':' || p_v
    WHEN 'wheel:race' THEN 15
    WHEN 'dash:stitch' THEN 10 WHEN 'dash:wood' THEN 15
    WHEN 'screen:led' THEN 10 WHEN 'screen:cheer' THEN 10
    WHEN 'charm:pennant' THEN 5 WHEN 'charm:ball' THEN 5
    WHEN 'frame:chrome' THEN 10 WHEN 'frame:stripe' THEN 15
    WHEN 'doll:dog' THEN 10
    WHEN 'hands:mitten' THEN 5
    ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION race_interior_team_ok(p_team text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_team IN ('base', 'lg', 'doosan', 'kia', 'samsung', 'ssg', 'lotte', 'hanwha', 'nc', 'kt', 'kiwoom')
$$;

-- buy a shop item (one team version) and equip it
CREATE OR REPLACE FUNCTION race_interior_buy(p_member uuid, p_slot text, p_v text, p_team text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := race_interior_price(p_slot, p_v);
  k text := p_slot || ':' || p_v || ':' || COALESCE(p_team, 'base');
  g race_garage;
BEGIN
  IF race_interior_kind(p_slot, p_v) IS DISTINCT FROM 'shop' OR price <= 0 THEN RAISE EXCEPTION 'NOT_FOR_SALE'; END IF;
  IF NOT race_interior_team_ok(COALESCE(p_team, 'base')) THEN RAISE EXCEPTION 'UNKNOWN_TEAM %', p_team; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF k = ANY (g.interior_owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    interior_owned = array_append(interior_owned, k),
    interior = interior || jsonb_build_object(p_slot, jsonb_build_object('v', p_v, 'team', p_team)),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- random draw: one of the shop/random combos the member does not have yet (equal chance). returns {garage, got}
CREATE OR REPLACE FUNCTION race_interior_draw(p_member uuid)
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
  SELECT c INTO k FROM (
    SELECT sv.s || ':' || sv.v || ':' || t.team AS c
    FROM (VALUES
      ('wheel','race'),('wheel','bus'),('dash','stitch'),('dash','carbon'),('dash','wood'),
      ('screen','led'),('screen','tv'),('screen','cheer'),('charm','pennant'),('charm','ball'),('charm','star'),
      ('frame','chrome'),('frame','stripe'),('frame','neon'),('frame','gold'),
      ('doll','dog'),('doll','penguin'),('doll','duck'),('hands','mitt'),('hands','mitten')
    ) AS sv(s, v)
    CROSS JOIN (VALUES ('base'),('lg'),('doosan'),('kia'),('samsung'),('ssg'),('lotte'),('hanwha'),('nc'),('kt'),('kiwoom')) AS t(team)
  ) pool
  WHERE NOT (c = ANY (g.interior_owned))
  ORDER BY random() LIMIT 1;
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

-- equip picks. picks the member does not own are dropped (free variants are always fine). equipped keys leave interior_gifts.
CREATE OR REPLACE FUNCTION race_interior_set(p_member uuid, p_interior jsonb)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
  eq jsonb := '{}'::jsonb;
  s text;
  v text;
  t text;
  kind text;
  seen text[] := '{}';
BEGIN
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  FOREACH s IN ARRAY ARRAY['wheel', 'dash', 'screen', 'charm', 'frame', 'doll', 'hands'] LOOP
    v := p_interior -> s ->> 'v';
    t := COALESCE(NULLIF(p_interior -> s ->> 'team', ''), 'base');
    IF v IS NULL OR NOT race_interior_team_ok(t) THEN CONTINUE; END IF;
    kind := race_interior_kind(s, v);
    IF kind IS NULL THEN CONTINUE; END IF;
    IF kind = 'free' OR (s || ':' || v || ':' || t) = ANY (g.interior_owned) THEN
      eq := eq || jsonb_build_object(s, jsonb_build_object('v', v, 'team', CASE WHEN t = 'base' THEN NULL ELSE t END));
      seen := array_append(seen, s || ':' || v || ':' || t);
    END IF;
  END LOOP;
  UPDATE race_garage SET
    interior = eq,
    interior_gifts = ARRAY(SELECT x FROM unnest(interior_gifts) x WHERE NOT (x = ANY (seen))),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

-- admin gift of one interior item (any kind except free)
CREATE OR REPLACE FUNCTION admin_race_interior_gift(p_admin uuid, p_member uuid, p_slot text, p_v text, p_team text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text := p_slot || ':' || p_v || ':' || COALESCE(p_team, 'base');
  g race_garage;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  IF race_interior_kind(p_slot, p_v) IS NULL OR race_interior_kind(p_slot, p_v) = 'free' THEN RAISE EXCEPTION 'UNKNOWN_ITEM %', k; END IF;
  IF NOT race_interior_team_ok(COALESCE(p_team, 'base')) THEN RAISE EXCEPTION 'UNKNOWN_TEAM %', p_team; END IF;
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF k = ANY (g.interior_owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  UPDATE race_garage SET
    interior_owned = array_append(interior_owned, k),
    interior_gifts = array_append(interior_gifts, k),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION race_interior_buy(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_interior_draw(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_interior_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_race_interior_gift(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_interior_buy(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION race_interior_draw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION race_interior_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_race_interior_gift(uuid, uuid, text, text, text) TO authenticated;
