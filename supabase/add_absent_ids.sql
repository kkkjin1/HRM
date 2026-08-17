-- 오늘 연차인 팀원 ID 목록. 운세/한마디 임계값 계산에서 제외.
ALTER TABLE day_state ADD COLUMN IF NOT EXISTS absent_ids uuid[] NOT NULL DEFAULT '{}';
