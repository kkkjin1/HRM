-- One-off: discard the R0 that was opened by mistake on 2026-10-28 (items r0-v1, 0 responses) so a new R0 (r0-v2) can be opened.
-- (team_rounds_one_baseline allows only one baseline round ever, so the unused one has to go.)
--
-- What it removes: exactly that one round row and its single "round_opened" event. Nothing else.
-- What it keeps:   a new "correction" event that records the discarded round (id, items version, opened at/by, reason),
--                  so the history still shows that an R0 was opened and discarded.
-- Safety:
--   * Target = the baseline round that is still open and uses items r0-v1. A v2 or closed round is never touched.
--   * ABORTS (error, nothing changed) if the round has any response, any event other than round_opened, or any saved analysis.
--   * Re-run safe: when the target is already gone, or the baseline is now a v2 / closed round, it only reports and changes nothing.
--   * Whole file runs in one transaction. The two history locks (triggers) are switched off only inside it, for these two deletes,
--     and switched back on before commit. On any error everything rolls back, locks included.
--     ALTER TABLE takes an exclusive table lock, so nothing else can write these tables while the locks are off.
-- No DO blocks, no less-than characters, ASCII only (Supabase SQL editor).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.hrm_reset_unused_r0() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  r team_rounds%ROWTYPE;
  n_resp int;
  n_other int;
  n_analyses int := 0;
  opened jsonb;
BEGIN
  SELECT * INTO r FROM team_rounds WHERE kind = 'baseline' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'nothing_to_do: no baseline round (already discarded)';
  END IF;
  IF r.closed_at IS NOT NULL OR r.items_version != 'r0-v1' THEN
    RETURN 'nothing_to_do: baseline round ' || r.id || ' is ' || r.items_version || CASE WHEN r.closed_at IS NULL THEN ' (open)' ELSE ' (closed)' END || ' - not the accidental v1 round, left untouched';
  END IF;

  SELECT count(*) INTO n_resp FROM team_responses WHERE round_id = r.id;
  IF n_resp > 0 THEN
    RAISE EXCEPTION 'ABORT: round % already has % response(s) - nothing was changed', r.id, n_resp;
  END IF;
  SELECT count(*) INTO n_other FROM team_events WHERE round_id = r.id AND type != 'round_opened';
  IF n_other > 0 THEN
    RAISE EXCEPTION 'ABORT: round % has % event(s) besides round_opened - nothing was changed', r.id, n_other;
  END IF;
  IF to_regclass('public.team_round_analyses') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM team_round_analyses WHERE round_id = $1' INTO n_analyses USING r.id;
    IF n_analyses > 0 THEN
      RAISE EXCEPTION 'ABORT: round % has % saved analysis version(s) - nothing was changed', r.id, n_analyses;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'actor_id', e.actor_id, 'payload', e.payload)), '[]'::jsonb)
    INTO opened FROM team_events e WHERE e.round_id = r.id;

  INSERT INTO team_events (type, actor_id, round_id, dedupe_key, payload)
  VALUES ('correction', NULL, NULL, 'discard_unused_round:' || r.id,
          jsonb_build_object('action', 'discard_unused_round', 'round_id', r.id, 'kind', r.kind, 'items_version', r.items_version,
                             'opened_at', r.opened_at, 'opened_by', r.created_by, 'responses', 0,
                             'reason', 'opened by mistake on 2026-10-28; no responses; replaced by an r0-v2 round',
                             'removed_events', opened));

  ALTER TABLE team_events DISABLE TRIGGER team_events_guard;
  ALTER TABLE team_rounds DISABLE TRIGGER team_rounds_guard;
  DELETE FROM team_events WHERE round_id = r.id AND type = 'round_opened';
  DELETE FROM team_rounds WHERE id = r.id;
  ALTER TABLE team_rounds ENABLE TRIGGER team_rounds_guard;
  ALTER TABLE team_events ENABLE TRIGGER team_events_guard;

  RETURN 'discarded: round ' || r.id || ' (r0-v1, 0 responses)';
END;
$$;

SELECT pg_temp.hrm_reset_unused_r0() AS result;

DROP FUNCTION pg_temp.hrm_reset_unused_r0();

COMMIT;

-- Check: expect baseline_rounds = 0, guards_enabled = 2, discard_records = 1, other_rounds unchanged.
SELECT (SELECT count(*) FROM team_rounds WHERE kind = 'baseline') AS baseline_rounds,
       (SELECT count(*) FROM team_rounds WHERE kind != 'baseline') AS other_rounds,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('team_rounds_guard', 'team_events_guard') AND tgenabled = 'O') AS guards_enabled,
       (SELECT count(*) FROM team_events WHERE type = 'correction' AND payload ->> 'action' = 'discard_unused_round') AS discard_records;
