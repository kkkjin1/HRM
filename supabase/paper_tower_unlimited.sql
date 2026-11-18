-- 🗼 서류탑: 한 탑 1인 횟수 제한(5회) 해제 — 2026-11-18
-- 사람 3명이 하면 5회×3 = 15층에서 더 못 쌓던 문제. 연속 금지·잠금 20초·날짜 마감은 그대로.
-- paper_tower_claim 만 다시 만든다(add_paper_tower.sql 의 같은 함수와 동일). Safe to re-run.

-- [지금 놓기] — 잠금을 잡고 회차를 1회 소모. 못 잡으면 이유 코드로 예외.
-- 반환: 탑 행(잡은 뒤 상태) — 화면은 이 state 로 탑을 다시 세우고, next_kind 를 이번 물건으로 쓴다.
CREATE OR REPLACE FUNCTION paper_tower_claim(p_kind text)
RETURNS paper_towers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS '
DECLARE
  v_me uuid := current_member_id();
  t paper_towers;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION ''NOT_MEMBER''; END IF;
  t := paper_tower_current();
  SELECT * INTO t FROM paper_towers WHERE id = t.id FOR UPDATE;
  IF t.lock_by IS NOT NULL AND t.lock_until > now() THEN
    IF t.lock_by = v_me THEN RAISE EXCEPTION ''ALREADY_MINE''; END IF;
    RAISE EXCEPTION ''LOCKED'';
  END IF;
  IF t.last_by = v_me THEN RAISE EXCEPTION ''CONSECUTIVE''; END IF;
  INSERT INTO paper_tower_moves (tower_id, member_id, floor, kind)
  VALUES (t.id, v_me, (SELECT count(*) + 1 FROM paper_tower_moves WHERE tower_id = t.id), COALESCE(t.next_kind, p_kind));
  UPDATE paper_towers SET lock_by = v_me, lock_until = now() + interval ''20 seconds'',
    next_kind = COALESCE(next_kind, p_kind), updated_at = now()
  WHERE id = t.id RETURNING * INTO t;
  RETURN t;
END ';
