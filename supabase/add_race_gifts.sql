-- 2026-11-03 Race gifts: admin (ji.kim@egnis.kr) gives car parts by part x team, permanent or 1-day (until KST midnight).
-- Run once in Supabase SQL Editor, after add_race_garage.sql.
-- team NULL = generic part (drawn in the recipient's favorite team). team set = that team's version of the part.
-- equipped jsonb slot values: true or 'own' = generic part / team key (e.g. 'kia') = gifted team version.
-- body: 'sport' | 'super' (+ optional bodyTeam = gifted team version of the body).
-- Replaces race_buy and race_set (adds gift-aware ownership checks).

CREATE TABLE IF NOT EXISTS race_gifts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  part       text NOT NULL CHECK (part IN ('flag', 'wheels', 'exhaust', 'wing', 'sport', 'super')),
  team       text CHECK (team IS NULL OR team IN ('lg', 'doosan', 'kia', 'samsung', 'ssg', 'lotte', 'hanwha', 'nc', 'kt', 'kiwoom')),
  expires_at timestamptz,
  given_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  message    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_gifts_member_idx ON race_gifts (member_id);

ALTER TABLE race_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON race_gifts;
CREATE POLICY "read_all" ON race_gifts FOR SELECT TO authenticated USING (true);
GRANT SELECT ON race_gifts TO authenticated;
GRANT ALL ON race_gifts TO service_role;

-- does the member have this part? p_team NULL = generic (bought, or generic gift), else that team's gifted version.
CREATE OR REPLACE FUNCTION race_has(p_member uuid, p_part text, p_team text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_team IS NULL THEN
      EXISTS (SELECT 1 FROM race_garage WHERE member_id = p_member AND p_part = ANY (owned))
      OR EXISTS (SELECT 1 FROM race_gifts WHERE member_id = p_member AND part = p_part AND team IS NULL AND (expires_at IS NULL OR expires_at > now()))
    ELSE
      EXISTS (SELECT 1 FROM race_gifts WHERE member_id = p_member AND part = p_part AND team = p_team AND (expires_at IS NULL OR expires_at > now()))
    END
$$;

-- admin gift. p_days: 0 = permanent, 1 = today only (until KST midnight). gifted part is equipped right away.
CREATE OR REPLACE FUNCTION admin_race_gift(p_admin uuid, p_member uuid, p_part text, p_team text, p_days int, p_message text)
RETURNS race_gifts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r race_gifts;
  slot_val jsonb;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  INSERT INTO race_gifts (member_id, part, team, expires_at, given_by, message)
  VALUES (p_member, p_part, NULLIF(p_team, ''),
          CASE WHEN COALESCE(p_days, 0) <= 0 THEN NULL
               ELSE (((now() AT TIME ZONE 'Asia/Seoul')::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul') END,
          p_admin, NULLIF(btrim(COALESCE(p_message, '')), ''))
  RETURNING * INTO r;
  INSERT INTO race_garage (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  IF r.part IN ('sport', 'super') THEN
    UPDATE race_garage SET equipped = (equipped - 'bodyTeam') || jsonb_build_object('body', r.part)
        || CASE WHEN r.team IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('bodyTeam', r.team) END,
      updated_at = now()
    WHERE member_id = p_member;
  ELSE
    slot_val := CASE WHEN r.team IS NULL THEN to_jsonb('own'::text) ELSE to_jsonb(r.team) END;
    UPDATE race_garage SET equipped = equipped || jsonb_build_object(r.part, slot_val), updated_at = now()
    WHERE member_id = p_member;
  END IF;
  RETURN r;
END
$$;

-- buy (generic part). already owned = bought, or permanent generic gift.
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
  IF p_part = ANY (g.owned)
     OR EXISTS (SELECT 1 FROM race_gifts WHERE member_id = p_member AND part = p_part AND team IS NULL AND expires_at IS NULL) THEN
    RAISE EXCEPTION 'ALREADY_OWNED';
  END IF;
  IF p_part = 'super' AND NOT race_has(p_member, 'sport', NULL) THEN RAISE EXCEPTION 'NEED_SPORT'; END IF;
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    owned = array_append(owned, p_part),
    equipped = CASE WHEN p_part IN ('sport', 'super') THEN (equipped - 'bodyTeam') || jsonb_build_object('body', p_part)
                    ELSE equipped || jsonb_build_object(p_part, 'own') END,
    updated_at = now()
  WHERE member_id = p_member
  RETURNING * INTO g;
  RETURN g;
END
$$;

-- pick favorite team and/or equip. parts the member does not have are dropped.
CREATE OR REPLACE FUNCTION race_set(p_member uuid, p_team text, p_equipped jsonb)
RETURNS race_garage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g race_garage;
  eq jsonb := '{}'::jsonb;
  k text;
  v text;
  body text;
  bt text;
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
      v := p_equipped ->> k;
      IF v IN ('true', 'own') THEN
        IF race_has(p_member, k, NULL) THEN eq := eq || jsonb_build_object(k, 'own'); END IF;
      ELSIF v IS NOT NULL AND v <> 'false' THEN
        IF race_has(p_member, k, v) THEN eq := eq || jsonb_build_object(k, v); END IF;
      END IF;
    END LOOP;
    body := p_equipped ->> 'body';
    bt := NULLIF(p_equipped ->> 'bodyTeam', '');
    IF body IN ('sport', 'super') AND race_has(p_member, body, bt) THEN
      eq := eq || jsonb_build_object('body', body) || CASE WHEN bt IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('bodyTeam', bt) END;
    END IF;
  END IF;
  UPDATE race_garage SET team = COALESCE(p_team, team), equipped = eq, updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION race_has(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_race_gift(uuid, uuid, text, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_has(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_race_gift(uuid, uuid, text, text, int, text) TO authenticated;
