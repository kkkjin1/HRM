-- Meeting minutes optimistic concurrency control (agenda + member progress). Safe to re-run.
-- Function bodies use single quotes (no dollar quoting) so copy/paste through chat cannot break them.
-- Apply this BEFORE deploying the app code that reads these columns.
--
-- version is the OCC token. updated_at / updated_by are for the conflict UI only.
-- Agenda gets its own agenda_version so that editing title/date/attendees never conflicts with agenda saves.
-- Existing rows start at version 1. Unknown history stays NULL (shown as "unknown" in the UI).

ALTER TABLE team_log_meetings ADD COLUMN IF NOT EXISTS agenda_version integer NOT NULL DEFAULT 1;
ALTER TABLE team_log_meetings ADD COLUMN IF NOT EXISTS agenda_updated_at timestamptz;
ALTER TABLE team_log_meetings ADD COLUMN IF NOT EXISTS agenda_updated_by text;

ALTER TABLE team_log_meeting_progress ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE team_log_meeting_progress ADD COLUMN IF NOT EXISTS updated_by text;

-- Atomic compare-and-swap on agenda_version.
-- status: ok (saved) / conflict (version moved, latest row returned) / not_found (meeting deleted).
CREATE OR REPLACE FUNCTION save_meeting_agenda(p_meeting_id uuid, p_agenda text, p_expected_version integer, p_updated_by text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS '
DECLARE
  m team_log_meetings;
BEGIN
  UPDATE team_log_meetings
     SET agenda = p_agenda,
         agenda_version = agenda_version + 1,
         agenda_updated_at = now(),
         agenda_updated_by = p_updated_by
   WHERE id = p_meeting_id AND agenda_version = p_expected_version
  RETURNING * INTO m;
  IF NOT FOUND THEN
    SELECT * INTO m FROM team_log_meetings WHERE id = p_meeting_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(''status'', ''not_found'');
    END IF;
    RETURN jsonb_build_object(''status'', ''conflict'', ''agenda'', m.agenda, ''agenda_version'', m.agenda_version,
      ''agenda_updated_at'', m.agenda_updated_at, ''agenda_updated_by'', m.agenda_updated_by);
  END IF;
  RETURN jsonb_build_object(''status'', ''ok'', ''agenda'', m.agenda, ''agenda_version'', m.agenda_version,
    ''agenda_updated_at'', m.agenda_updated_at, ''agenda_updated_by'', m.agenda_updated_by);
END
';

-- Same idea per (meeting_id, member_id) row. p_expected_version = 0 means "I saw no row yet":
-- insert only if nobody created it in the meantime, otherwise conflict.
CREATE OR REPLACE FUNCTION save_meeting_progress(p_meeting_id uuid, p_member_id uuid, p_content text, p_expected_version integer, p_updated_by text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS '
DECLARE
  r team_log_meeting_progress;
BEGIN
  IF p_expected_version = 0 THEN
    INSERT INTO team_log_meeting_progress (meeting_id, member_id, content, version, updated_at, updated_by)
    VALUES (p_meeting_id, p_member_id, p_content, 1, now(), p_updated_by)
    ON CONFLICT (meeting_id, member_id) DO NOTHING
    RETURNING * INTO r;
  ELSE
    UPDATE team_log_meeting_progress
       SET content = p_content,
           version = version + 1,
           updated_at = now(),
           updated_by = p_updated_by
     WHERE meeting_id = p_meeting_id AND member_id = p_member_id AND version = p_expected_version
    RETURNING * INTO r;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO r FROM team_log_meeting_progress WHERE meeting_id = p_meeting_id AND member_id = p_member_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(''status'', ''not_found'');
    END IF;
    RETURN jsonb_build_object(''status'', ''conflict'', ''row'', to_jsonb(r));
  END IF;
  RETURN jsonb_build_object(''status'', ''ok'', ''row'', to_jsonb(r));
END
';

-- Server (service_role) only: updated_by must come from the verified session, never from a browser call.
REVOKE ALL ON FUNCTION save_meeting_agenda(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_meeting_progress(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_meeting_agenda(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION save_meeting_progress(uuid, uuid, text, integer, text) TO service_role;

-- PostgREST caches the schema; this makes the new functions/columns visible immediately.
NOTIFY pgrst, 'reload schema';
