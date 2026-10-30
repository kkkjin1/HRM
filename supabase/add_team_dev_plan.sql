-- 팀 발전계획(R0 이후 월별 탐구) — 월별 계획·액션·실행 기록. Safe to re-run.
-- 전제: add_auth_identity.sql, add_team_rounds.sql 적용 완료(R0 회차 존재).
--
-- 구조
--   team_plan_months  월 1행(핵심 질문·다음 탐구 질문·월말 학습). month는 매월 1일, 중복 불가
--   team_plan_actions 월별 액션(강점 강화 strengthen / 약점 보완 complement / 미확인 탐색 explore)
--                     계획 칸(purpose·action_plan·evidence)과 관찰 칸(result·learned·follow_up)을 나눠 둔다
-- 권한
--   브라우저(authenticated)는 두 테이블을 직접 읽거나 쓸 수 없다(정책 없음 + 권한 회수).
--   모든 읽기·쓰기는 /api/team-plan(서버, service role)이 로그인 계정으로 팀원을 확인한 뒤 한다.
--   읽기 = 연결된 재직 팀원 전원 / 쓰기 = 팀장(role = lead)만(진단 회차·외부 분석과 같은 규칙).
-- 기록 보존
--   행은 지울 수 없다(service role 포함). 멈춘 액션은 status = on_hold로 둔다. 월·액션의 소속(month, month_id)은 바뀌지 않는다.
--   동시 수정은 version 비교로 막는다(API가 version이 같을 때만 고치고 1 올린다).
-- 기존 R0 응답·회차·외부 분석 테이블은 읽지도 고치지도 않는다(baseline_round_id 참조만).
-- 초기 3개월(2026-11~2027-01) 계획은 아래 시드로 넣는다. 다시 실행해도 이미 있는 월·액션은 건드리지 않는다(사용자 수정 보존).
-- 되돌리기: rollback_team_dev_plan.sql
-- Supabase SQL Editor가 '작다' 기호에서 문장을 깨뜨리는 문제가 있어 이 파일에는 그 기호를 쓰지 않는다.

-- ── 1) 테이블 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_plan_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE CHECK (extract(day FROM month) = 1),
  theme text NOT NULL DEFAULT '',
  core_question text NOT NULL DEFAULT '',
  next_question text NOT NULL DEFAULT '',
  learned_new text NOT NULL DEFAULT '',
  changed_view text NOT NULL DEFAULT '',
  still_unknown text NOT NULL DEFAULT '',
  baseline_round_id uuid REFERENCES team_rounds(id) ON DELETE RESTRICT,
  version int NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS team_plan_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id uuid NOT NULL REFERENCES team_plan_months(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('strengthen', 'complement', 'explore')),
  focus text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  action_plan text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'on_hold')),
  result text NOT NULL DEFAULT '',
  learned text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  seed_key text UNIQUE,
  version int NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES members(id) ON DELETE RESTRICT,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS team_plan_actions_month_idx ON team_plan_actions (month_id, category, sort_order);

-- ── 2) 권한: 브라우저 직접 접근 차단 ───────────────────────────────────────────
ALTER TABLE team_plan_months ENABLE ROW LEVEL SECURITY;

ALTER TABLE team_plan_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON team_plan_months FROM anon;

REVOKE ALL ON team_plan_months FROM authenticated;

REVOKE ALL ON team_plan_actions FROM anon;

REVOKE ALL ON team_plan_actions FROM authenticated;

GRANT ALL ON team_plan_months TO service_role;

GRANT ALL ON team_plan_actions TO service_role;

-- ── 3) 기록 보존 트리거: 삭제 금지, 소속 고정 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION team_plan_months_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_plan_months: plan months are kept as history and cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.month IS DISTINCT FROM OLD.month OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team_plan_months: month is fixed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_plan_months_guard ON team_plan_months;

