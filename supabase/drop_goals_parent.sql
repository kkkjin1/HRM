-- 목표를 OKR식 상하위 연결 구조 대신 기간 단위(연간/반기/분기/월) 독립 그룹으로 관리하기로
-- 바꾸면서 더 이상 쓰지 않는 자기참조 컬럼을 제거한다. 의존 인덱스도 함께 제거된다.
ALTER TABLE team_log_goals DROP COLUMN parent_id;
