-- 버그 수정: pick_final_menu가 "하루 1회" 락을 오늘 후보 4개와 무관하게 그대로 돌려줘서,
-- 투표/날씨가 바뀌거나 새로고침으로 후보 4개가 달라진 뒤 사다리를 타면 화면에 보이는 4개
-- 안에 없는 예전 메뉴가 당첨으로 나오는 문제가 있었다. final_menu가 지금 넘어온 후보
-- 목록(p_names) 안에 있을 때만 그대로 재사용하고, 후보가 바뀌었으면 새로 뽑는다.
CREATE OR REPLACE FUNCTION pick_final_menu(p_names text[], p_weights numeric[])
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date   date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_row    day_state%ROWTYPE;
  v_total  numeric := 0;
  v_rand   numeric;
  v_cum    numeric := 0;
  v_picked text;
  i        int;
BEGIN
  IF p_names IS NULL OR array_length(p_names, 1) IS NULL OR array_length(p_names, 1) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO day_state (date) VALUES (v_date) ON CONFLICT (date) DO NOTHING;
  SELECT * INTO v_row FROM day_state WHERE day_state.date = v_date FOR UPDATE;

  IF v_row.final_menu IS NOT NULL AND v_row.final_menu = ANY(p_names) THEN
    RETURN v_row.final_menu;
  END IF;

  FOR i IN 1..array_length(p_names, 1) LOOP
    v_total := v_total + greatest(coalesce(p_weights[i], 0), 0);
  END LOOP;

  IF v_total <= 0 THEN
    v_picked := p_names[1];
  ELSE
    v_rand := random() * v_total;
    FOR i IN 1..array_length(p_names, 1) LOOP
      v_cum := v_cum + greatest(coalesce(p_weights[i], 0), 0);
      IF v_picked IS NULL AND v_rand <= v_cum THEN
        v_picked := p_names[i];
      END IF;
    END LOOP;
  END IF;

  UPDATE day_state SET final_menu = v_picked WHERE day_state.date = v_date;
  RETURN v_picked;
END;
$$;

GRANT EXECUTE ON FUNCTION pick_final_menu(text[], numeric[]) TO authenticated, service_role;
