-- 회의 상세의 "회의 내용" 단일 textarea를 안건(agenda) + 팀원별 진행사항으로 나눈다.
-- 기존 content 값은 그대로 안건으로 옮겨서 내용 손실 없이 넘어가고, 이제 안 쓰는
-- content 컬럼은 뺀다.
ALTER TABLE team_log_meetings ADD COLUMN agenda text NOT NULL DEFAULT '';
UPDATE team_log_meetings SET agenda = content WHERE content <> '';
ALTER TABLE team_log_meetings DROP COLUMN content;

CREATE TABLE team_log_meeting_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES team_log_meetings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES team_log_members(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (meeting_id, member_id)
);

ALTER TABLE team_log_meeting_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_meeting_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_meeting_progress_meeting_idx ON team_log_meeting_progress (meeting_id);
