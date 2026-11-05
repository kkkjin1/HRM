-- 2026-11-05 Fort battle: remove the 'shield' special (8 -> 7 specials).
-- Whoever owned 'shield' loses it and can open the box again (gets one of the remaining unowned specials).
-- Special keys must match src/lib/fort.ts SPECIAL_ORDER.

DELETE FROM fort_specials WHERE special = 'shield';

ALTER TABLE fort_specials DROP CONSTRAINT IF EXISTS fort_specials_special_check;
ALTER TABLE fort_specials ADD CONSTRAINT fort_specials_special_check
  CHECK (special IN ('rain', 'homing', 'bolt', 'quake', 'freeze', 'swap', 'vortex'));

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
  FROM unnest(ARRAY['rain', 'homing', 'bolt', 'quake', 'freeze', 'swap', 'vortex']) AS k
  WHERE k NOT IN (SELECT special FROM fort_specials)
  ORDER BY random() LIMIT 1;
  IF s IS NULL THEN RAISE EXCEPTION 'NO_SPECIAL_LEFT'; END IF;
  INSERT INTO fort_specials (special, member_id) VALUES (s, p_member);
  RETURN s;
END
$$;

REVOKE ALL ON FUNCTION fort_draw_special(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fort_draw_special(uuid) TO authenticated;
