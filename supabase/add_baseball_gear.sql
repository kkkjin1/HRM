-- 2026-10-01 Supabase SQL Editor executed (main + bg_team add-on).
-- Baseball gear (KBO cap / uniform / bat) step 1.
-- credit = this month (KST) team tree waterings - 10 x credit boxes sent this month. Resets every month.
-- credit box: 10 credit, others only, team and part fully random.
-- admin box: only ji.kim@egnis.kr, no credit, team and part chosen by admin (preset_team / preset_part).
-- Writes only through security definer functions below (no write policy for authenticated).
-- Numbers must match src/lib/baseballGear.ts (BOX_COST).

CREATE TABLE IF NOT EXISTS baseball_gift_boxes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL DEFAULT 'credit' CHECK (kind IN ('credit', 'admin')),
  sender_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cost         int NOT NULL DEFAULT 0,
  message      text,
  preset_team  text,
  preset_part  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  opened_at    timestamptz,
  item_team    text,
  item_part    text,
  duplicate    boolean,
  CHECK (kind = 'admin' OR sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS baseball_gift_boxes_recipient_idx ON baseball_gift_boxes (recipient_id);
CREATE INDEX IF NOT EXISTS baseball_gift_boxes_sender_idx ON baseball_gift_boxes (sender_id);

CREATE TABLE IF NOT EXISTS baseball_gear (
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  team        text NOT NULL,
  part        text NOT NULL CHECK (part IN ('cap', 'uniform', 'bat')),
  box_id      uuid REFERENCES baseball_gift_boxes(id) ON DELETE SET NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, team, part)
);

CREATE TABLE IF NOT EXISTS baseball_equip (
  member_id  uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  cap        text,
  uniform    text,
  bat        text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE baseball_gift_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_gear ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_equip ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON baseball_gift_boxes FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON baseball_gear FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON baseball_equip FOR SELECT TO authenticated USING (true);
GRANT SELECT ON baseball_gift_boxes, baseball_gear, baseball_equip TO authenticated;
GRANT ALL ON baseball_gift_boxes, baseball_gear, baseball_equip TO service_role;

CREATE OR REPLACE FUNCTION baseball_credit_balance(p_member uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM team_tree_waterings
           WHERE member_id = p_member
             AND watered_date >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')::date)::int
       - COALESCE((SELECT sum(cost) FROM baseball_gift_boxes
           WHERE sender_id = p_member AND kind = 'credit'
             AND created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')), 0)::int
$$;

CREATE OR REPLACE FUNCTION send_baseball_box(p_sender uuid, p_recipient uuid, p_message text)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bal int;
  r baseball_gift_boxes;
BEGIN
  IF p_sender = p_recipient THEN RAISE EXCEPTION 'SELF_GIFT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('baseball_credit:' || p_sender::text));
  bal := baseball_credit_balance(p_sender);
  IF bal < 10 THEN RAISE EXCEPTION 'NOT_ENOUGH_CREDIT %', bal; END IF;
  INSERT INTO baseball_gift_boxes (kind, sender_id, recipient_id, cost, message)
  VALUES ('credit', p_sender, p_recipient, 10, NULLIF(btrim(COALESCE(p_message, '')), ''))
  RETURNING * INTO r;
  RETURN r;
END
$$;

CREATE OR REPLACE FUNCTION admin_send_baseball_box(p_sender uuid, p_recipient uuid, p_team text, p_part text, p_message text)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_gift_boxes;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  IF p_team NOT IN ('lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom') THEN RAISE EXCEPTION 'BAD_TEAM'; END IF;
  IF p_part NOT IN ('cap', 'uniform', 'bat') THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  INSERT INTO baseball_gift_boxes (kind, sender_id, recipient_id, cost, message, preset_team, preset_part)
  VALUES ('admin', p_sender, p_recipient, 0, NULLIF(btrim(COALESCE(p_message, '')), ''), p_team, p_part)
  RETURNING * INTO r;
  RETURN r;
END
$$;

CREATE OR REPLACE FUNCTION open_baseball_box(p_box uuid, p_member uuid)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_gift_boxes;
  t text;
  pt text;
  dup boolean;
BEGIN
  SELECT * INTO r FROM baseball_gift_boxes WHERE id = p_box FOR UPDATE;
  IF NOT FOUND OR r.recipient_id <> p_member THEN RAISE EXCEPTION 'BOX_NOT_FOUND'; END IF;
  IF r.opened_at IS NOT NULL THEN RETURN r; END IF;
  t := COALESCE(r.preset_team, (ARRAY['lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom'])[1 + floor(random() * 10)::int]);
  pt := COALESCE(r.preset_part, (ARRAY['cap','uniform','bat'])[1 + floor(random() * 3)::int]);
  dup := EXISTS (SELECT 1 FROM baseball_gear WHERE member_id = p_member AND team = t AND part = pt);
  IF NOT dup THEN
    INSERT INTO baseball_gear (member_id, team, part, box_id) VALUES (p_member, t, pt, p_box);
  END IF;
  UPDATE baseball_gift_boxes
     SET opened_at = now(), item_team = t, item_part = pt, duplicate = dup
   WHERE id = p_box
  RETURNING * INTO r;
  RETURN r;
END
$$;

-- p_team NULL = back to default gear for that part
CREATE OR REPLACE FUNCTION equip_baseball_gear(p_member uuid, p_part text, p_team text)
RETURNS baseball_equip
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_equip;
BEGIN
  IF p_part NOT IN ('cap', 'uniform', 'bat') THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  IF p_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM baseball_gear WHERE member_id = p_member AND team = p_team AND part = p_part
  ) THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;
  INSERT INTO baseball_equip (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  UPDATE baseball_equip
     SET cap     = CASE WHEN p_part = 'cap' THEN p_team ELSE cap END,
         uniform = CASE WHEN p_part = 'uniform' THEN p_team ELSE uniform END,
         bat     = CASE WHEN p_part = 'bat' THEN p_team ELSE bat END,
         updated_at = now()
   WHERE member_id = p_member
  RETURNING * INTO r;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION baseball_credit_balance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION send_baseball_box(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_send_baseball_box(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION open_baseball_box(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION equip_baseball_gear(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION baseball_credit_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION send_baseball_box(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_baseball_box(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION open_baseball_box(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION equip_baseball_gear(uuid, text, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_gift_boxes;
ALTER PUBLICATION supabase_realtime ADD TABLE baseball_equip;
ALTER TABLE baseball_equip REPLICA IDENTITY FULL;

-- 2026-10-01 add-on: widget background team logo. When equipped gear mixes teams, the player picks one.
ALTER TABLE baseball_equip ADD COLUMN IF NOT EXISTS bg_team text;

CREATE OR REPLACE FUNCTION set_baseball_background(p_member uuid, p_team text)
RETURNS baseball_equip
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_equip;
BEGIN
  IF p_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM baseball_gear WHERE member_id = p_member AND team = p_team
  ) THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;
  INSERT INTO baseball_equip (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  UPDATE baseball_equip SET bg_team = p_team, updated_at = now() WHERE member_id = p_member
  RETURNING * INTO r;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION set_baseball_background(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_baseball_background(uuid, text) TO authenticated;
