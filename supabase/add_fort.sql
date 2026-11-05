-- 2026-11-05 Fort battle (playground turn-based artillery). Run once in Supabase SQL Editor.
-- fort_profile: chosen fortress skin + win/loss record (one row per member).
-- fort_games: one row per (member, game id) - prevents double counting.
-- Only games with 2+ humans are recorded (CPU-only games do not count).
-- Writes only through security definer functions below. Skin unlock rules must match src/lib/fort.ts SKINS.

CREATE TABLE IF NOT EXISTS fort_profile (
  member_id  uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  skin       text NOT NULL DEFAULT 'desk',
  games      int NOT NULL DEFAULT 0,
  wins       int NOT NULL DEFAULT 0,
  losses     int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fort_games (
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  fid        text NOT NULL,
  result     text NOT NULL CHECK (result IN ('win', 'lose', 'draw')),
  humans     int NOT NULL,
  mode       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, fid)
);

ALTER TABLE fort_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE fort_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_all" ON fort_profile;
DROP POLICY IF EXISTS "read_all" ON fort_games;
CREATE POLICY "read_all" ON fort_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_all" ON fort_games FOR SELECT TO authenticated USING (true);
GRANT SELECT ON fort_profile, fort_games TO authenticated;
GRANT ALL ON fort_profile, fort_games TO service_role;

-- record one finished game. p_result: win / lose / draw. humans < 2 -> not recorded.
CREATE OR REPLACE FUNCTION fort_record(p_member uuid, p_fid text, p_result text, p_humans int, p_mode text)
RETURNS fort_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g fort_profile;
BEGIN
  IF p_result NOT IN ('win', 'lose', 'draw') THEN RAISE EXCEPTION 'BAD_RESULT %', p_result; END IF;
  INSERT INTO fort_profile (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  IF p_humans >= 2 THEN
    INSERT INTO fort_games (member_id, fid, result, humans, mode) VALUES (p_member, p_fid, p_result, p_humans, p_mode)
    ON CONFLICT (member_id, fid) DO NOTHING;
    IF FOUND THEN
      UPDATE fort_profile SET
        games = games + 1,
        wins = wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN p_result = 'lose' THEN 1 ELSE 0 END,
        updated_at = now()
      WHERE member_id = p_member;
    END IF;
  END IF;
  SELECT * INTO g FROM fort_profile WHERE member_id = p_member;
  RETURN g;
END
$$;

-- choose fortress skin (locked skins are refused). unlock: water 1 game, plant 5 games, copier 3 wins, server 10 wins.
CREATE OR REPLACE FUNCTION fort_set_skin(p_member uuid, p_skin text)
RETURNS fort_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g fort_profile;
BEGIN
  IF p_skin NOT IN ('desk', 'cabinet', 'water', 'plant', 'copier', 'server') THEN RAISE EXCEPTION 'UNKNOWN_SKIN %', p_skin; END IF;
  INSERT INTO fort_profile (member_id) VALUES (p_member) ON CONFLICT (member_id) DO NOTHING;
  SELECT * INTO g FROM fort_profile WHERE member_id = p_member FOR UPDATE;
  IF (p_skin = 'water' AND g.games < 1) OR (p_skin = 'plant' AND g.games < 5)
     OR (p_skin = 'copier' AND g.wins < 3) OR (p_skin = 'server' AND g.wins < 10) THEN
    RAISE EXCEPTION 'LOCKED_SKIN %', p_skin;
  END IF;
  UPDATE fort_profile SET skin = p_skin, updated_at = now() WHERE member_id = p_member RETURNING * INTO g;
  RETURN g;
END
$$;

REVOKE ALL ON FUNCTION fort_record(uuid, text, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fort_set_skin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fort_record(uuid, text, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fort_set_skin(uuid, text) TO authenticated;
