-- 익명채팅 투표 — 익명채팅에서 투표를 올리면 SOS처럼 모든 팀원에게 팝업으로 뜨고, 팝업에서 바로 투표한다.
-- 투표 메시지 = anon_chat 행 중 poll_options가 있는 것(body = 질문). 표는 anon_poll_votes에 1인 1표, 한 번 찍으면 수정·삭제 불가
-- (조회·추가 정책만 있고 수정·삭제 정책이 없어서 DB가 막는다).
-- voter_id는 중복 투표 방지용으로만 저장하고 화면에는 누가 찍었는지 절대 표시하지 않는다.
-- Safe to re-run. 앱 코드 배포 전에 먼저 실행.

ALTER TABLE anon_chat ADD COLUMN IF NOT EXISTS poll_options jsonb;

CREATE TABLE IF NOT EXISTS anon_poll_votes (
  message_id uuid NOT NULL REFERENCES anon_chat(id) ON DELETE CASCADE,
  voter_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  option_idx int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, voter_id)
);

ALTER TABLE anon_poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON anon_poll_votes;
DROP POLICY IF EXISTS "auth_select" ON anon_poll_votes;
DROP POLICY IF EXISTS "auth_insert" ON anon_poll_votes;
CREATE POLICY "auth_select" ON anon_poll_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON anon_poll_votes FOR INSERT TO authenticated WITH CHECK (true);
GRANT ALL ON anon_poll_votes TO service_role;
REVOKE UPDATE, DELETE ON anon_poll_votes FROM authenticated;
GRANT SELECT, INSERT ON anon_poll_votes TO authenticated;

-- 실시간 반영(투표수 즉시 갱신). 이미 추가돼 있으면 42710 에러가 나고 SQL Editor가 위 문장까지 되돌리므로,
-- 처음 한 번만 따로 실행한다(2026-11-03 운영 DB엔 이미 추가됨):
-- ALTER PUBLICATION supabase_realtime ADD TABLE anon_poll_votes;

NOTIFY pgrst, 'reload schema';
