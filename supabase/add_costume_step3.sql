-- 2026-10-22 Costume step 3: effect items + record rewards. Safe to re-run. Run after add_costume_step2.sql.
-- Effect slot: notes (box, rare) / firework, confetti, ring (rewards). goldglove = acc slot reward.
-- Rewards have weight 0, so they never come out of random boxes. The claimant picks the team.
-- Conditions (must match REWARDS in src/lib/baseballGear.ts):
--   firework  : finished solo games, total homeruns >= 10
--   confetti  : playground days ended on the 'off' side (left work on time) >= 5
--   ring      : baseball tournament champion >= 1
--   goldglove : last month (KST) solo homerun leader (ties included, at least 1 homerun)
-- Each reward part can be claimed once per member (one team).

INSERT INTO baseball_parts (part, slot, sort, rarity, weight, season_from, season_to) VALUES
  ('goldglove', 'acc', 51, 'legend', 0, NULL, NULL),
  ('notes', 'effect', 60, 'rare', 4, NULL, NULL),
  ('firework', 'effect', 61, 'legend', 0, NULL, NULL),
  ('confetti', 'effect', 62, 'rare', 0, NULL, NULL),
  ('ring', 'effect', 63, 'legend', 0, NULL, NULL)
ON CONFLICT (part) DO UPDATE SET slot = EXCLUDED.slot, sort = EXCLUDED.sort, rarity = EXCLUDED.rarity,
  weight = EXCLUDED.weight, season_from = EXCLUDED.season_from, season_to = EXCLUDED.season_to;

CREATE OR REPLACE FUNCTION baseball_reward_progress(p_member uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m_start date := (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '1 month')::date;
  m_end date := date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')::date;
  hr int;
  offd int;
  titles int;
  mine int;
  top int;
BEGIN
  SELECT COALESCE(sum(homeruns), 0) INTO hr FROM baseball_plays WHERE member_id = p_member AND finished;
  SELECT count(*) INTO offd FROM playground_state WHERE member_id = p_member AND side = 'off';
  SELECT count(*) INTO titles FROM baseball_tournaments WHERE champion_id = p_member AND status = 'done';
  SELECT COALESCE(sum(homeruns), 0) INTO mine FROM baseball_plays
   WHERE member_id = p_member AND finished AND play_date >= m_start AND play_date < m_end;
  SELECT COALESCE(max(s), 0) INTO top FROM (
    SELECT sum(homeruns) AS s FROM baseball_plays
     WHERE finished AND play_date >= m_start AND play_date < m_end
     GROUP BY member_id
  ) x;
  RETURN jsonb_build_object(
    'homeruns', hr, 'off_days', offd, 'titles', titles,
    'last_month', to_char(m_start, 'YYYY-MM'), 'last_month_hr', mine, 'last_month_top', top,
    'last_month_leader', mine > 0 AND mine = top
  );
END
$$;

CREATE OR REPLACE FUNCTION claim_baseball_reward(p_member uuid, p_part text, p_team text)
RETURNS baseball_gear
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pr jsonb;
  ok boolean;
  r baseball_gear;
BEGIN
  IF p_team IS NULL OR p_team NOT IN ('lg','doosan','kia','samsung','ssg','lotte','hanwha','nc','kt','kiwoom') THEN RAISE EXCEPTION 'BAD_TEAM'; END IF;
  IF p_part NOT IN ('firework', 'confetti', 'ring', 'goldglove') THEN RAISE EXCEPTION 'BAD_PART'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('baseball_reward:' || p_member::text));
  IF EXISTS (SELECT 1 FROM baseball_gear WHERE member_id = p_member AND part = p_part) THEN RAISE EXCEPTION 'ALREADY_CLAIMED'; END IF;
  pr := baseball_reward_progress(p_member);
  ok := CASE p_part
    WHEN 'firework' THEN (pr ->> 'homeruns')::int >= 10
    WHEN 'confetti' THEN (pr ->> 'off_days')::int >= 5
    WHEN 'ring' THEN (pr ->> 'titles')::int >= 1
    WHEN 'goldglove' THEN (pr ->> 'last_month_leader')::boolean
    ELSE false
  END;
  IF NOT ok THEN RAISE EXCEPTION 'NOT_YET'; END IF;
  INSERT INTO baseball_gear (member_id, team, part) VALUES (p_member, p_team, p_part) RETURNING * INTO r;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION baseball_reward_progress(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION claim_baseball_reward(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION baseball_reward_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_baseball_reward(uuid, text, text) TO authenticated;