CREATE TRIGGER team_plan_months_guard BEFORE UPDATE OR DELETE ON team_plan_months
  FOR EACH ROW EXECUTE FUNCTION team_plan_months_guard();

CREATE OR REPLACE FUNCTION team_plan_actions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_plan_actions: actions are kept as history and cannot be deleted (use status on_hold)' USING ERRCODE = '42501';
  END IF;
  IF NEW.month_id IS DISTINCT FROM OLD.month_id OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.seed_key IS DISTINCT FROM OLD.seed_key OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team_plan_actions: month and category are fixed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_plan_actions_guard ON team_plan_actions;

CREATE TRIGGER team_plan_actions_guard BEFORE UPDATE OR DELETE ON team_plan_actions
  FOR EACH ROW EXECUTE FUNCTION team_plan_actions_guard();

-- ── 4) 초기 3개월 계획(R0 기준) — 이미 있으면 건드리지 않음 ─────────────────────────
INSERT INTO team_plan_months (month, theme, core_question, next_question, baseline_round_id)
VALUES
  ('2026-11-01', '성과와 업무의 출발점',
   '우리는 함께 일하면서 실제로 더 가치 있는 결과를 만드는가?',
   '팀의 실행력은 좋은 결과를 보장하는가? 성과를 저해하는 구조는 무엇인가?',
   (SELECT id FROM team_rounds WHERE kind = 'baseline' AND closed_at IS NOT NULL)),
  ('2026-12-01', '협력과 의사결정의 질',
   '우리는 서로 다른 생각과 역량을 결합해 더 나은 판단을 내리는가?',
   '의견을 말할 수 있는 팀과 다른 의견을 활용해 판단의 질을 높이는 팀은 어떻게 다른가?',
   (SELECT id FROM team_rounds WHERE kind = 'baseline' AND closed_at IS NOT NULL)),
  ('2027-01-01', '팀 학습과 지속가능성',
   '우리는 함께 일할수록 개인도 성장하고 팀도 강해지는가?',
   '현재보다 구성원이 성장하고 팀이 지속가능해지려면 어떤 경험·권한·책임 구조가 필요한가?',
   (SELECT id FROM team_rounds WHERE kind = 'baseline' AND closed_at IS NOT NULL))
ON CONFLICT (month) DO NOTHING;

