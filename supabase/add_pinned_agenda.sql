-- Pinned agenda rows ("고정 안건") for the meeting detail agenda table. Safe to re-run.
-- Apply this BEFORE deploying the app code that reads the pinned column.
--
-- A pinned row is an ordinary agenda row (kind = 'agenda') that the table shows on top with no done checkbox.
-- "고정 해제" reuses closed_on exactly like done: the row stays on that meeting and disappears from the next one.

ALTER TABLE team_log_report_items ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

ALTER TABLE team_log_report_items DROP CONSTRAINT IF EXISTS team_log_report_items_pinned_check;
ALTER TABLE team_log_report_items ADD CONSTRAINT team_log_report_items_pinned_check
  CHECK (pinned = false OR kind = 'agenda');

-- Seed the two sections that used to be hard-coded in the meeting drawer, starting from the 2026-10-14 meeting.
-- Old 근태 / 계약휴직 memos stay as they are (shown in each meeting's memo section).
INSERT INTO team_log_report_items (kind, member_id, title, start_date, sort_order, pinned)
SELECT 'agenda', NULL, v.title, DATE '2026-10-14', v.ord, true
FROM (VALUES ('근태', -2), ('계약/휴직', -1)) AS v(title, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM team_log_report_items r WHERE r.kind = 'agenda' AND r.pinned AND r.title = v.title AND r.closed_on IS NULL
);

NOTIFY pgrst, 'reload schema';

-- Check after running (expect 2 rows):
-- SELECT title, start_date, closed_on, pinned FROM team_log_report_items WHERE pinned;
