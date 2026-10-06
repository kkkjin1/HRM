-- Per-member work report rows for the meeting drawer ("업무보고"). Safe to re-run.
-- Function bodies use single quotes (no dollar quoting) so copy/paste through chat cannot break them.
-- Apply this BEFORE deploying the app code that uses these tables.
--
-- team_log_report_items: one row per ongoing task of a member. It is NOT copied per meeting:
--   a meeting dated D shows rows with start_date <= D and (closed_on IS NULL OR closed_on >= D).
-- team_log_report_updates: one cell per (item, meeting) holding that meeting's update and feedback.
--   update_text and feedback have separate versions (OCC) so writing one never conflicts with the other.
--   version 0 = never saved.

CREATE TABLE IF NOT EXISTS team_log_report_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES team_log_members(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  start_date date NOT NULL,
  closed_on  date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_log_report_updates (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id          uuid NOT NULL REFERENCES team_log_report_items(id) ON DELETE CASCADE,
  meeting_id       uuid NOT NULL REFERENCES team_log_meetings(id) ON DELETE CASCADE,
  update_text      text NOT NULL DEFAULT '',
  update_version   integer NOT NULL DEFAULT 0,
  feedback         text NOT NULL DEFAULT '',
  feedback_version integer NOT NULL DEFAULT 0,
  updated_at       timestamptz DEFAULT now(),
  updated_by       text,
  UNIQUE (item_id, meeting_id)
);

ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS report_item_id uuid REFERENCES team_log_report_items(id) ON DELETE SET NULL;

ALTER TABLE team_log_report_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_report_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_log_report_items;
DROP POLICY IF EXISTS "auth_all" ON team_log_report_updates;
CREATE POLICY "auth_all" ON team_log_report_items   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_report_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_log_report_items, team_log_report_updates TO service_role, authenticated;

CREATE INDEX IF NOT EXISTS team_log_report_items_member_idx  ON team_log_report_items (member_id, sort_order);
CREATE INDEX IF NOT EXISTS team_log_report_updates_meeting_idx ON team_log_report_updates (meeting_id);
CREATE INDEX IF NOT EXISTS team_log_meeting_items_report_item_idx ON team_log_meeting_items (report_item_id);

-- Atomic compare-and-swap on one field of a (item, meeting) cell.
-- p_field: 'update' or 'feedback'. status: ok / conflict (latest row returned) / not_found (item or meeting deleted).
CREATE OR REPLACE FUNCTION save_report_update(p_item_id uuid, p_meeting_id uuid, p_field text, p_content text, p_expected_version integer, p_updated_by text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS '
DECLARE
  r team_log_report_updates;
BEGIN
  IF p_field NOT IN (''update'', ''feedback'') THEN
    RAISE EXCEPTION ''invalid field %'', p_field;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_log_report_items WHERE id = p_item_id)
     OR NOT EXISTS (SELECT 1 FROM team_log_meetings WHERE id = p_meeting_id) THEN
    RETURN jsonb_build_object(''status'', ''not_found'');
  END IF;

  INSERT INTO team_log_report_updates (item_id, meeting_id)
  VALUES (p_item_id, p_meeting_id)
  ON CONFLICT (item_id, meeting_id) DO NOTHING;

  IF p_field = ''update'' THEN
    UPDATE team_log_report_updates
       SET update_text = p_content, update_version = update_version + 1, updated_at = now(), updated_by = p_updated_by
     WHERE item_id = p_item_id AND meeting_id = p_meeting_id AND update_version = p_expected_version
    RETURNING * INTO r;
  ELSE
    UPDATE team_log_report_updates
       SET feedback = p_content, feedback_version = feedback_version + 1, updated_at = now(), updated_by = p_updated_by
     WHERE item_id = p_item_id AND meeting_id = p_meeting_id AND feedback_version = p_expected_version
    RETURNING * INTO r;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO r FROM team_log_report_updates WHERE item_id = p_item_id AND meeting_id = p_meeting_id;
    RETURN jsonb_build_object(''status'', ''conflict'', ''row'', to_jsonb(r));
  END IF;
  RETURN jsonb_build_object(''status'', ''ok'', ''row'', to_jsonb(r));
END
';

-- Server (service_role) only: updated_by must come from the verified session.
REVOKE ALL ON FUNCTION save_report_update(uuid, uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_report_update(uuid, uuid, text, text, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ===== Run separately (step 2): realtime. Re-running this line errors if already added; that is harmless. =====
-- ALTER PUBLICATION supabase_realtime ADD TABLE team_log_report_items, team_log_report_updates;
