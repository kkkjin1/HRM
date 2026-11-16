-- 회의창 "내가 만든 박스" — 팀장이 회의창에 박스를 직접 추가·삭제한다(박스 목록은 team_log_settings 'custom_meeting_blocks').
-- 박스 안의 글·캡처 카드는 근태/계약휴직 메모와 같은 team_log_meeting_items 행을 쓰되, kind='custom' + block_id(박스 id)로 구분한다.

ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS block_id text;

ALTER TABLE team_log_meeting_items DROP CONSTRAINT IF EXISTS team_log_meeting_items_kind_check;
ALTER TABLE team_log_meeting_items ADD CONSTRAINT team_log_meeting_items_kind_check
  CHECK (kind IN ('decision', 'action', 'memo', 'contract_leave', 'custom'));

-- custom 행은 반드시 박스 id가 있고, 다른 종류에는 박스 id가 없다.
ALTER TABLE team_log_meeting_items DROP CONSTRAINT IF EXISTS team_log_meeting_items_block_id_check;
ALTER TABLE team_log_meeting_items ADD CONSTRAINT team_log_meeting_items_block_id_check
  CHECK ((kind = 'custom') = (block_id IS NOT NULL));