INSERT INTO team_plan_actions (month_id, category, focus, purpose, action_plan, evidence, sort_order, seed_key)
SELECT m.id, s.category, s.focus, s.purpose, s.action_plan, s.evidence, 0, s.seed_key
FROM (VALUES
  ('2026-11-01'::date, 'strengthen', '2026-11:A', '목표 정렬·역할 재배분',
   'R0에서 긍정 근거가 확인된 목표 정렬·역할 재배분이 실제 공동 업무의 성과로 이어지는지 확인하고 강화한다.',
   '중요한 공동 업무 1건을 선정하고 목표, 역할, 우선순위를 명확히 정한 뒤 진행 중 필요한 역할 조정을 실행한다.',
   '어떤 조정이 실제 성과에 기여했는지 구체적 사례를 남긴다.'),
  ('2026-11-01'::date, 'complement', '2026-11:B', '의사결정 맥락',
   '선행 의사결정이 포함된 업무 인계에서 맥락이 누락된다는 보완 신호를 실제 업무에서 확인하고 줄인다.',
   '신규·이관 업무 착수 시 기존 확정사항, 미결정사항, 담당자 판단 범위를 구분해 인계한다.',
   '불필요한 가정·재검토가 발생한 사례와 발생하지 않은 사례를 비교한다.'),
  ('2026-11-01'::date, 'explore', '2026-11:C', '성과 가치',
   '협업이 실제 성과 가치를 높이는지(R0 미확인)를 결과물 수요자의 경험으로 탐색한다.',
   '핵심 산출물 1~2건에 대해 결과물을 사용하는 현업 또는 경영진에게 기대 가치와 실제 활용·효과를 확인한다.',
   '팀이 생각한 성과와 실제 수요자가 경험한 가치의 차이를 분석한다.'),
  ('2026-12-01'::date, 'strengthen', '2026-12:A', '상호 지원',
   'R0에서 확인된 수시 조율과 도움 요청을 효과적인 협력 방식으로 정리해 다른 업무로 넓힌다.',
   '2건의 협업 사례에서 도움 요청, 지원 범위 조율, 실제 기여 행동을 기록하고 효과적이었던 협력 방식을 다른 업무에 적용한다.',
   '협력이 개인 수행만으로 어려웠던 문제 해결에 어떤 차이를 만들었는지 확인한다.'),
  ('2026-12-01'::date, 'complement', '2026-12:B', '피드백의 연속성',
   '변경된 피드백이 기록되지 않는다는 보완 신호를 줄인다.',
   '중요한 업무 방향이 변경될 때 기존 방향, 변경 방향, 이유, 적용 시점을 기존 업무 기록에 남긴다.',
   '피드백 변경으로 인한 해석 차이 또는 재작업 사례를 복기한다.'),
  ('2026-12-01'::date, 'explore', '2026-12:C', '건설적 이견',
   '이견이 의사결정을 개선하는지(R0 미확인)를 실제 의사결정에서 탐색한다.',
   '중요한 의사결정 1건에서 서로 다른 대안과 반대 근거를 명시적으로 검토한다. 팀장은 가급적 팀원들의 대안 제시 이후 의견을 낸다.',
   '다른 의견으로 인해 실제 판단이 수정·보완되었는지, 수정되지 않았다면 그 이유가 합리적인지 살펴본다.'),
  ('2027-01-01'::date, 'strengthen', '2027-01:A', '실행·적응',
   '지난 두 달의 성공적인 조율 방식이 특정 구성원에 기대지 않고 재현되는지 확인한다.',
   '지난 두 달의 성공적인 업무 조율 방식을 기존과 다른 공동 업무 1건에 적용한다.',
   '특정 구성원의 역량에 의존하지 않고도 유사한 성공 행동을 재현할 수 있는지 확인한다.'),
  ('2027-01-01'::date, 'complement', '2027-01:B', '경험의 자산화',
   '성공 경험이 노하우로 전환되지 않는다는 보완 신호를 줄인다.',
   '구성원 1명의 실무 노하우를 공유하고 다른 구성원이 실제 업무에 적용해 본다.',
   '단순한 정보 공유가 아닌 타인의 문제 해결에 활용되었는지 확인한다.'),
  ('2027-01-01'::date, 'explore', '2027-01:C', '성장과 지속가능성',
   '함께 일하며 개인이 성장하고 팀의 지속가능성이 높아지는지(R0 미확인)를 탐색한다.',
   '주요 업무 1건의 지식·판단·협업 의존도를 점검하고, 다른 구성원이 일부 과정을 이해·수행하는 교차 경험을 진행한다. 단, 책임과 승인 권한은 기존 담당자에게 유지한다.',
   '함께 일한 결과 구성원의 역량이 확장되었는지, 특정인 부재에도 팀이 대응 가능한 범위가 넓어졌는지 검토한다.')
) AS s(month, category, seed_key, focus, purpose, action_plan, evidence)
JOIN team_plan_months m ON m.month = s.month
ON CONFLICT (seed_key) DO NOTHING;

-- 확인: months = 3 이상, actions = 9 이상, rls_on = true, browser_select = false, baseline_linked = 3 이상
SELECT (SELECT count(*) FROM team_plan_months) AS months,
       (SELECT count(*) FROM team_plan_actions) AS actions,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.team_plan_actions'::regclass) AS rls_on,
       has_table_privilege('authenticated', 'public.team_plan_actions', 'SELECT') AS browser_select,
       (SELECT count(*) FROM team_plan_months WHERE baseline_round_id IS NOT NULL) AS baseline_linked;
