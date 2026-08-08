-- 인사관리팀 내부 장난 페이지 (/fun). HRM의 team_log_* 테이블과는 무관한 별도 기능이라
-- 접두사 없이 스펙 그대로 만든다 (members/day_state/menu_vote/doodle).
-- RLS는 team_log_*와 동일한 정책: 로그인한 사람은 전부 팀원으로 간주해 authenticated 전체 허용.

CREATE TYPE member_role AS ENUM ('lead', 'part_lead', 'member');

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  color_key smallint NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 하루 1회 확정되는 모든 값을 한 행에 모은다. date PK가 동시요청 방지의 유일한 장치다.
CREATE TABLE day_state (
  date          date PRIMARY KEY,
  weather       text NOT NULL DEFAULT 'clear',   -- clear|hot|rain|cold
  weather_by    uuid REFERENCES members(id) ON DELETE SET NULL,
  sender_id     uuid REFERENCES members(id) ON DELETE CASCADE,
  receiver_id   uuid REFERENCES members(id) ON DELETE CASCADE,
  message       text,
  msg_status    text DEFAULT 'pending',           -- pending|written|passed|hidden
  meal_payer    uuid REFERENCES members(id) ON DELETE SET NULL,
  meal_spun     boolean DEFAULT false,
  coffee_payer  uuid REFERENCES members(id) ON DELETE SET NULL,
  coffee_spun   boolean DEFAULT false,
  snack_payer   uuid REFERENCES members(id) ON DELETE SET NULL,
  snack_spun    boolean DEFAULT false,
  final_menu    text,
  message_reactions jsonb DEFAULT '{}',  -- 오늘의 한마디용 이모지 반응. { "❤️": ["uuid",...] }
  created_at    timestamptz DEFAULT now()
);
-- *_spun = true 인데 *_payer = null 이면 법인카드 당첨이다.

CREATE TABLE menu_vote (
  date       date NOT NULL,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mood       text NOT NULL,   -- good|tired|spicy|hearty|light|none
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, member_id)
);

CREATE TABLE doodle (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body       text NOT NULL,
  color_key  smallint NOT NULL,
  tilt       real NOT NULL,          -- -0.9 ~ 0.9
  reactions  jsonb DEFAULT '{}',     -- { "❤️": ["uuid",...] }
  created_at timestamptz DEFAULT now()
);

ALTER TABLE members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE doodle    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON members   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON day_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON menu_vote FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON doodle    FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON members, day_state, menu_vote, doodle TO service_role, authenticated;

CREATE INDEX doodle_created_idx ON doodle (created_at DESC);

-- 메뉴 투표 카드/날씨 변경을 실시간으로 반영하기 위해 Realtime publication에 추가.
ALTER PUBLICATION supabase_realtime ADD TABLE menu_vote;
ALTER PUBLICATION supabase_realtime ADD TABLE day_state;

-- 시드. 이 4명 구성에 어떤 로직도 의존하지 않는다 — members 테이블을 런타임에 읽어 동작.
INSERT INTO members (name, role, color_key) VALUES
  ('진일',   'lead',      0),
  ('김다슬', 'part_lead', 3),
  ('강은정', 'member',    5),
  ('주현',   'member',    1);


