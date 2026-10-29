-- One-off: discard the TRIAL R0 (items r0-v2) so the redesigned R0 (r0-v3) can be opened. NOT RUN YET - run only after review.
-- Run in the HRM Supabase project (ref cevvalxwmvkmiohblthg). Check the project name in the SQL editor before running.
-- (team_rounds_one_baseline allows only one baseline round ever, so the trial one has to go before a v3 R0 can open.)
--
-- Target (read-only check on 2026-10-28): round c979bdd2-c202-4bfc-8f10-703592758fe1, baseline, r0-v2, open,
--   opened 2026-10-28 12:28 UTC by the team lead, 0 responses, 1 event (round_opened), 0 analyses.
--   The lead may have submitted a trial response since then - the script allows that case (lead's own response only).
--
-- What it removes: that round, its responses (lead's own trial response only), and its round_opened / response_submitted events.
-- What it keeps:   one new "correction" event recording the discarded round (id, version, opened at/by, response count,
--                  respondent ids, removed event ids/types, reason). Answer text is NOT copied into the record.
--                  Earlier correction records, other rounds, anonymous johari_picks / team_health_responses: untouched.
-- Safety (any failed check = ERROR, whole transaction rolls back, nothing changed):
--   * Only the round with exactly this id, and only if it is still the open r0-v2 baseline round.
--   * Every response must belong to the round's creator, and that member must still be the lead. Any other member's response = ABORT.
--   * Events on the round may only be round_opened (by the creator) and response_submitted (by the creator). Anything else = ABORT.
--   * Saved analysis versions, topic/experiment links = ABORT. Other tables that reference the round (FK RESTRICT) also make the delete fail.
--   * Re-run safe: if the round is already gone (or is no longer the open v2 trial), it only reports and changes nothing.
--   * History locks (triggers) are switched off only inside this transaction for these deletes and switched back on before commit.
--     ALTER TABLE takes an exclusive lock, so nothing else can write these tables meanwhile.
-- No DO blocks, no less-than characters, ASCII only (Supabase SQL editor).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.hrm_reset_trial_r0(p_round uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  r team_rounds%ROWTYPE;
  lead_role text;
  n_resp int;
  n_foreign int;
  n_bad_events int;
  n_analyses int := 0;
  respondents jsonb;
  removed jsonb;
BEGIN
  SELECT * INTO r FROM team_rounds WHERE id = p_round FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'nothing_to_do: round ' || p_round || ' does not exist (already discarded)';
  END IF;
  IF r.kind != 'baseline' OR r.items_version != 'r0-v2' OR r.closed_at IS NOT NULL THEN
    RETURN 'nothing_to_do: round ' || p_round || ' is ' || r.kind || ' / ' || r.items_version
      || CASE WHEN r.closed_at IS NULL THEN ' (open)' ELSE ' (closed)' END || ' - not the open v2 trial, left untouched';
  END IF;
  IF r.topic_id IS NOT NULL OR r.experiment_id IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: round % is linked to a topic/experiment - nothing was changed', r.id;
  END IF;

  SELECT role INTO lead_role FROM members WHERE id = r.created_by;
  IF lead_role IS DISTINCT FROM 'lead' THEN
    RAISE EXCEPTION 'ABORT: round creator % is not the lead (role %) - nothing was changed', r.created_by, lead_role;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE member_id != r.created_by) INTO n_resp, n_foreign FROM team_responses WHERE round_id = r.id;
  IF n_foreign > 0 THEN
    RAISE EXCEPTION 'ABORT: round % has % response(s) from members other than the lead - real data, nothing was changed', r.id, n_foreign;
  END IF;
  IF n_resp > 1 THEN
    RAISE EXCEPTION 'ABORT: round % has % responses (expected at most the lead''s one) - nothing was changed', r.id, n_resp;
  END IF;

  SELECT count(*) INTO n_bad_events FROM team_events e
   WHERE e.round_id = r.id
     AND NOT (e.type = 'round_opened' AND e.actor_id = r.created_by)
     AND NOT (e.type = 'response_submitted' AND e.member_id = r.created_by AND e.actor_id = r.created_by);
  IF n_bad_events > 0 THEN
    RAISE EXCEPTION 'ABORT: round % has % event(s) other than the lead''s round_opened / response_submitted - nothing was changed', r.id, n_bad_events;
  END IF;

  IF to_regclass('public.team_round_analyses') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM team_round_analyses WHERE round_id = $1' INTO n_analyses USING r.id;
    IF n_analyses > 0 THEN
      RAISE EXCEPTION 'ABORT: round % has % saved analysis version(s) - nothing was changed', r.id, n_analyses;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(member_id), '[]'::jsonb) INTO respondents FROM team_responses WHERE round_id = r.id;
  -- record only ids, types, times and actors of removed events (their payloads hold counts, not answers)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'at', e.at, 'actor_id', e.actor_id) ORDER BY e.id), '[]'::jsonb)
    INTO removed FROM team_events e WHERE e.round_id = r.id;

  INSERT INTO team_events (type, actor_id, round_id, dedupe_key, payload)
  VALUES ('correction', NULL, NULL, 'discard_trial_round:' || r.id,
          jsonb_build_object('action', 'discard_trial_round', 'round_id', r.id, 'kind', r.kind, 'items_version', r.items_version,
                             'opened_at', r.opened_at, 'opened_by', r.created_by,
                             'responses', n_resp, 'respondents', respondents,
                             'reason', 'trial R0 answered only by the lead (or not at all); replaced by the redesigned r0-v3 round',
                             'removed_events', removed));

  ALTER TABLE team_events DISABLE TRIGGER team_events_guard;
  ALTER TABLE team_responses DISABLE TRIGGER team_responses_guard;
  ALTER TABLE team_rounds DISABLE TRIGGER team_rounds_guard;
  DELETE FROM team_events WHERE round_id = r.id AND type IN ('round_opened', 'response_submitted');
  DELETE FROM team_responses WHERE round_id = r.id AND member_id = r.created_by;
  DELETE FROM team_rounds WHERE id = r.id;
  ALTER TABLE team_rounds ENABLE TRIGGER team_rounds_guard;
  ALTER TABLE team_responses ENABLE TRIGGER team_responses_guard;
  ALTER TABLE team_events ENABLE TRIGGER team_events_guard;

  RETURN 'discarded: round ' || r.id || ' (r0-v2 trial, ' || n_resp || ' lead response(s))';
END;
$$;

SELECT pg_temp.hrm_reset_trial_r0('c979bdd2-c202-4bfc-8f10-703592758fe1') AS result;

DROP FUNCTION pg_temp.hrm_reset_trial_r0(uuid);

COMMIT;

-- Check: expect baseline_rounds = 0, open_rounds = 0, guards_enabled = 3, trial_discard_records = 1, earlier_discard_records = 1.
SELECT (SELECT count(*) FROM team_rounds WHERE kind = 'baseline') AS baseline_rounds,
       (SELECT count(*) FROM team_rounds WHERE closed_at IS NULL) AS open_rounds,
       (SELECT count(*) FROM team_responses WHERE round_id = 'c979bdd2-c202-4bfc-8f10-703592758fe1') AS trial_responses_left,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('team_rounds_guard', 'team_responses_guard', 'team_events_guard') AND tgenabled = 'O') AS guards_enabled,
       (SELECT count(*) FROM team_events WHERE type = 'correction' AND payload ->> 'action' = 'discard_trial_round') AS trial_discard_records,
       (SELECT count(*) FROM team_events WHERE type = 'correction' AND payload ->> 'action' = 'discard_unused_round') AS earlier_discard_records;
