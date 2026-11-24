-- 2026-11-24 레이싱 외관 부품 초기화 + 새 부품 3종(lib/raceGarage.ts RACE_PARTS와 같게)
--   사용자 결정: 산 부품(깃발 10 · 휠 15 · 배기구 20 · 리어윙 25)은 산 값을 🪙로 돌려주고 모두 뺀다.
--   선물 부품(race_gifts, 차체 제외)도 지운다(돌려줄 값 없음 — 전부 이미 끝난 1일권). 돌려준 기록은 race_part_refunds.
--   새 부품: helmet 골드 레이서 헬멧 12 · tail LED 후미등 15 · neon 무지개 네온 18 · aura 황금 오라 30
--   (처음엔 stripe 줄무늬·crown 왕관이었다가 배포 전에 helmet·aura로 바꿈 — 산 사람 없음)
-- 한 번만 돌리는 정리(1~2)와 다시 돌려도 되는 함수 교체(3~)가 섞여 있다 — 정리는 refund 기록이 있으면 건너뛴다.

BEGIN;

-- 1) 돌려준 기록
CREATE TABLE IF NOT EXISTS race_part_refunds (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  parts text[] NOT NULL,
  coins int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE race_part_refunds ENABLE ROW LEVEL SECURITY; -- 정책 없음 = 서버(관리자)만

-- 2) 산 부품 환불 + 빼기(한 번만)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM race_part_refunds) THEN RETURN; END IF;
  INSERT INTO race_part_refunds (member_id, parts, coins)
  SELECT member_id,
         ARRAY(SELECT p FROM unnest(owned) p WHERE p IN ('flag', 'wheels', 'exhaust', 'wing')),
         (SELECT COALESCE(SUM(CASE p WHEN 'flag' THEN 10 WHEN 'wheels' THEN 15 WHEN 'exhaust' THEN 20 WHEN 'wing' THEN 25 ELSE 0 END), 0)
            FROM unnest(owned) p)
  FROM race_garage
  WHERE owned && ARRAY['flag', 'wheels', 'exhaust', 'wing'];
  UPDATE race_garage g SET
    coins = g.coins + r.coins,
    owned = ARRAY(SELECT p FROM unnest(g.owned) p WHERE p NOT IN ('flag', 'wheels', 'exhaust', 'wing')),
    updated_at = now()
  FROM race_part_refunds r WHERE r.member_id = g.member_id;
  UPDATE race_garage SET equipped = equipped - 'flag' - 'wheels' - 'exhaust' - 'wing', updated_at = now()
  WHERE equipped ?| ARRAY['flag', 'wheels', 'exhaust', 'wing'];
  DELETE FROM race_gifts WHERE part IN ('flag', 'wheels', 'exhaust', 'wing');
END $$;

-- 3) 선물 부위 목록
ALTER TABLE race_gifts DROP CONSTRAINT IF EXISTS race_gifts_part_check;
ALTER TABLE race_gifts ADD CONSTRAINT race_gifts_part_check
  CHECK (part IN ('flag', 'wheels', 'exhaust', 'wing', 'helmet', 'tail', 'neon', 'aura',
                  'mini', 'compact', 'sedan', 'suv', 'grand', 'coupe', 'lux', 'sport', 'super'));

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
    WHEN 'helmet' THEN 12
    WHEN 'tail' THEN 15
    WHEN 'neon' THEN 18
    WHEN 'aura' THEN 30
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

-- 4) 장착 — 외관 부위 7개
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
    FOREACH k IN ARRAY ARRAY['flag', 'wheels', 'exhaust', 'wing', 'helmet', 'tail', 'neon', 'aura'] LOOP
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

COMMIT;
