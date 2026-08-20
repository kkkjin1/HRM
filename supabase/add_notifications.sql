-- 알림: 오늘의 한마디/낙서보드 반응, 일정 배정을 우측 상단 알림창에 띄운다.
-- members(fun 스키마)를 수신자로 참조 — 알림 트리거들(반응, 일정 배정)이 이미
-- members.id를 "나"로 다루고 있어서 team_log_*가 아니라 이쪽에 붙인다.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       text NOT NULL,             -- message_reaction | doodle_reaction | schedule_assigned
  body       text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}',  -- { section, date } 등 클릭 시 이동 정보
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON notifications TO service_role, authenticated;

CREATE INDEX notifications_member_idx ON notifications (member_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
