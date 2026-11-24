-- 2026-11-24 레이싱 차 10종 개편(lib/raceCars.ts) — 작고 투박한 차 → 고급차 순서, 가격·성능이 같이 올라간다.
--   kart 카트(무료) · mini 모닝빵 10 · compact 아방이 18 · sedan 개나타 25 · suv 싼타썰매 32 · grand 그랜절 40
--   coupe 스무디 50 · lux 벤또 65 · sport 고르쉐 85 · super 아르기닌 120  (선행 조건 없음)
-- 사용자 결정: 이미 산 차는 산 값(옛 가격: sedan 20 · suv 25 · coupe 25 · sport 30 · super 60)을 🪙로 돌려주고, 차는 빼고 모두 카트로.
--   선물 차체(race_gifts)도 지운다(돌려줄 값 없음 — 받은 선물). 돌려준 기록은 race_car_refunds에 남긴다.
-- 한 번만 돌리는 정리(1~3)와 다시 돌려도 되는 함수 교체(4~)가 섞여 있다 — 정리는 refund 기록이 있으면 건너뛴다.

BEGIN;

-- 1) 돌려준 기록
CREATE TABLE IF NOT EXISTS race_car_refunds (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  parts text[] NOT NULL,
  coins int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE race_car_refunds ENABLE ROW LEVEL SECURITY; -- 정책 없음 = 서버(관리자)만

-- 2) 산 차 환불 + 빼기 + 카트로(한 번만)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM race_car_refunds) THEN RETURN; END IF;
  INSERT INTO race_car_refunds (member_id, parts, coins)
  SELECT member_id,
         ARRAY(SELECT p FROM unnest(owned) p WHERE p IN ('sedan', 'suv', 'coupe', 'sport', 'super')),
         (SELECT COALESCE(SUM(CASE p WHEN 'sedan' THEN 20 WHEN 'suv' THEN 25 WHEN 'coupe' THEN 25 WHEN 'sport' THEN 30 WHEN 'super' THEN 60 ELSE 0 END), 0)
            FROM unnest(owned) p)
  FROM race_garage
  WHERE owned && ARRAY['sedan', 'suv', 'coupe', 'sport', 'super'];
  UPDATE race_garage g SET
    coins = g.coins + r.coins,
    owned = ARRAY(SELECT p FROM unnest(g.owned) p WHERE p NOT IN ('sedan', 'suv', 'coupe', 'sport', 'super')),
    updated_at = now()
  FROM race_car_refunds r WHERE r.member_id = g.member_id;
  UPDATE race_garage SET equipped = equipped - 'body' - 'bodyTeam', updated_at = now()
  WHERE equipped ? 'body' OR equipped ? 'bodyTeam';
  DELETE FROM race_gifts WHERE part IN ('sedan', 'suv', 'coupe', 'sport', 'super');
END $$;

-- 3) 선물 부위 목록
ALTER TABLE race_gifts DROP CONSTRAINT IF EXISTS race_gifts_part_check;
ALTER TABLE race_gifts ADD CONSTRAINT race_gifts_part_check
  CHECK (part IN ('flag', 'wheels', 'exhaust', 'wing', 'mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super'));

-- 4) 차체인지(카트 제외)
CREATE OR REPLACE FUNCTION public.race_is_body(p_part text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_part IN ('mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super')
$function$;

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
    WHEN 'mini' THEN 10
    WHEN 'compact' THEN 18
    WHEN 'sedan' THEN 25
    WHEN 'suv' THEN 32
    WHEN 'grand' THEN 40
    WHEN 'coupe' THEN 50
    WHEN 'lux' THEN 65
    WHEN 'sport' THEN 85
    WHEN 'super' THEN 120
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
  IF g.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', g.coins; END IF;
  UPDATE race_garage SET
    coins = coins - price,
    owned = array_append(owned, p_part),
    equipped = CASE WHEN race_is_body(p_part) THEN (equipped - 'bodyTeam') || jsonb_build_object('body', p_part)
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
    IF race_is_body(body) AND race_has(p_member, body, bt) THEN
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
  IF race_is_body(r.part) THEN
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

COMMIT;
