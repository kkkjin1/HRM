-- 회고 화면을 "팀 회고" + "개인 회고(팀원별)"로 나누기 위해 작성자 구분 컬럼을 추가한다.
-- owner_key = 'team' 이면 팀 전체 회고, 그 외에는 members.id(uuid, text로 저장)를 가리키는 개인 회고다.
-- 'team' 문자열은 uuid 형식이 아니라 실제 member id와 절대 충돌하지 않으므로 별도 scope 컬럼 없이 이 값 하나로 구분한다.
ALTER TABLE team_log_goal_retros ADD COLUMN owner_key text NOT NULL DEFAULT 'team';

ALTER TABLE team_log_goal_retros DROP CONSTRAINT team_log_goal_retros_pkey;
ALTER TABLE team_log_goal_retros ADD PRIMARY KEY (year, month, owner_key);
