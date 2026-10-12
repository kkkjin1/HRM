-- Agenda table for the meeting drawer ("안건 표"). Safe to re-run.
-- Reuses team_log_report_items / team_log_report_updates (same carry-over, per-meeting cells, OCC, action links):
--   kind = 'report' : per-member work report rows (existing rows keep this via the default)
--   kind = 'agenda' : meeting agenda rows; member_id = owner (optional, may be NULL)
-- Apply this BEFORE deploying the app code that reads the kind column.

ALTER TABLE team_log_report_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'report';

ALTER TABLE team_log_report_items DROP CONSTRAINT IF EXISTS team_log_report_items_kind_check;
ALTER TABLE team_log_report_items ADD CONSTRAINT team_log_report_items_kind_check
  CHECK (kind IN ('report', 'agenda'));

-- Work report rows still always have a member; agenda rows may have no owner.
ALTER TABLE team_log_report_items ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE team_log_report_items DROP CONSTRAINT IF EXISTS team_log_report_items_member_check;
ALTER TABLE team_log_report_items ADD CONSTRAINT team_log_report_items_member_check
  CHECK (kind = 'agenda' OR member_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS team_log_report_items_kind_idx ON team_log_report_items (kind, sort_order);

NOTIFY pgrst, 'reload schema';

-- Check after running (expect: every existing row is 'report', none with NULL member):
-- SELECT kind, count(*), count(*) FILTER (WHERE member_id IS NULL) AS no_member FROM team_log_report_items GROUP BY kind;
