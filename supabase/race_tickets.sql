-- 2026-11-24 관리자 🎟 1일권 선물 — 받는 사람이 직접 골라서 오늘 자정(KST)까지 쓴다
--   kind 'body' = 차 한 대 / 'part' = 외관 부품 하나 / 'interior' = 실내 하나(차 실내 3종 중 2·3번 또는 소품)
--   쓰면(race_ticket_use): 차·부품 = race_gifts에 1일권 선물로 넣고 바로 장착(기존 1일권과 같은 만료) / 실내 = 이 표의 choice로 빌려 쓰고 바로 장착
--   자정이 지나면 안 쓴 표도 사라진다(expires_at). 실내 빌린 것은 race_interior2_set이 자정 전까지만 가진 것으로 본다.

BEGIN;

CREATE TABLE IF NOT EXISTS race_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('body', 'part', 'interior')),
  expires_at timestamptz NOT NULL,
  given_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  message    text,
  choice     text,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_tickets_member_idx ON race_tickets (member_id);
ALTER TABLE race_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON race_tickets;
CREATE POLICY "read_all" ON race_tickets FOR SELECT TO authenticated USING (true); -- 쓰기는 아래 함수로만

-- 실내를 1일권으로 빌려 쓰는 중인지
CREATE OR REPLACE FUNCTION public.race_interior_rented(p_member uuid, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM race_tickets WHERE member_id = p_member AND kind = 'interior' AND choice = p_key AND used_at IS NOT NULL AND expires_at > now())
$function$;

-- 관리자: 1일권 주기(오늘 자정까지)
CREATE OR REPLACE FUNCTION public.admin_race_ticket_give(p_admin uuid, p_member uuid, p_kind text, p_message text)
 RETURNS race_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r race_tickets;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  IF p_kind NOT IN ('body', 'part', 'interior') THEN RAISE EXCEPTION 'UNKNOWN_KIND %', p_kind; END IF;
  INSERT INTO race_tickets (member_id, kind, expires_at, given_by, message)
  VALUES (p_member, p_kind, (((now() AT TIME ZONE 'Asia/Seoul')::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul'),
          p_admin, NULLIF(btrim(COALESCE(p_message, '')), ''))
  RETURNING * INTO r;
  RETURN r;
END
$function$;

-- 받은 사람: 1일권 쓰기(고른 것 바로 장착)
CREATE OR REPLACE FUNCTION public.race_ticket_use(p_member uuid, p_ticket uuid, p_choice text)
 RETURNS race_garage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t race_tickets;
  g race_garage;
  parts text[] := string_to_array(p_choice, ':');
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
    UPDATE race_garage SET
      interior = CASE WHEN parts[1] = 'trim'
                      THEN jsonb_set(COALESCE(interior, '{}'::jsonb), '{trims}', COALESCE(interior -> 'trims', '{}'::jsonb) || jsonb_build_object(parts[2], parts[3]::int))
                      ELSE COALESCE(interior, '{}'::jsonb) || jsonb_build_object(parts[1], parts[2]) END,
      updated_at = now()
    WHERE member_id = p_member;
  END IF;
  UPDATE race_tickets SET used_at = now(), choice = p_choice WHERE id = t.id;
  SELECT * INTO g FROM race_garage WHERE member_id = p_member;
  RETURN g;
END
$function$;

-- 실내 장착: 가진 것 + 1일권으로 빌린 것(자정 전)
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
    IF v = '0' OR k = ANY (g.interior_owned) OR race_interior_rented(p_member, k) THEN trims := trims || jsonb_build_object(b, v::int); seen := array_append(seen, k); END IF;
  END LOOP;
  eq := jsonb_build_object('trims', trims);
  FOREACH s IN ARRAY ARRAY['charm', 'doll', 'hands'] LOOP
    v := p_interior ->> s;
    IF v IS NULL THEN CONTINUE; END IF;
    k := s || ':' || v;
    IF race_interior2_kind(k) = 'free' OR k = ANY (g.interior_owned) OR race_interior_rented(p_member, k) THEN eq := eq || jsonb_build_object(s, v); seen := array_append(seen, k); END IF;
  END LOOP;
  UPDATE race_garage SET
    interior = eq,
    interior_gifts = ARRAY(SELECT x FROM unnest(interior_gifts) x WHERE NOT (x = ANY (seen))),
    updated_at = now()
  WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION race_interior_rented(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_race_ticket_give(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION race_ticket_use(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION race_interior_rented(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_race_ticket_give(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION race_ticket_use(uuid, uuid, text) TO authenticated;

COMMIT;
