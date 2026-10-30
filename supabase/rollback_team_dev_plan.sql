-- add_team_dev_plan.sql 되돌리기 — 팀 발전계획 테이블과 그 안의 기록을 모두 지운다(되살릴 수 없음).
-- 기록이 있으면 먼저 백업: SELECT * FROM team_plan_months; SELECT * FROM team_plan_actions; 결과를 따로 저장한 뒤 실행.
-- R0 회차·응답·외부 분석 테이블은 건드리지 않는다.

DROP TABLE IF EXISTS team_plan_actions;

DROP TABLE IF EXISTS team_plan_months;

DROP FUNCTION IF EXISTS team_plan_actions_guard();

DROP FUNCTION IF EXISTS team_plan_months_guard();
