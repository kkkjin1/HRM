-- 2026-11-10 Race car types: sedan / suv / coupe join sport / super as buyable bodies (lib/raceCars.ts — each type drives differently).
-- Prices: sedan 20, suv 25, coupe 25 (sport 30, super 60 unchanged; super still needs sport).
-- Generated from the live function definitions (add_race_garage.sql + add_race_gifts.sql) with the body list widened.
-- Safe to re-run.

ALTER TABLE race_gifts DROP CONSTRAINT IF EXISTS race_gifts_part_check;
ALTER TABLE race_gifts ADD CONSTRAINT race_gifts_part_check
  CHECK (part IN ('flag', 'wheels', 'exhaust', 'wing', 'sedan', 'suv', 'coupe', 'sport', 'super'));

CREATE OR REPLACE FUNCTION public.race_part_price(p_part text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_part
    WHEN 'flag' THEN 10
    WHEN 'wheels' THEN 15
    WHEN 'exhaust' THEN 20
    WHEN 'wing' THEN 25
    WHEN 'sedan' THEN 20
    WHEN 'suv' THEN 25
    WHEN 'coupe' THEN 25
    WHEN 'sport' THEN 30
    WHEN 'super' THEN 60
    ELSE 0 END
$function$;

CREATE OR REPLACE FUNCTION public.race_buy(p_member uuid, p_part text)
 RETURNS race_garage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    equipped = CASE WHEN p_part IN ('sedan', 'suv', 'coupe', 'sport', 'super') THEN (equipped - 'bodyTeam') || jsonb_build_object('body', p_part)
                    ELSE equipped || jsonb_build_object(p_part, 'own') END,
    updated_at = now()
  WHERE member_id = p_member
  RETURNING * INTO g;
  RETURN g;
END
$function$;

CREATE OR REPLACE FUNCTION public.race_set(p_member uuid, p_team text, p_equipped jsonb)
 RETURNS race_garage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF body IN ('sedan', 'suv', 'coupe', 'sport', 'super') AND race_has(p_member, body, bt) THEN
      eq := eq || jsonb_build_object('body', body) || CASE WHEN bt IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('bodyTeam', bt) END;
    END IF;
  END IF;
  UPDATE race_garage SET team = COALESCE(p_team, team), equipped = eq, updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_race_gift(p_admin uuid, p_member uuid, p_part text, p_team text, p_days integer, p_message text)
 RETURNS race_gifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF r.part IN ('sedan', 'suv', 'coupe', 'sport', 'super') THEN
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
$function$;
