-- 11월 A/B 액션에도 회고 질문을 붙인다(C와 같이 개인 회고에서 답함). Safe to re-run.
-- 전제: add_plan_retro_questions.sql 적용 완료.
-- 질문이 아직 비어 있을 때만 넣는다(팀빌딩 화면에서 이미 고친 질문은 건드리지 않음).

UPDATE team_plan_actions SET
  retro_questions = '[
    {"key": "q1", "text": "이번 달 내 업무가 다른 팀원 업무와 맞물렸던 접점 1개 (어떤 업무와, 무엇이 서로 걸렸는지)", "required": true},
    {"key": "q2", "text": "그 접점을 미리 맞췄나요? 맞췄다면 무엇이 수월했고, 못 맞췄다면 어떤 충돌이나 재작업이 있었나요?", "required": true}
  ]'::jsonb,
  version = version + 1, updated_at = now()
WHERE seed_key = '2026-11:A' AND retro_questions = '[]'::jsonb;

UPDATE team_plan_actions SET
  retro_questions = '[
    {"key": "q1", "text": "이번 달 요청·지시를 주고받으며 맥락(정해진 것 / 안 정해진 것 / 판단 범위)이 충분해서 수월했던 경우 1개", "required": true},
    {"key": "q2", "text": "맥락이 부족해 다시 묻거나 고친 경우 1개 (사람보다 어떤 정보가 빠졌는지 중심으로, 없었다면 없음)", "required": true}
  ]'::jsonb,
  version = version + 1, updated_at = now()
WHERE seed_key = '2026-11:B' AND retro_questions = '[]'::jsonb;

-- 확인: a_questions = 2, b_questions = 2, c_questions = 3
SELECT (SELECT jsonb_array_length(retro_questions) FROM team_plan_actions WHERE seed_key = '2026-11:A') AS a_questions,
       (SELECT jsonb_array_length(retro_questions) FROM team_plan_actions WHERE seed_key = '2026-11:B') AS b_questions,
       (SELECT jsonb_array_length(retro_questions) FROM team_plan_actions WHERE seed_key = '2026-11:C') AS c_questions;
