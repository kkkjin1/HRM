-- 목표 맵 화면 전용 데이터. 목표(team_log_goals) 자체 구조/의미는 전혀 바꾸지 않는다 —
-- 여기 두 테이블은 오직 "화면에 어떻게 붙어있는지"(위치)와 "목표에 자유롭게 붙인 보조 메모"만 담는다.

-- 목표에 붙는 보조 항목(메모/실행 항목/아이디어/링크/자유 항목). 목표 삭제 시 함께 삭제되지만,
-- 이 항목을 지운다고 목표가 지워지진 않는다(참조 방향이 반대).
CREATE TABLE team_log_goal_related_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES team_log_goals(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('memo', 'action', 'idea', 'link', 'free')),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 목표 맵 캔버스에서 사용자가 직접 옮긴 노드 위치. 기간 노드(연간/반기/1분기/8월 등)와
-- 목표 노드, 보조 항목 노드를 모두 같은 방식(연도 + node_key)으로 저장한다.
-- 위치가 없는 노드는 화면에서 자동 배치 좌표를 계산해서 보여준다(이 테이블에는 안 남음).
CREATE TABLE team_log_goal_map_nodes (
  year int NOT NULL,
  node_key text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  PRIMARY KEY (year, node_key)
);

ALTER TABLE team_log_goal_related_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_goal_map_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_goal_related_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_log_goal_map_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_goal_related_items_goal_idx ON team_log_goal_related_items (goal_id);
