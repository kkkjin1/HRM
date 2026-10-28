-- Rollback for add_team_round_analyses.sql. Roll the Vercel deployment back FIRST, then run this. Safe to re-run.
-- Part 1 (default): drop the functions, so new analyses can no longer be saved, published or withdrawn.
--   The table and every saved version stay (history is kept). Raw responses and round aggregates were never touched.
-- Part 2 (optional): to remove the table as well, uncomment it. Saved external analyses are then lost permanently.

DROP FUNCTION IF EXISTS team_analysis_add(uuid, text, text, uuid, uuid);

DROP FUNCTION IF EXISTS team_analysis_publish(uuid, uuid);

DROP FUNCTION IF EXISTS team_analysis_withdraw(uuid, uuid);

DROP FUNCTION IF EXISTS team_analysis_publish(uuid);

DROP FUNCTION IF EXISTS team_analysis_withdraw(uuid);

DROP FUNCTION IF EXISTS team_analysis_require_lead(uuid);

-- Check: expect functions = 0.
SELECT (SELECT count(*) FROM pg_proc WHERE proname IN ('team_analysis_add', 'team_analysis_publish', 'team_analysis_withdraw', 'team_analysis_require_lead')) AS functions;

-- Part 2 (optional)
-- DROP TABLE IF EXISTS team_round_analyses;
-- DROP FUNCTION IF EXISTS team_round_analyses_guard();
