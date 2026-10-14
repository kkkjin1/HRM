-- Team-wide URL shortcuts shown in the header "🔗 바로가기" popover. Safe to re-run.
-- Apply this BEFORE deploying the app code that uses this table.
-- group_name is free text ('' = 기타) so new groups need no schema change.

CREATE TABLE IF NOT EXISTS team_log_quick_links (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL DEFAULT '',
  url        text NOT NULL DEFAULT '',
  group_name text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_quick_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_log_quick_links;
CREATE POLICY "auth_all" ON team_log_quick_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_log_quick_links TO service_role, authenticated;
