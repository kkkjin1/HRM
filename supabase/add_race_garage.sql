-- 2026-11-03 Race garage (playground racing car customizing). Run once in Supabase SQL Editor.
-- race_garage: favorite KBO team + coins + owned parts + equipped parts (one row per member).
-- race_rewards: coins earned per race (member, race id) - prevents double reward, daily caps.
-- Writes only through security definer functions below (no write policy for authenticated).
-- Numbers (prices, rewards, caps) must match src/lib/raceGarage.ts.

CREATE TABLE IF NOT EXISTS race_garage (
  member_id  uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  team       text,
  coins      int NOT NULL DEFAULT 0 CHECK (coins >= 0),
  owned      text[] NOT NULL DEFAULT '{}',
  equipped   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_rewards (
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rid        text NOT NULL,
  day        date NOT NULL,
  rank       int NOT NULL,
  humans     int NOT NULL,
  coins      int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, rid)
);
CREATE INDEX IF NOT EXISTS race_rewards_day_idx ON race_rewards (member_id, day);

ALTER TABLE race_garage ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON race_garage;
DROP POLICY IF EXISTS "read_all" ON race_rewards;
CREATE POLICY "read_all" ON race_garage FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON race_rewards FOR SELECT TO authenticated USING (true);
GRANT SELECT ON race_garage, race_rewards TO authenticated;
GRANT ALL ON race_garage, race_rewards TO service_role;

-- part prices (0 = not for sale)
CREATE OR REPLACE FUNCTION race_part_price(p_part text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_part
    WHEN 'flag' THEN 10
    WHEN 'wheels' THEN 15
    WHEN 'exhaust' THEN 20
    WHEN 'wing' THEN 25
    WHEN 'sport' THEN 30
    WHEN 'super' THEN 60
    ELSE 0 END
$$;

-- reward after a race. humans >= 2: 1st 5 / 2nd 3 / 3rd 2 / other finishers 1. solo (humans = 1): 1.
-- rank = 0 means not finished (timeout) -> 0 coins. daily cap 30, solo daily cap 5 (KST day).
CREATE OR REPLACE FUNCTION race_reward(p_member uuid, p_rid text, p_rank int, p_humans int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  want int;
  got_today int;
  got_solo int;
  give int;
BEGIN
  IF p_rank <= 0 THEN want := 0;
  ELSIF p_humans <= 1 THEN want := 1;
  ELSIF p_rank = 1 THEN want := 5;
  ELSIF p_rank = 2 THEN want := 3;
  ELSIF p_rank = 3 THEN want := 2;
  ELSE want := 1;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  IF EXISTS (SELECT 1 FROM race_rewards WHERE member_id = p_member AND rid = p_rid) THEN RETURN 0; END IF;
  SELECT COALESCE(sum(coins), 0) INTO got_today FROM race_rewards WHERE member_id = p_member AND day = today;
  SELECT COALESCE(sum(coins), 0) INTO got_solo FROM race_rewards WHERE member_id = p_member AND day = today AND humans <= 1;
  give := LEAST(want, GREATEST(0, 30 - got_today));
  IF p_humans <= 1 THEN give := LEAST(give, GREATEST(0, 5 - got_solo)); END IF;
  INSERT INTO race_rewards (member_id, rid, day, rank, humans, coins) VALUES (p_member, p_rid, today, p_rank, p_humans, give);
  INSERT INTO race_garage (member_id, coins) VALUES (p_member, give)
  ON CONFLICT (member_id) DO UPDATE SET coins = race_garage.coins + give, updated_at = now();
  RETURN give;
END
$$;

-- buy a part (super needs sport first). bought part is equipped right away.
CREATE OR REPLACE FUNCTION race_buy(p_member uuid, p_part text)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  price int := race_part_price(p_part);
  g race_garage;
BEGIN
  IF price <= 0 THEN RAISE EXCEPTION 'UNKNOWN_PART %', p_part; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('race_coins:' || p_member::text));
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF p_part = ANY (g.owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  IF p_part = 'super' AND NOT ('sport' = ANY (g.owned)) THEN RAISE EXCEPTION 'NEED_SPORT'; END IF;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    owned = array_append(owned, p_part),
    equipped = CASE WHEN p_part IN ('sport', 'super') THEN equipped || jsonb_build_object('body', p_part)
                    ELSE equipped || jsonb_build_object(p_part, true) END,
    updated_at = now()
  WHERE member_id = p_member
  RETURNING * INTO g;
  RETURN g;
END
$$;

-- pick favorite team (free, any time) and/or equip owned parts.
-- p_equipped keys: flag/wheels/exhaust/wing (boolean), body ('kart' | 'sport' | 'super'). unowned parts are ignored.
CREATE OR REPLACE FUNCTION race_set(p_member uuid, p_team text, p_equipped jsonb)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
  eq jsonb := '{}'::jsonb;
  k text;
  body text;
BEGIN
  IF p_team IS NOT NULL AND p_team NOT IN ('lg', 'doosan', 'kia', 'samsung', 'ssg', 'lotte', 'hanwha', 'nc', 'kt', 'kiwoom') THEN
    RAISE EXCEPTION 'UNKNOWN_TEAM %', p_team;
  END IF;
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member FOR UPDATE;
  IF p_equipped IS NULL THEN
    eq := g.equipped;
  ELSE
    FOREACH k IN ARRAY ARRAY['flag', 'wheels', 'exhaust', 'wing'] LOOP
      IF (p_equipped ->> k) = 'true' AND k = ANY (g.owned) THEN eq := eq || jsonb_build_object(k, true); END IF;
    END LOOP;
    body := p_equipped ->> 'body';
    IF body IN ('sport', 'super') AND body = ANY (g.owned) THEN eq := eq || jsonb_build_object('body', body); END IF;
  END IF;
  UPDATE race_garage SET team = COALESCE(p_team, team), equipped = eq, updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION race_reward(uuid, text, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_buy(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_set(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_reward(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION race_buy(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION race_set(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION race_part_price(text) TO authenticated;
