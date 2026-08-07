-- HRM 초기 스키마. 이 프로젝트는 HRM 전용이라, 로그인한 사람은 전부 팀원으로 간주해도 안전함
-- (jin-dashboard와 완전히 다른 프로젝트라 교차 접근 위험 없음). 그래서 RLS는 authenticated 전체 허용.

CREATE TABLE team_log_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#4C7FE0',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES team_log_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hold', 'done')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_subtasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES team_log_items(id) ON DELETE CASCADE,
  author text NOT NULL,
  entry_type text NOT NULL DEFAULT '업무기록' CHECK (entry_type IN ('업무기록', '보고일정')),
  entry_date date NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_meetings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  meeting_date date NOT NULL,
  attendees text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_schedule (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  event_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  tag text,
  source_type text CHECK (source_type IN ('item', 'subtask', 'meeting')),
  source_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_members  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_groups   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_items    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_subtasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_notes    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_members  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_items_group_idx    ON team_log_items (group_id, sort_order);
CREATE INDEX team_log_subtasks_item_idx  ON team_log_subtasks (item_id, sort_order);
CREATE INDEX team_log_subtasks_date_idx  ON team_log_subtasks (entry_date DESC);
CREATE INDEX team_log_meetings_date_idx  ON team_log_meetings (meeting_date DESC);
CREATE INDEX team_log_schedule_date_idx  ON team_log_schedule (event_date);
