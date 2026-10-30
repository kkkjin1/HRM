-- 우리 팀의 약속에 사례 칸 추가. Safe to re-run.
-- team_principles는 기존 정책 그대로(로그인한 팀원 전체 읽기·쓰기). 기존 약속 문장은 건드리지 않는다.
ALTER TABLE team_principles ADD COLUMN IF NOT EXISTS example text NOT NULL DEFAULT '';

-- 확인: has_example = true
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_principles' AND column_name = 'example') AS has_example;
