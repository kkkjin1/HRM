-- 회의수정 화면에 "계약/휴직" 섹션을 추가한다. 기존 "근태/기타"(캡처화면 메모)와 완전히 같은 구조를
-- 재사용하되(team_log_meeting_items, kind만 새로 추가), 별도로 목록이 갈리도록 kind 값을 분리한다.
-- 기존 "근태/기타"는 화면 라벨을 "근태"로 줄이고, 데이터는 그대로 kind='memo'를 계속 쓴다.

ALTER TABLE team_log_meeting_items DROP CONSTRAINT IF EXISTS team_log_meeting_items_kind_check;
ALTER TABLE team_log_meeting_items ADD CONSTRAINT team_log_meeting_items_kind_check
  CHECK (kind IN ('decision', 'action', 'memo', 'contract_leave'));
