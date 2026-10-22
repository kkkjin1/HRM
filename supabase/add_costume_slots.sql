-- 2026-10-22 Costume step 1: parts catalog + slot-based equip. Safe to re-run.
-- Every item is still (team x part). Parts now live in baseball_parts (part -> slot),
-- so adding a new item later = one INSERT row here + drawing code in src/components/baseball/gear.tsx.
-- Slots: head / face / top / hand / acc / effect (effect has no parts yet).
-- Must match GEAR_PARTS in src/lib/baseballGear.ts.

CREATE TABLE IF NOT EXISTS baseball_parts (
  part text PRIMARY KEY,
  slot text NOT NULL CHECK (slot IN ('head', 'face', 'top', 'hand', 'acc', 'effect')),
  sort int NOT NULL DEFAULT 0
);
INSERT INTO baseball_parts (part, slot, sort) VALUES
  ('cap', 'head', 10), ('helmet', 'head', 11),
  ('eyeblack', 'face', 20), ('shades', 'face', 21),
  ('uniform', 'top', 30), ('away', 'top', 31),
  ('bat', 'hand', 40), ('cheer', 'hand', 41),
  ('gloves', 'acc', 50)
ON CONFLICT (part) DO UPDATE SET slot = EXCLUDED.slot, sort = EXCLUDED.sort;

ALTER TABLE baseball_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON baseball_parts;
CREATE POLICY "read_all" ON baseball_parts FOR SELECT TO authenticated USING (true);
GRANT SELECT ON baseball_parts TO authenticated;
GRANT ALL ON baseball_parts TO service_role;

-- owned gear: part list is now the catalog table instead of a fixed CHECK
ALTER TABLE baseball_gear DROP CONSTRAINT IF EXISTS baseball_gear_part_check;
ALTER TABLE baseball_gear DROP CONSTRAINT IF EXISTS baseball_gear_part_fkey;
ALTER TABLE baseball_gear ADD CONSTRAINT baseball_gear_part_fkey FOREIGN KEY (part) REFERENCES baseball_parts(part);

-- equip: slots = {"head": {"part": "cap", "team": "kia"}, ...}
-- cap / uniform / bat columns stay in sync for old open tabs (head team / top team / bat team).
ALTER TABLE baseball_equip ADD COLUMN IF NOT EXISTS slots jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE baseball_equip SET slots = jsonb_strip_nulls(jsonb_build_object(
  'head', CASE WHEN cap IS NOT NULL THEN jsonb_build_object('part', 'cap', 'team', cap) END,
  'top', CASE WHEN uniform IS NOT NULL THEN jsonb_build_object('part', 'uniform', 'team', uniform) END,
  'hand', CASE WHEN bat IS NOT NULL THEN jsonb_build_object('part', 'bat', 'team', bat) END
))
WHERE slots = '{}'::jsonb;

-- p_part NULL = take off whatever is in that slot
CREATE OR REPLACE FUNCTION equip_baseball_slot(p_member uuid, p_slot text, p_part text, p_team text)
RETURNS baseball_equip
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_equip;
  t text;
BEGIN
  IF p_slot NOT IN ('head', 'face', 'top', 'hand', 'acc', 'effect') THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
  t := CASE WHEN p_part IS NULL THEN NULL ELSE p_team END;
  IF p_part IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM baseball_parts WHERE part = p_part AND slot = p_slot) THEN RAISE EXCEPTION 'BAD_PART'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM baseball_gear WHERE member_id = p_member AND team = p_team AND part = p_part
    ) THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;
  END IF;
  INSERT INTO baseball_equip (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  UPDATE baseball_equip
     SET slots = CASE WHEN p_part IS NULL THEN slots - p_slot
                      ELSE slots || jsonb_build_object(p_slot, jsonb_build_object('part', p_part, 'team', p_team)) END,
         cap     = CASE WHEN p_slot = 'head' THEN t ELSE cap END,
         uniform = CASE WHEN p_slot = 'top' THEN t ELSE uniform END,
         bat     = CASE WHEN p_slot = 'hand' THEN (CASE WHEN p_part = 'bat' THEN t END) ELSE bat END,
         updated_at = now()
   WHERE member_id = p_member
  RETURNING * INTO r;
  RETURN r;
END
$$;

-- old function (still called by tabs opened before this deploy) now writes slots too
CREATE OR REPLACE FUNCTION equip_baseball_gear(p_member uuid, p_part text, p_team text)
RETURNS baseball_equip
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_equip;
BEGIN
  IF p_part NOT IN ('cap', 'uniform', 'bat') THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  SELECT * INTO r FROM equip_baseball_slot(
    p_member,
    CASE p_part WHEN 'cap' THEN 'head' WHEN 'uniform' THEN 'top' ELSE 'hand' END,
    CASE WHEN p_team IS NULL THEN NULL ELSE p_part END,
    p_team
  );
  RETURN r;
END
$$;

-- random part now comes from the catalog (all parts equally likely)
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
  pt := COALESCE(r.preset_part, (SELECT part FROM baseball_parts ORDER BY random() LIMIT 1));
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

-- admin: team / part may be NULL (= random when opened)
CREATE OR REPLACE FUNCTION admin_send_baseball_box(p_sender uuid, p_recipient uuid, p_team text, p_part text, p_message text)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_gift_boxes;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  IF p_team IS NOT NULL AND p_team NOT IN ('lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom') THEN RAISE EXCEPTION 'BAD_TEAM'; END IF;
  IF p_part IS NOT NULL AND NOT EXISTS (SELECT 1 FROM baseball_parts WHERE part = p_part) THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  INSERT INTO baseball_gift_boxes (kind, sender_id, recipient_id, cost, message, preset_team, preset_part)
  VALUES ('admin', p_sender, p_recipient, 0, NULLIF(btrim(COALESCE(p_message, '')), ''), p_team, p_part)
  RETURNING * INTO r;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION equip_baseball_slot(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION equip_baseball_slot(uuid, text, text, text) TO authenticated;
