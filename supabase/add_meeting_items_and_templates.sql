-- 회의록에 결정사항/액션아이템, 회의 템플릿 추가.

CREATE TABLE team_log_meeting_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES team_log_meetings(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'action' CHECK (kind IN ('decision', 'action')),
  content    text NOT NULL,
  owner      text NOT NULL DEFAULT '',
  due_date   date,
  done       boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_meeting_templates (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name               text NOT NULL,
  title_prefix       text NOT NULL DEFAULT '',
  content_template   text NOT NULL DEFAULT '',
  default_attendees  text NOT NULL DEFAULT '',
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE team_log_meeting_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_meeting_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_meeting_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_meeting_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_log_meeting_items, team_log_meeting_templates TO service_role, authenticated;

CREATE INDEX team_log_meeting_items_meeting_idx ON team_log_meeting_items (meeting_id, sort_order);
