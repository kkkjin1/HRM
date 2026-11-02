-- 팀빌딩 액션의 '회고 질문' + 개인 회고에서 받은 답변. Safe to re-run.
-- 전제: add_team_dev_plan.sql 적용 완료.
--
-- 구조
--   team_plan_actions.retro_questions  액션별 회고 질문 목록(jsonb 배열). 한 항목 = {"key", "text", "required"}
--                                      팀장이 팀빌딩 화면에서 질문·필수 여부를 고친다. key는 답변과 잇는 고정 값
--   team_plan_retro_answers            팀원별 답변. (액션, 팀원, 질문 key)마다 1행
-- 권한
--   브라우저(authenticated)는 직접 읽거나 쓸 수 없다(정책 없음 + 권한 회수). 모든 읽기·쓰기는 서버 API가 한다.
--   읽기 = 연결된 재직 팀원 전원(팀 전체 공개) / 답변 쓰기 = 본인 답만.
-- 11월 A/B/C 문구 교체
--   팀 현실에 맞춰 A(역할 접점)·B(지시·요청의 맥락)·C(팀원이 체감하는 협업의 도움과 비용)로 바꾼다.
--   처음 시드 문구가 그대로일 때만 바꾼다(화면에서 이미 고친 칸은 건드리지 않음). R0 기준 해석은 바꾸지 않는다.
-- Supabase SQL Editor가 '작다' 기호에서 문장을 깨뜨리는 문제가 있어 이 파일에는 그 기호를 쓰지 않는다.

-- ── 1) 회고 질문 칸 ────────────────────────────────────────────────────────
ALTER TABLE team_plan_actions ADD COLUMN IF NOT EXISTS retro_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 2) 답변 테이블 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_plan_retro_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES team_plan_actions(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  question_key text NOT NULL,
  answer text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, member_id, question_key)
);

CREATE INDEX IF NOT EXISTS team_plan_retro_answers_action_idx ON team_plan_retro_answers (action_id);

ALTER TABLE team_plan_retro_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON team_plan_retro_answers FROM anon;

REVOKE ALL ON team_plan_retro_answers FROM authenticated;

GRANT ALL ON team_plan_retro_answers TO service_role;

-- ── 3) 11월 A/B/C 문구 교체(시드 그대로일 때만) ───────────────────────────────────
UPDATE team_plan_actions SET
  focus = '역할 접점 조율',
  purpose = 'R0에서 확인된 목표 정렬과 역할 재배분이 업무가 나뉜 구조에서도 접점 조율로 이어지는지 확인하고 강화한다.',
  action_plan = '각자 이번 달 핵심 업무 1건이 팀 목표의 어디에 기여하는지 한 줄로 적고, 다른 팀원 업무와 서로 영향을 주는 접점(일정, 데이터, 결정이 서로 걸리는 곳)을 1개씩 표시한다. 접점은 미리 짧게 맞춘다.',
  evidence = '접점을 미리 맞춰서 문제가 생기지 않은 사례와, 맞추지 않아 충돌이나 재작업이 생긴 사례를 비교한다.',
  version = version + 1, updated_at = now()
WHERE seed_key = '2026-11:A'
  AND action_plan = '중요한 공동 업무 1건을 선정하고 목표, 역할, 우선순위를 명확히 정한 뒤 진행 중 필요한 역할 조정을 실행한다.';

UPDATE team_plan_actions SET
  focus = '지시·요청의 맥락',
  purpose = '선행 의사결정의 맥락이 빠지는 문제를 인수인계가 아닌 일상 업무의 요청과 지시에서 확인하고 줄인다.',
  action_plan = '팀장이 지시할 때, 그리고 파트끼리 요청할 때 "이미 정해진 것 / 아직 안 정해진 것 / 담당자가 판단해도 되는 범위" 세 줄을 붙인다. 팀장부터 먼저 실행한다.',
  evidence = '다시 묻기, 잘못된 가정, 재작업이 생긴 사례와 생기지 않은 사례를 비교한다.',
  version = version + 1, updated_at = now()
WHERE seed_key = '2026-11:B'
  AND action_plan = '신규·이관 업무 착수 시 기존 확정사항, 미결정사항, 담당자 판단 범위를 구분해 인계한다.';

UPDATE team_plan_actions SET
  focus = '협업의 체감 가치',
  purpose = '협업이 실제 가치를 높이는지(R0 미확인)를, 팀원이 체감하는 도움과 비용으로 탐색한다.',
  action_plan = '월말 개인 회고에서 각자 이번 달 협업이 도움이 된 순간과 오히려 부담이 된 순간을 1개씩 적는다.',
  evidence = '협업이 도움이 된 지점과 비용이 된 지점이 어디서 갈리는지 본다.',
  retro_questions = '[
    {"key": "q1", "text": "이번 달 팀원과 함께해서 더 수월했거나 결과가 나아진 순간 1개 (어떤 일에서, 무엇 덕분에)", "required": true},
    {"key": "q2", "text": "협업하면서 오히려 시간이 더 들거나 번거로웠던 순간 1개 (사람보다 방식 중심으로: 타이밍·절차·전달 경로 등)", "required": true},
    {"key": "q3", "text": "다음 달에 바꿔 보고 싶은 협업 방식이 있다면", "required": false}
  ]'::jsonb,
  version = version + 1, updated_at = now()
WHERE seed_key = '2026-11:C'
  AND action_plan = '핵심 산출물 1~2건에 대해 결과물을 사용하는 현업 또는 경영진에게 기대 가치와 실제 활용·효과를 확인한다.';

-- 확인: has_questions_col = true, answers_rls_on = true, browser_select = false,
--       nov_a/b/c = 새 초점 이름(이미 화면에서 고쳤다면 고친 값 그대로), nov_c_questions = 3
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_plan_actions' AND column_name = 'retro_questions') AS has_questions_col,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.team_plan_retro_answers'::regclass) AS answers_rls_on,
       has_table_privilege('authenticated', 'public.team_plan_retro_answers', 'SELECT') AS browser_select,
       (SELECT focus FROM team_plan_actions WHERE seed_key = '2026-11:A') AS nov_a,
       (SELECT focus FROM team_plan_actions WHERE seed_key = '2026-11:B') AS nov_b,
       (SELECT focus FROM team_plan_actions WHERE seed_key = '2026-11:C') AS nov_c,
       (SELECT jsonb_array_length(retro_questions) FROM team_plan_actions WHERE seed_key = '2026-11:C') AS nov_c_questions;
