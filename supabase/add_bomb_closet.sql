-- 2026-11-10 💣 폭탄 놀이터 STEP 3 — 내 캐릭터 옷장(모습·코인·산 부품·누적 기록) + 판별 보상 + 선물. Safe to re-run.
-- bomb_closet : 팀원당 1줄. look(지금 모습) · coins · owned(산/받은 부품) · 누적 기록(업적 조건)
-- bomb_rewards: 판마다 1줄(member, gid) — 같은 판 보상 두 번 방지 + 하루 상한 계산
-- bomb_gifts  : 선물 기록(보낸 사람·받은 사람·부품·한마디·확인 여부)
-- 쓰기는 아래 SECURITY DEFINER 함수로만. 함수는 브라우저가 보낸 id를 믿지 않고 로그인 계정(auth.uid() → members.auth_user_id)으로 본인을 찾는다.
-- 숫자(가격·보상·상한·업적 조건)와 목록(캐릭터·색·부품)은 src/lib/bombCloset.ts, Critter*.tsx와 맞춘다 — 바꾸면 양쪽 같이.

CREATE TABLE IF NOT EXISTS bomb_closet (
  member_id  uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  look       jsonb,
  coins      int NOT NULL DEFAULT 0 CHECK (coins >= 0),
  owned      text[] NOT NULL DEFAULT '{}',
  games      int NOT NULL DEFAULT 0,
  wins       int NOT NULL DEFAULT 0,
  rescues    int NOT NULL DEFAULT 0,
  pops       int NOT NULL DEFAULT 0,
  hits       int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bomb_rewards (
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gid        text NOT NULL,
  day        date NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('vs', 'cpu', 'practice')),
  result     text NOT NULL CHECK (result IN ('win', 'lose', 'draw', 'clear')),
  coins      int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, gid)
);
CREATE INDEX IF NOT EXISTS bomb_rewards_day_idx ON bomb_rewards (member_id, day);

CREATE TABLE IF NOT EXISTS bomb_gifts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  part       text NOT NULL,
  message    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at    timestamptz
);
CREATE INDEX IF NOT EXISTS bomb_gifts_to_idx ON bomb_gifts (to_id, seen_at);

ALTER TABLE bomb_closet ENABLE ROW LEVEL SECURITY;
ALTER TABLE bomb_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bomb_gifts ENABLE ROW LEVEL SECURITY;

-- 로그인한 사람의 팀원 id (퇴사자는 null)
CREATE OR REPLACE FUNCTION bomb_me() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM members WHERE auth_user_id = auth.uid() AND left_at IS NULL LIMIT 1
$$;

-- 옷장(모습·코인·기록)은 팀원 모두 읽기(다른 사람 캐릭터를 그려야 함). 보상·선물은 본인 것만.
DROP POLICY IF EXISTS "read_all" ON bomb_closet;
CREATE POLICY "read_all" ON bomb_closet FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "read_own" ON bomb_rewards;
CREATE POLICY "read_own" ON bomb_rewards FOR SELECT TO authenticated USING (member_id = bomb_me());
DROP POLICY IF EXISTS "read_own" ON bomb_gifts;
CREATE POLICY "read_own" ON bomb_gifts FOR SELECT TO authenticated USING (to_id = bomb_me() OR from_id = bomb_me());
REVOKE ALL ON bomb_closet, bomb_rewards, bomb_gifts FROM anon, authenticated; -- 쓰기는 함수로만
GRANT SELECT ON bomb_closet, bomb_rewards, bomb_gifts TO authenticated;
GRANT ALL ON bomb_closet, bomb_rewards, bomb_gifts TO service_role;

