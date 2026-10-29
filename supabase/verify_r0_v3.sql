-- READ-ONLY checks for the r0-v3 rollout (no writes). Run in the HRM project (ref cevvalxwmvkmiohblthg).
-- r0-v3 needs NO schema change: answers / items / result are jsonb and the version lives in items_version
-- (round) + items_version (each response, checked equal by team_round_submit). This file only confirms the state.
-- No less-than characters (Supabase SQL editor).

-- 1) Rounds and their question versions. Before opening v3: no open round, no baseline (after reset_trial_r0_v2.sql).
SELECT id, kind, items_version, items ->> 'version' AS snapshot_version, opened_at, closed_at, cardinality(roster) AS roster_n,
       (SELECT count(*) FROM team_responses x WHERE x.round_id = r.id) AS responses
FROM team_rounds r ORDER BY opened_at;

-- 2) Every response uses its round's version (expect 0 rows).
SELECT x.round_id, x.member_id, x.items_version AS response_version, r.items_version AS round_version
FROM team_responses x JOIN team_rounds r ON r.id = x.round_id
WHERE x.items_version != r.items_version;

-- 3) v3 snapshot shape for v3 rounds (expect behavior_items = 12, friction_items = 4, has_health = false).
SELECT id, jsonb_array_length(items -> 'behavior' -> 'items') AS behavior_items, jsonb_array_length(items -> 'friction' -> 'items') AS friction_items,
       items ? 'health' AS has_health
FROM team_rounds WHERE items_version = 'r0-v3';

-- 4) History locks are on (expect 3) and the anonymous legacy data is untouched (compare with 15 / 3 on 2026-10-28).
SELECT (SELECT count(*) FROM pg_trigger WHERE tgname IN ('team_rounds_guard', 'team_responses_guard', 'team_events_guard') AND tgenabled = 'O') AS guards_enabled,
       (SELECT count(*) FROM johari_picks) AS anon_johari_rows,
       (SELECT count(*) FROM team_health_responses) AS anon_health_rows;

-- 5) Correction records (discarded R0s) - expect discard_unused_round 1, and discard_trial_round 1 after the reset.
SELECT payload ->> 'action' AS action, payload ->> 'round_id' AS round_id, payload ->> 'items_version' AS items_version, payload ->> 'responses' AS responses, at
FROM team_events WHERE type = 'correction' ORDER BY at;
