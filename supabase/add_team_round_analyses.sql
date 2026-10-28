-- U2-bis: external LLM analysis versions per closed round (team_round_analyses). Safe to re-run.
-- Requires: add_auth_identity.sql, add_team_rounds.sql.
-- Rules
--   * Never touches raw responses (team_responses) or round aggregates (team_rounds.result); analyses are stored separately as versions.
--   * Edit = add a new version (content never changes). Only status moves: draft -> published (previous published -> superseded) / draft or published -> withdrawn.
--   * "published" means the lead approved showing the text to the team. It is NOT an official team agreement or a verified result (UI rule).
--   * Who wrote / published / withdrew is recorded (created_by, published_by, withdrawn_by); only a member with role = lead may act (checked here and in the API).
--   * Browsers cannot read or write this table; /api/team-rounds/[id]/analyses (server, service role) checks the lead role and visibility.
-- The Supabase SQL editor breaks statements on the less-than character, so comparisons use only ">" and "!=".
-- Rollback: rollback_team_round_analyses.sql

CREATE TABLE IF NOT EXISTS team_round_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES team_rounds(id) ON DELETE RESTRICT,
  version int NOT NULL CHECK (version > 0),
  source text NOT NULL CHECK (length(trim(source)) > 0),
  content text NOT NULL CHECK (length(trim(content)) > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded', 'withdrawn')),
  based_on uuid REFERENCES team_round_analyses(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  withdrawn_at timestamptz,
  withdrawn_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  UNIQUE (round_id, version)
);

ALTER TABLE team_round_analyses ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE team_round_analyses ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES members(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS team_round_analyses_one_published ON team_round_analyses (round_id) WHERE status = 'published';

ALTER TABLE team_round_analyses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON team_round_analyses FROM anon;

REVOKE ALL ON team_round_analyses FROM authenticated;

GRANT ALL ON team_round_analyses TO service_role;

-- Content, round, version, author and base never change; rows cannot be deleted; status only moves forward;
-- publish/withdraw stamps can only be written together with the matching status change.
CREATE OR REPLACE FUNCTION team_round_analyses_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_round_analyses: versions are kept as history and cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.source IS DISTINCT FROM OLD.source OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.based_on IS DISTINCT FROM OLD.based_on
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team_round_analyses: a saved version cannot be edited - add a new version' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status IN ('published', 'withdrawn'))
    OR (OLD.status = 'published' AND NEW.status IN ('superseded', 'withdrawn'))) THEN
    RAISE EXCEPTION 'team_round_analyses: status % cannot change to %', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  IF (NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by)
     AND NOT (OLD.status = 'draft' AND NEW.status = 'published') THEN
    RAISE EXCEPTION 'team_round_analyses: publish stamp only changes when a draft is published' USING ERRCODE = '42501';
  END IF;
  IF (NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by)
     AND NOT (NEW.status = 'withdrawn' AND OLD.status != 'withdrawn') THEN
    RAISE EXCEPTION 'team_round_analyses: withdraw stamp only changes when a version is withdrawn' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_round_analyses_guard ON team_round_analyses;

CREATE TRIGGER team_round_analyses_guard BEFORE UPDATE OR DELETE ON team_round_analyses
  FOR EACH ROW EXECUTE FUNCTION team_round_analyses_guard();

-- Older signatures from the first draft of this file (never applied in production; harmless if absent).
DROP FUNCTION IF EXISTS team_analysis_publish(uuid);

DROP FUNCTION IF EXISTS team_analysis_withdraw(uuid);

CREATE OR REPLACE FUNCTION team_analysis_require_lead(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM members WHERE id = p_actor AND role = 'lead') THEN
    RAISE EXCEPTION 'not_lead' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Add a new version (draft), closed rounds only. The round row is locked while numbering.
CREATE OR REPLACE FUNCTION team_analysis_add(p_round uuid, p_source text, p_content text, p_based_on uuid, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r team_rounds%ROWTYPE;
  nv int;
  aid uuid;
BEGIN
  PERFORM team_analysis_require_lead(p_actor);
  SELECT * INTO r FROM team_rounds WHERE id = p_round FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.closed_at IS NULL THEN RAISE EXCEPTION 'round_not_closed' USING ERRCODE = '42501'; END IF;
  IF p_based_on IS NOT NULL AND NOT EXISTS (SELECT 1 FROM team_round_analyses WHERE id = p_based_on AND round_id = p_round) THEN
    RAISE EXCEPTION 'based_on_mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO nv FROM team_round_analyses WHERE round_id = p_round;
  INSERT INTO team_round_analyses (round_id, version, source, content, based_on, created_by)
  VALUES (p_round, nv, trim(p_source), p_content, p_based_on, p_actor)
  RETURNING id INTO aid;
  RETURN aid;
END;
$$;

-- Publish approval: one draft becomes the current published text; the previous published one becomes superseded (kept).
CREATE OR REPLACE FUNCTION team_analysis_publish(p_id uuid, p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a team_round_analyses%ROWTYPE;
BEGIN
  PERFORM team_analysis_require_lead(p_actor);
  SELECT * INTO a FROM team_round_analyses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF a.status != 'draft' THEN RETURN 'not_draft'; END IF;
  UPDATE team_round_analyses SET status = 'superseded' WHERE round_id = a.round_id AND status = 'published';
  UPDATE team_round_analyses SET status = 'published', published_at = now(), published_by = p_actor WHERE id = p_id;
  RETURN 'published';
END;
$$;

-- Withdraw a draft or the current published text (kept as history).
CREATE OR REPLACE FUNCTION team_analysis_withdraw(p_id uuid, p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a team_round_analyses%ROWTYPE;
BEGIN
  PERFORM team_analysis_require_lead(p_actor);
  SELECT * INTO a FROM team_round_analyses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF a.status NOT IN ('draft', 'published') THEN RETURN 'not_withdrawable'; END IF;
  UPDATE team_round_analyses SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = p_actor WHERE id = p_id;
  RETURN 'withdrawn';
END;
$$;

REVOKE EXECUTE ON FUNCTION team_analysis_require_lead(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_analysis_add(uuid, text, text, uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_analysis_publish(uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_analysis_withdraw(uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION team_analysis_require_lead(uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION team_analysis_add(uuid, text, text, uuid, uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION team_analysis_publish(uuid, uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION team_analysis_withdraw(uuid, uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION team_analysis_require_lead(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION team_analysis_add(uuid, text, text, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION team_analysis_publish(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION team_analysis_withdraw(uuid, uuid) TO service_role;

-- Check: expect table_exists = true, rls_on = true, browser_select = false, functions = 4.
SELECT to_regclass('public.team_round_analyses') IS NOT NULL AS table_exists,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.team_round_analyses'::regclass) AS rls_on,
       has_table_privilege('authenticated', 'public.team_round_analyses', 'SELECT') AS browser_select,
       (SELECT count(*) FROM pg_proc WHERE proname IN ('team_analysis_add', 'team_analysis_publish', 'team_analysis_withdraw', 'team_analysis_require_lead')) AS functions;
