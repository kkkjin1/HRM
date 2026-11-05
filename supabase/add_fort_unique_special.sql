-- 2026-11-05 Fort battle: unique special weapons. Each of the 8 specials belongs to at most one member, forever.
-- A member without a special opens a "box" (fort_draw_special) and gets a random one among the unowned.
-- Replaces the earlier pick-any approach (add_fort_special.sql): its column and function are removed here.
-- Special keys must match src/lib/fort.ts SPECIAL_ORDER.

CREATE TABLE IF NOT EXISTS fort_specials (
  special    text PRIMARY KEY CHECK (special IN ('rain', 'shield', 'homing', 'bolt', 'quake', 'freeze', 'swap', 'vortex')),
  member_id  uuid NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fort_specials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON fort_specials;
CREATE POLICY "read_all" ON fort_specials FOR SELECT TO authenticated USING (true);
GRANT SELECT ON fort_specials TO authenticated;
GRANT ALL ON fort_specials TO service_role;

-- open the box: returns my special (existing one if I already have it).
CREATE OR REPLACE FUNCTION fort_draw_special(p_member uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member) THEN RAISE EXCEPTION 'UNKNOWN_MEMBER'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fort_specials'));
  SELECT special INTO s FROM fort_specials WHERE member_id = p_member;
  IF s IS NOT NULL THEN RETURN s; END IF;
  SELECT k INTO s
  FROM unnest(ARRAY['rain', 'shield', 'homing', 'bolt', 'quake', 'freeze', 'swap', 'vortex']) AS k
  WHERE k NOT IN (SELECT special FROM fort_specials)
  ORDER BY random() LIMIT 1;
  IF s IS NULL THEN RAISE EXCEPTION 'NO_SPECIAL_LEFT'; END IF;
  INSERT INTO fort_specials (special, member_id) VALUES (s, p_member);
  RETURN s;
END
$$;

REVOKE ALL ON FUNCTION fort_draw_special(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fort_draw_special(uuid) TO authenticated;

-- remove the earlier pick-any special (nobody can choose freely any more)
DROP FUNCTION IF EXISTS fort_set_special(uuid, text);
ALTER TABLE fort_profile DROP COLUMN IF EXISTS special;
