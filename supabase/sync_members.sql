-- 팀원 목록 두 벌 동기화 — members(프로필: 팀·일상·로그인) ↔ team_log_members(업무: 팀 달력·회의창 업무보고·담당자).
-- Safe to re-run. 함수 본문은 채팅·터미널 붙여넣기에서 깨지지 않게 $$ 대신 작은따옴표로 감쌌다. 이름(앞뒤 공백 무시)으로 같은 사람을 맞춘다.
--  · 추가: 어느 쪽에 추가해도 다른 쪽에 같은 이름이 없으면 자동으로 만든다.
--  · 이름 변경: 바꾸기 전 이름과 같은 다른 쪽 행의 이름도 같이 바꾼다.
--  · 삭제: 따라가지 않는다 — team_log_members를 지우면 업무보고 행·회의 메모가 CASCADE로 함께 지워져서 위험하다.
-- 두 트리거가 서로를 다시 부르지만 "같은 이름이 이미 있으면 안 만든다 / 이름이 이미 같으면 안 바꾼다"라 무한 반복되지 않는다.

CREATE OR REPLACE FUNCTION sync_member_to_team_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
BEGIN
  IF TG_OP = ''INSERT'' THEN
    IF NOT EXISTS (SELECT 1 FROM team_log_members WHERE trim(name) = trim(NEW.name)) THEN
      INSERT INTO team_log_members (name, sort_order, color_key)
      VALUES (trim(NEW.name), COALESCE((SELECT max(sort_order) + 1 FROM team_log_members), 0), COALESCE(NEW.color_key, 0));
    END IF;
  ELSIF TG_OP = ''UPDATE'' AND trim(NEW.name) <> trim(OLD.name) THEN
    UPDATE team_log_members SET name = trim(NEW.name) WHERE trim(name) = trim(OLD.name);
  END IF;
  RETURN NEW;
END;
';

CREATE OR REPLACE FUNCTION sync_team_log_to_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
BEGIN
  IF TG_OP = ''INSERT'' THEN
    IF NOT EXISTS (SELECT 1 FROM members WHERE trim(name) = trim(NEW.name)) THEN
      INSERT INTO members (name, color_key) VALUES (trim(NEW.name), COALESCE(NEW.color_key, 0) % 8);
    END IF;
  ELSIF TG_OP = ''UPDATE'' AND trim(NEW.name) <> trim(OLD.name) THEN
    UPDATE members SET name = trim(NEW.name) WHERE trim(name) = trim(OLD.name);
  END IF;
  RETURN NEW;
END;
';

DROP TRIGGER IF EXISTS members_sync_team_log ON members;
CREATE TRIGGER members_sync_team_log AFTER INSERT OR UPDATE OF name ON members
  FOR EACH ROW EXECUTE FUNCTION sync_member_to_team_log();

DROP TRIGGER IF EXISTS team_log_members_sync_member ON team_log_members;
CREATE TRIGGER team_log_members_sync_member AFTER INSERT OR UPDATE OF name ON team_log_members
  FOR EACH ROW EXECUTE FUNCTION sync_team_log_to_member();

-- 지금 한쪽에만 있는 사람 맞추기
INSERT INTO team_log_members (name, sort_order, color_key)
SELECT trim(m.name), (SELECT COALESCE(max(sort_order), -1) FROM team_log_members) + row_number() OVER (ORDER BY m.created_at), m.color_key
FROM members m
WHERE NOT EXISTS (SELECT 1 FROM team_log_members t WHERE trim(t.name) = trim(m.name));

INSERT INTO members (name, color_key)
SELECT trim(t.name), COALESCE(t.color_key, 0) % 8
FROM team_log_members t
WHERE NOT EXISTS (SELECT 1 FROM members m WHERE trim(m.name) = trim(t.name));

-- Check after running (expect both lists to match):
-- SELECT 'members' AS t, name FROM members UNION ALL SELECT 'team_log', name FROM team_log_members ORDER BY 2, 1;
