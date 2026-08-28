-- 캘린더 담당자 배지 색상용. team_log_members에는 이 컬럼이 없었는데
-- /api/members가 (다른 테이블 members의 color_key와 착각해) 이 컬럼을 조회하는 바람에
-- "column does not exist" 에러로 담당자 목록 전체가 안 나오던 문제를 고친다.
ALTER TABLE team_log_members ADD COLUMN color_key int NOT NULL DEFAULT 0;

UPDATE team_log_members m
SET color_key = sub.rn - 1
FROM (SELECT id, row_number() OVER (ORDER BY sort_order) AS rn FROM team_log_members) sub
WHERE m.id = sub.id;
