-- Baseball one-day trial pass ("ilil-gwon"). Safe to re-run.
-- Admin (ji.kim@egnis.kr) gives a member any item (team x part) for today only.
-- The item is equipped right away; at KST midnight it expires and the screen falls back to what that slot had before (prev_item).
-- Expiry is applied when drawing (src/lib/baseballGear.ts applyTrials), so no cron job is needed.
-- Must match GEAR_PARTS / KBO_TEAMS in src/lib/baseballGear.ts.

CREATE TABLE IF NOT EXISTS baseball_gear_trials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  team       text NOT NULL,
  part       text NOT NULL REFERENCES baseball_parts(part),
  prev_item  jsonb,
  granted_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS baseball_gear_trials_member_idx ON baseball_gear_trials (member_id);

ALTER TABLE baseball_gear_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON baseball_gear_trials;
CREATE POLICY "read_all" ON baseball_gear_trials FOR SELECT TO authenticated USING (true);
GRANT SELECT ON baseball_gear_trials TO authenticated;
GRANT ALL ON baseball_gear_trials TO service_role;

-- p_team / p_part NULL = random (any part in the catalog, rewards and seasonal ones included)
CREATE OR REPLACE FUNCTION admin_grant_baseball_trial(p_admin uuid, p_member uuid, p_team text, p_part text)
RETURNS baseball_gear_trials
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  pt text;
  sl text;
  prev jsonb;
  r baseball_gear_trials;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  t := COALESCE(p_team, (ARRAY['lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom'])[1 + floor(random() * 10)::int]);
  IF t NOT IN ('lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom') THEN RAISE EXCEPTION 'BAD_TEAM'; END IF;
  pt := COALESCE(p_part, (SELECT part FROM baseball_parts ORDER BY random() LIMIT 1));
  SELECT slot INTO sl FROM baseball_parts WHERE part = pt;
  IF sl IS NULL THEN RAISE EXCEPTION 'BAD_PART'; END IF;

  INSERT INTO baseball_equip (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT slots -> sl INTO prev FROM baseball_equip WHERE member_id = p_member FOR UPDATE;

  INSERT INTO baseball_gear_trials (member_id, team, part, prev_item, granted_by, expires_at)
  VALUES (p_member, t, pt, prev, p_admin,
          (((now() AT TIME ZONE 'Asia/Seoul')::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul'))
  RETURNING * INTO r;

  UPDATE baseball_equip
     SET slots = slots || jsonb_build_object(sl, jsonb_build_object('part', pt, 'team', t)),
         cap     = CASE WHEN sl = 'head' THEN t ELSE cap END,
         uniform = CASE WHEN sl = 'top' THEN t ELSE uniform END,
         bat     = CASE WHEN sl = 'hand' THEN (CASE WHEN pt = 'bat' THEN t END) ELSE bat END,
         updated_at = now()
   WHERE member_id = p_member;
  RETURN r;
END
$$;

-- equip: owned gear OR an unexpired trial
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
    ) AND NOT EXISTS (
      SELECT 1 FROM baseball_gear_trials WHERE member_id = p_member AND team = p_team AND part = p_part AND expires_at > now()
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

-- widget background: a team from owned gear OR an unexpired trial
CREATE OR REPLACE FUNCTION set_baseball_background(p_member uuid, p_team text)
RETURNS baseball_equip
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_equip;
BEGIN
  IF p_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM baseball_gear WHERE member_id = p_member AND team = p_team
  ) AND NOT EXISTS (
    SELECT 1 FROM baseball_gear_trials WHERE member_id = p_member AND team = p_team AND expires_at > now()
  ) THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;
  INSERT INTO baseball_equip (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  UPDATE baseball_equip SET bg_team = p_team, updated_at = now() WHERE member_id = p_member
  RETURNING * INTO r;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION admin_grant_baseball_trial(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_grant_baseball_trial(uuid, uuid, text, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_gear_trials;
