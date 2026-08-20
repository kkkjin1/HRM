-- 구조요청(🆘) 버튼. 업무 중 막히면 날짜별로 도움을 요청하고, 팀원이 "내가 도와줄게"를
-- 누르면 claimed, 해결되면 resolved로 넘어간다. 프론트(components/HelpRequestPanel.tsx)에서
-- 날짜 네비게이션으로 하루 단위로 넘겨보며 과거 요청도 열람 가능.

CREATE TABLE help_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_date date NOT NULL,
  member_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'resolved')),
  claimed_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON help_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON help_requests TO service_role, authenticated;

CREATE INDEX help_requests_date_idx ON help_requests (request_date);

-- 구조요청/도움 상태가 실시간으로 반영되도록.
ALTER PUBLICATION supabase_realtime ADD TABLE help_requests;