-- ══════════════════════════════════════════════════════════════════════
-- 룰렛 지분 계산 — lib/roulette.ts의 buildWheel과 반드시 동일한 규칙을 유지한다.
--   meal   : lead 40 / corp 20 / part_lead 20 / member 20
--   coffee : lead 30 / corp 20 / part_lead 20 / member 30
--   snack  : 법인카드 없음, 멤버 전원 균등 (100/N), 역할 무시
--   공석인 역할의 지분은 실재 멤버 전원에게 균등 재분배 (법인카드 제외)
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION roulette_weights(p_menu text)
RETURNS TABLE(member_id uuid, label text, weight numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lead_total   numeric;
  v_part_total   numeric;
  v_member_total numeric;
  v_corp         numeric;
  v_lead_n       int;
  v_part_n       int;
  v_member_n     int;
  v_n            int;
  v_vacant       numeric := 0;
  v_extra        numeric;
BEGIN
  IF p_menu = 'meal' THEN
    v_lead_total := 40; v_part_total := 20; v_member_total := 20; v_corp := 20;
  ELSIF p_menu = 'coffee' THEN
    v_lead_total := 30; v_part_total := 20; v_member_total := 30; v_corp := 20;
  ELSIF p_menu = 'snack' THEN
    v_lead_total := 0;  v_part_total := 0;  v_member_total := 100; v_corp := 0;
  ELSE
    RAISE EXCEPTION 'invalid menu: %', p_menu;
  END IF;

  SELECT count(*) INTO v_n FROM members;
  IF v_n = 0 THEN
    RETURN;
  END IF;

  IF p_menu = 'snack' THEN
    RETURN QUERY
      SELECT m.id, m.name, (v_member_total / v_n)::numeric
      FROM members m;
    RETURN;
  END IF;

  SELECT count(*) INTO v_lead_n   FROM members WHERE role = 'lead';
  SELECT count(*) INTO v_part_n   FROM members WHERE role = 'part_lead';
  SELECT count(*) INTO v_member_n FROM members WHERE role = 'member';

  IF v_lead_n = 0   THEN v_vacant := v_vacant + v_lead_total;   END IF;
  IF v_part_n = 0   THEN v_vacant := v_vacant + v_part_total;   END IF;
  IF v_member_n = 0 THEN v_vacant := v_vacant + v_member_total; END IF;
  v_extra := v_vacant / v_n;

  RETURN QUERY
    SELECT
      m.id,
      m.name,
      (
        CASE m.role
          WHEN 'lead'      THEN CASE WHEN v_lead_n = 0   THEN 0 ELSE v_lead_total / v_lead_n     END
          WHEN 'part_lead' THEN CASE WHEN v_part_n = 0   THEN 0 ELSE v_part_total / v_part_n     END
          ELSE                  CASE WHEN v_member_n = 0 THEN 0 ELSE v_member_total / v_member_n END
        END + v_extra
      )::numeric AS weight
    FROM members m;

  IF v_corp > 0 THEN
    RETURN QUERY SELECT NULL::uuid, '법인카드'::text, v_corp::numeric;
  END IF;
END;
$$;

-- 서버에서만 추첨한다 (프론트 Math.random()은 콘솔에서 조작 가능).
-- day_state 행을 for update로 잠가 두 탭 동시 클릭에도 결과가 하나로 확정된다.
CREATE OR REPLACE FUNCTION spin(p_menu text, p_user uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_date          date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_row           day_state%ROWTYPE;
  v_member_count  int;
  v_total         numeric;
  v_rand          numeric;
  v_cum           numeric := 0;
  v_picked        uuid;
  v_picked_found  boolean := false;
  rec             record;
BEGIN
  IF p_menu NOT IN ('meal', 'coffee', 'snack') THEN
    RAISE EXCEPTION 'invalid menu: %', p_menu;
  END IF;

  SELECT count(*) INTO v_member_count FROM members;
  IF v_member_count = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO day_state (date) VALUES (v_date)
  ON CONFLICT (date) DO NOTHING;

  SELECT * INTO v_row FROM day_state WHERE date = v_date FOR UPDATE;

  IF p_menu = 'meal' AND v_row.meal_spun THEN
    RETURN v_row.meal_payer;
  ELSIF p_menu = 'coffee' AND v_row.coffee_spun THEN
    RETURN v_row.coffee_payer;
  ELSIF p_menu = 'snack' AND v_row.snack_spun THEN
    RETURN v_row.snack_payer;
  END IF;

  SELECT coalesce(sum(weight), 0) INTO v_total FROM roulette_weights(p_menu);
  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;

  v_rand := random() * v_total;

  FOR rec IN SELECT member_id, weight FROM roulette_weights(p_menu) ORDER BY member_id NULLS FIRST LOOP
    v_cum := v_cum + rec.weight;
    IF NOT v_picked_found AND v_rand <= v_cum THEN
      v_picked := rec.member_id;
      v_picked_found := true;
    END IF;
  END LOOP;

  IF p_menu = 'meal' THEN
    UPDATE day_state SET meal_payer = v_picked, meal_spun = true WHERE date = v_date;
  ELSIF p_menu = 'coffee' THEN
    UPDATE day_state SET coffee_payer = v_picked, coffee_spun = true WHERE date = v_date;
  ELSE
    UPDATE day_state SET snack_payer = v_picked, snack_spun = true WHERE date = v_date;
  END IF;

  RETURN v_picked;
END;
$$;

-- 오늘의 한마디: 발신자는 배정된 지 가장 오래된 사람 순으로 순환(순수 random이면 4명 팀에서
-- 연속 배정이 흔해 "왜 또 나야"가 나온다). 수신자는 발신자 제외 + 최근 14일 동일 쌍 제외.
CREATE OR REPLACE FUNCTION ensure_day()
RETURNS TABLE(date date, sender_id uuid, receiver_id uuid, message text, msg_status text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_date         date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_row          day_state%ROWTYPE;
  v_member_count int;
  v_sender       uuid;
  v_receiver     uuid;
BEGIN
  SELECT count(*) INTO v_member_count FROM members;

  BEGIN
    INSERT INTO day_state (date) VALUES (v_date);
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT * INTO v_row FROM day_state WHERE date = v_date FOR UPDATE;

  IF v_row.sender_id IS NOT NULL OR v_member_count < 2 THEN
    RETURN QUERY SELECT v_row.date, v_row.sender_id, v_row.receiver_id, v_row.message, v_row.msg_status;
    RETURN;
  END IF;

  SELECT m.id INTO v_sender
  FROM members m
  LEFT JOIN (
    SELECT d.sender_id, max(d.date) AS last_date
    FROM day_state d
    WHERE d.sender_id IS NOT NULL
    GROUP BY d.sender_id
  ) s ON s.sender_id = m.id
  ORDER BY s.last_date ASC NULLS FIRST, random()
  LIMIT 1;

  SELECT m.id INTO v_receiver
  FROM members m
  WHERE m.id <> v_sender
    AND NOT EXISTS (
      SELECT 1 FROM day_state d
      WHERE d.sender_id = v_sender AND d.receiver_id = m.id
        AND d.date >= v_date - 14 AND d.date < v_date
    )
  ORDER BY random()
  LIMIT 1;

  IF v_receiver IS NULL THEN
    SELECT m.id INTO v_receiver FROM members m WHERE m.id <> v_sender ORDER BY random() LIMIT 1;
  END IF;

  UPDATE day_state SET sender_id = v_sender, receiver_id = v_receiver WHERE date = v_date;

  RETURN QUERY SELECT v_date, v_sender, v_receiver, v_row.message, v_row.msg_status;
END;
$$;

-- 클라이언트가 날짜 판정에 new Date()를 쓰지 않도록, 조회 전용 화면에서도 항상
-- 이 함수로 서버 날짜를 받아온다 (day_state 행을 만들지 않는 순수 조회).
CREATE OR REPLACE FUNCTION today_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date;
$$;

GRANT EXECUTE ON FUNCTION roulette_weights(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION spin(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ensure_day() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION today_date() TO authenticated, service_role;
