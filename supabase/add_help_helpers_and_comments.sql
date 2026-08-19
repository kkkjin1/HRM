-- 구조요청(help_requests)을 "1건당 도우미 1명 독점(claimed_by)" 구조에서 "여러 명이
-- 다 같이 도와줄 수 있는" 구조로 바꾼다. 기존 claimed_by는 help_helpers로 백필하고,
-- status는 open/resolved 2단계만 남긴다(claimed 중간 상태 제거 — 이제 "도운 사람이
-- 있는지"는 help_helpers 존재 여부로 보여준다). 댓글 스레드(help_comments)도 추가.

CREATE TABLE help_helpers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, member_id)
);

ALTER TABLE help_helpers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON help_helpers FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON help_helpers TO service_role, authenticated;
CREATE INDEX help_helpers_request_idx ON help_helpers (request_id);
ALTER PUBLICATION supabase_realtime ADD TABLE help_helpers;

CREATE TABLE help_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON help_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON help_comments TO service_role, authenticated;
CREATE INDEX help_comments_request_idx ON help_comments (request_id);
ALTER PUBLICATION supabase_realtime ADD TABLE help_comments;

-- 기존에 claimed_by로 도와주고 있던 사람을 help_helpers로 옮겨온다.
INSERT INTO help_helpers (request_id, member_id)
SELECT id, claimed_by FROM help_requests WHERE claimed_by IS NOT NULL
ON CONFLICT DO NOTHING;

-- claimed 중간 상태 제거 — 이미 help_helpers에 도우미가 남아있으니 open으로 되돌려도
-- "도와주는 사람" 목록은 그대로 보인다.
UPDATE help_requests SET status = 'open' WHERE status = 'claimed';

ALTER TABLE help_requests DROP CONSTRAINT IF EXISTS help_requests_status_check;
ALTER TABLE help_requests ADD CONSTRAINT help_requests_status_check CHECK (status IN ('open', 'resolved'));

ALTER TABLE help_requests DROP COLUMN IF EXISTS claimed_by;
