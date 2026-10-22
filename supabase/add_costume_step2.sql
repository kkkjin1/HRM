-- 2026-10-22 Costume step 2: rarity weights + season-limited special uniforms. Safe to re-run.
-- Run after add_costume_slots.sql. Must match GEAR_PARTS (rarity / season) in src/lib/baseballGear.ts.
-- weight: common 10 / rare 4 / legend 3. season_from / season_to = MMDD (KST), from > to wraps the new year.
-- Out-of-season parts never come out of random boxes; owned ones can still be worn.

ALTER TABLE baseball_parts ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'common';
ALTER TABLE baseball_parts ADD COLUMN IF NOT EXISTS weight int NOT NULL DEFAULT 10;
ALTER TABLE baseball_parts ADD COLUMN IF NOT EXISTS season_from int;
ALTER TABLE baseball_parts ADD COLUMN IF NOT EXISTS season_to int;

INSERT INTO baseball_parts (part, slot, sort, rarity, weight, season_from, season_to) VALUES
  ('cap', 'head', 10, 'common', 10, NULL, NULL),
  ('helmet', 'head', 11, 'rare', 4, NULL, NULL),
  ('eyeblack', 'face', 20, 'common', 10, NULL, NULL),
  ('shades', 'face', 21, 'rare', 4, NULL, NULL),
  ('uniform', 'top', 30, 'common', 10, NULL, NULL),
  ('away', 'top', 31, 'rare', 4, NULL, NULL),
  ('military', 'top', 32, 'rare', 4, NULL, NULL),
  ('retro', 'top', 33, 'rare', 4, NULL, NULL),
  ('autumn', 'top', 34, 'legend', 3, 1001, 1130),
  ('holiday', 'top', 35, 'legend', 3, 1201, 115),
  ('bat', 'hand', 40, 'common', 10, NULL, NULL),
  ('cheer', 'hand', 41, 'rare', 4, NULL, NULL),
  ('gloves', 'acc', 50, 'common', 10, NULL, NULL)
ON CONFLICT (part) DO UPDATE SET slot = EXCLUDED.slot, sort = EXCLUDED.sort, rarity = EXCLUDED.rarity,
  weight = EXCLUDED.weight, season_from = EXCLUDED.season_from, season_to = EXCLUDED.season_to;

-- parts that can come out of a random box today (KST)
CREATE OR REPLACE FUNCTION baseball_parts_in_season() RETURNS SETOF baseball_parts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM baseball_parts p
   WHERE p.weight > 0
     AND (p.season_from IS NULL OR p.season_to IS NULL
          OR (p.season_from <= p.season_to
              AND to_char(now() AT TIME ZONE 'Asia/Seoul', 'MMDD')::int BETWEEN p.season_from AND p.season_to)
          OR (p.season_from > p.season_to
              AND (to_char(now() AT TIME ZONE 'Asia/Seoul', 'MMDD')::int >= p.season_from
                   OR to_char(now() AT TIME ZONE 'Asia/Seoul', 'MMDD')::int <= p.season_to)))
$$;

-- random part = weighted pick among in-season parts
CREATE OR REPLACE FUNCTION open_baseball_box(p_box uuid, p_member uuid)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_gift_boxes;
  t text;
  pt text;
  dup boolean;
  roll double precision;
BEGIN
  SELECT * INTO r FROM baseball_gift_boxes WHERE id = p_box FOR UPDATE;
  IF NOT FOUND OR r.recipient_id <> p_member THEN RAISE EXCEPTION 'BOX_NOT_FOUND'; END IF;
  IF r.opened_at IS NOT NULL THEN RETURN r; END IF;
  t := COALESCE(r.preset_team, (ARRAY['lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom'])[1 + floor(random() * 10)::int]);
  pt := r.preset_part;
  IF pt IS NULL THEN
    roll := random();
    SELECT x.part INTO pt FROM (
      SELECT part, sum(weight) OVER (ORDER BY sort, part) AS cum, sum(weight) OVER () AS total
        FROM baseball_parts_in_season()
    ) x
     WHERE x.cum > roll * x.total
     ORDER BY x.cum
     LIMIT 1;
  END IF;
  IF pt IS NULL THEN pt := 'cap'; END IF;
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

REVOKE ALL ON FUNCTION baseball_parts_in_season() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION baseball_parts_in_season() TO authenticated;