-- 부품 가격 (0 = 상점에 없음: 무료 기본 부품이거나 업적 부품)
CREATE OR REPLACE FUNCTION bomb_part_price(p_part text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_part
    WHEN 'beanie' THEN 10 WHEN 'flower' THEN 10 WHEN 'cap' THEN 15 WHEN 'sprout' THEN 15 WHEN 'party' THEN 20 WHEN 'chick' THEN 30
    WHEN 'freckles' THEN 8 WHEN 'mustache' THEN 12 WHEN 'sunglasses' THEN 20
    WHEN 'bowtie' THEN 10 WHEN 'stripe' THEN 12 WHEN 'sweater' THEN 15 WHEN 'overalls' THEN 20 WHEN 'raincoat' THEN 25
    WHEN 'backpack' THEN 15 WHEN 'balloon' THEN 20 WHEN 'cape' THEN 30
    ELSE 0 END
$$;

-- 이 부품을 쓸 수 있나 (없음 · 무료 기본 · 산 것/받은 것 · 업적 달성)
CREATE OR REPLACE FUNCTION bomb_has(c bomb_closet, p_part text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_part IS NULL OR p_part = 'none' THEN true
    WHEN p_part IN ('strawberry', 'ribbon', 'glasses', 'heartBlush', 'scarf') THEN true
    WHEN p_part = 'crown' THEN c.wins >= 10
    WHEN p_part = 'star' THEN c.wins >= 1
    WHEN p_part = 'wings' THEN c.rescues >= 20
    WHEN p_part = 'batWings' THEN c.pops >= 15
    WHEN p_part = 'bandage' THEN c.hits >= 30
    ELSE p_part = ANY (c.owned)
  END
$$;

-- 받은 모습을 걸러서 저장할 모양으로 — 목록에 없는 값은 버리고, 못 쓰는 부품은 'none'
CREATE OR REPLACE FUNCTION bomb_clean_look(c bomb_closet, p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  sp text := p ->> 'species';
  col text := p ->> 'color';
  hat text := COALESCE(p ->> 'hat', 'none');
  face text := COALESCE(p ->> 'face', 'none');
  back text := COALESCE(p ->> 'back', 'none');
  outfit text := COALESCE(p ->> 'outfit', 'none');
  out jsonb;
BEGIN
  IF sp IS NULL OR sp NOT IN ('cheeseCat', 'tuxCat', 'pom', 'mutt', 'rabbit', 'bear', 'penguin', 'duck', 'fox', 'slime', 'turtle', 'turtleFast') THEN RETURN NULL; END IF;
  IF hat NOT IN ('none', 'strawberry', 'crown', 'beanie', 'ribbon', 'party', 'cap', 'flower', 'chick', 'sprout') OR NOT bomb_has(c, hat) THEN hat := 'none'; END IF;
  IF face NOT IN ('none', 'glasses', 'sunglasses', 'heartBlush', 'freckles', 'star', 'mustache', 'bandage') OR NOT bomb_has(c, face) THEN face := 'none'; END IF;
  IF back NOT IN ('none', 'wings', 'batWings', 'cape', 'backpack', 'balloon') OR NOT bomb_has(c, back) THEN back := 'none'; END IF;
  IF outfit NOT IN ('none', 'scarf', 'bowtie', 'stripe', 'overalls', 'sweater', 'raincoat') OR NOT bomb_has(c, outfit) THEN outfit := 'none'; END IF;
  out := jsonb_build_object('species', sp, 'hat', hat, 'face', face, 'back', back, 'outfit', outfit);
  IF col IN ('#ffbd73', '#f3d7a2', '#fff4ee', '#ffc4d4', '#ffa05e', '#ffe27a', '#9fe3c6', '#b9dcff', '#d6d9e2', '#c99b78', '#4a5878', '#3c3c4a') THEN
    out := out || jsonb_build_object('color', col);
  END IF;
  RETURN out;
END
$$;

-- 처음 열 때: 줄이 없으면 만들고, 모습이 비어 있으면 p_look(이 브라우저에 있던 모습)으로 채운다
CREATE OR REPLACE FUNCTION bomb_init(p_look jsonb) RETURNS bomb_closet
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := bomb_me();
  c bomb_closet;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  INSERT INTO bomb_closet (member_id) VALUES (me) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO c FROM bomb_closet WHERE member_id = me FOR UPDATE;
  IF c.look IS NULL AND p_look IS NOT NULL THEN
    UPDATE bomb_closet SET look = bomb_clean_look(c, p_look), updated_at = now() WHERE member_id = me RETURNING * INTO c;
  END IF;
  RETURN c;
END
$$;

CREATE OR REPLACE FUNCTION bomb_set_look(p_look jsonb) RETURNS bomb_closet
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := bomb_me();
  c bomb_closet;
  l jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  INSERT INTO bomb_closet (member_id) VALUES (me) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO c FROM bomb_closet WHERE member_id = me FOR UPDATE;
  l := bomb_clean_look(c, p_look);
  IF l IS NULL THEN RAISE EXCEPTION 'BAD_LOOK'; END IF;
  UPDATE bomb_closet SET look = l, updated_at = now() WHERE member_id = me RETURNING * INTO c;
  RETURN c;
END
$$;

-- 부품 사기
CREATE OR REPLACE FUNCTION bomb_buy(p_part text) RETURNS bomb_closet
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := bomb_me();
  price int := bomb_part_price(p_part);
  c bomb_closet;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF price <= 0 THEN RAISE EXCEPTION 'NOT_FOR_SALE %', p_part; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bomb_coins:' || me::text));
  INSERT INTO bomb_closet (member_id) VALUES (me) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO c FROM bomb_closet WHERE member_id = me FOR UPDATE;
  IF p_part = ANY (c.owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  IF c.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', c.coins; END IF;
  UPDATE bomb_closet SET coins = coins - price, owned = array_append(owned, p_part), updated_at = now()
  WHERE member_id = me RETURNING * INTO c;
  RETURN c;
END
$$;

-- 판이 끝난 뒤 보상 + 누적 기록. 같은 gid는 한 번만.
-- vs(사람 2명 이상): 승 5 · 패/무 2 / cpu: 승 2 · 패/무 1 / practice(상자 다 부숨): 1
-- + 구출 1번당 1(한 판 최대 3). 하루 상한: 전체 30, 혼자 하는 판(cpu·practice) 합쳐 6. (KST 날짜)
-- 기록은 팀전(vs·cpu)만 쌓는다. 한 판 값은 0~20으로 자른다.
-- 반환: { coins: 받은 코인, unlocked: 이번에 새로 풀린 업적 부품들, closet: 옷장 줄 }
CREATE OR REPLACE FUNCTION bomb_reward(p_gid text, p_kind text, p_result text, p_rescues int, p_pops int, p_hits int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := bomb_me();
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  r int := LEAST(20, GREATEST(0, COALESCE(p_rescues, 0)));
  po int := LEAST(20, GREATEST(0, COALESCE(p_pops, 0)));
  h int := LEAST(20, GREATEST(0, COALESCE(p_hits, 0)));
  want int;
  got_today int;
  got_solo int;
  give int;
  before bomb_closet;
  c bomb_closet;
  newly text[] := '{}';
  k text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF p_kind NOT IN ('vs', 'cpu', 'practice') THEN RAISE EXCEPTION 'BAD_KIND'; END IF;
  IF p_kind = 'practice' THEN p_result := 'clear';
  ELSIF p_result NOT IN ('win', 'lose', 'draw') THEN RAISE EXCEPTION 'BAD_RESULT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bomb_coins:' || me::text));
  INSERT INTO bomb_closet (member_id) VALUES (me) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO before FROM bomb_closet WHERE member_id = me FOR UPDATE;
  IF EXISTS (SELECT 1 FROM bomb_rewards WHERE member_id = me AND gid = p_gid) THEN
    RETURN jsonb_build_object('coins', 0, 'unlocked', '[]'::jsonb, 'dup', true, 'closet', to_jsonb(before));
  END IF;
  IF p_kind = 'vs' THEN want := CASE WHEN p_result = 'win' THEN 5 ELSE 2 END;
  ELSIF p_kind = 'cpu' THEN want := CASE WHEN p_result = 'win' THEN 2 ELSE 1 END;
  ELSE want := 1;
  END IF;
  IF p_kind <> 'practice' THEN want := want + LEAST(3, r); END IF;
  SELECT COALESCE(sum(coins), 0) INTO got_today FROM bomb_rewards WHERE member_id = me AND day = today;
  SELECT COALESCE(sum(coins), 0) INTO got_solo FROM bomb_rewards WHERE member_id = me AND day = today AND kind <> 'vs';
  give := LEAST(want, GREATEST(0, 30 - got_today));
  IF p_kind <> 'vs' THEN give := LEAST(give, GREATEST(0, 6 - got_solo)); END IF;
  INSERT INTO bomb_rewards (member_id, gid, day, kind, result, coins) VALUES (me, p_gid, today, p_kind, p_result, give);
  IF p_kind = 'practice' THEN
    UPDATE bomb_closet SET coins = coins + give, updated_at = now() WHERE member_id = me RETURNING * INTO c;
  ELSE
    UPDATE bomb_closet SET
      coins = coins + give, games = games + 1, wins = wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      rescues = rescues + r, pops = pops + po, hits = hits + h, updated_at = now()
    WHERE member_id = me RETURNING * INTO c;
  END IF;
  FOREACH k IN ARRAY ARRAY['star', 'crown', 'wings', 'batWings', 'bandage'] LOOP
    IF bomb_has(c, k) AND NOT bomb_has(before, k) THEN newly := array_append(newly, k); END IF;
  END LOOP;
  RETURN jsonb_build_object('coins', give, 'unlocked', to_jsonb(newly), 'closet', to_jsonb(c));
END
$$;

-- 선물: 상점 부품을 내 코인으로 사서 동료에게. 받는 사람이 이미 가졌으면 안 됨.
CREATE OR REPLACE FUNCTION bomb_gift(p_to uuid, p_part text, p_message text) RETURNS bomb_closet
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := bomb_me();
  price int := bomb_part_price(p_part);
  c bomb_closet;
  t bomb_closet;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF p_to = me THEN RAISE EXCEPTION 'SELF_GIFT'; END IF;
  IF price <= 0 THEN RAISE EXCEPTION 'NOT_FOR_SALE %', p_part; END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_to AND left_at IS NULL) THEN RAISE EXCEPTION 'NO_SUCH_MEMBER'; END IF;
  -- 두 사람 잠금은 id 순서대로 (서로 동시에 보내도 교착 없게)
  PERFORM pg_advisory_xact_lock(hashtext('bomb_coins:' || LEAST(me, p_to)::text));
  PERFORM pg_advisory_xact_lock(hashtext('bomb_coins:' || GREATEST(me, p_to)::text));
  INSERT INTO bomb_closet (member_id) VALUES (me), (p_to) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO c FROM bomb_closet WHERE member_id = me FOR UPDATE;
  SELECT * INTO t FROM bomb_closet WHERE member_id = p_to FOR UPDATE;
  IF p_part = ANY (t.owned) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
  IF c.coins < price THEN RAISE EXCEPTION 'NOT_ENOUGH_COINS %', c.coins; END IF;
  UPDATE bomb_closet SET owned = array_append(owned, p_part), updated_at = now() WHERE member_id = p_to;
  INSERT INTO bomb_gifts (from_id, to_id, part, message) VALUES (me, p_to, p_part, NULLIF(left(btrim(COALESCE(p_message, '')), 60), ''));
  UPDATE bomb_closet SET coins = coins - price, updated_at = now() WHERE member_id = me RETURNING * INTO c;
  RETURN c;
END
$$;

-- 받은 선물 확인 표시
CREATE OR REPLACE FUNCTION bomb_gifts_seen() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE bomb_gifts SET seen_at = now() WHERE to_id = bomb_me() AND seen_at IS NULL
$$;

REVOKE ALL ON FUNCTION bomb_me() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_init(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_set_look(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_buy(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_reward(text, text, text, int, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_gift(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bomb_gifts_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bomb_me() TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_init(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_set_look(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_buy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_reward(text, text, text, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_gift(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_gifts_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION bomb_part_price(text) TO authenticated;
