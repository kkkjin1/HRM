-- 🐶 호떡 선물 애정도 (2026-11-25): 상점(장난감·집·꽃밭 등)에 코인을 보태면 그 사람 애정도 +2/코인.
--  · 이미 보탠 코인도 같은 기준으로 소급(보탠 날짜로 기록).
CREATE OR REPLACE FUNCTION public.pet_fund(p_item text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := current_member_id();
  p pets;
  v_price int := pet_item_price(p_item);
  v_funded int;
  v_put int;
  v_done boolean := false;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF v_price IS NULL THEN RAISE EXCEPTION 'BAD_ITEM'; END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
  SELECT * INTO p FROM pets WHERE status <> 'graduated' ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PET'; END IF;
  PERFORM 1 FROM pets WHERE id = p.id FOR UPDATE;   -- 동시에 보태도 한 줄로
  IF EXISTS (SELECT 1 FROM pet_items WHERE pet_id = p.id AND item = p_item) THEN RAISE EXCEPTION 'OWNED'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_funded FROM pet_item_funds WHERE pet_id = p.id AND item = p_item;
  v_put := LEAST(p_amount, v_price - v_funded);
  IF pet_coins(v_me) < v_put THEN RAISE EXCEPTION 'NO_COIN'; END IF;
  INSERT INTO pet_item_funds (pet_id, item, member_id, amount) VALUES (p.id, p_item, v_me, v_put);
  -- 🎁 선물한 사람 애정도: 보탠 코인 1개당 +2 (밥 한 숟갈 +5보다 확 오르게)
  INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points) VALUES (p.id, v_me, 'gift', p_item, (pet_now() AT TIME ZONE 'Asia/Seoul')::date, v_put * 2);
  v_funded := v_funded + v_put;
  IF v_funded >= v_price THEN
    INSERT INTO pet_items (pet_id, item, member_id, price) VALUES (p.id, p_item, v_me, v_price);   -- member_id = 마지막에 채운 사람
    v_done := true;
  END IF;
  RETURN jsonb_build_object('ok', true, 'put', v_put, 'funded', v_funded, 'price', v_price, 'done', v_done, 'coins', pet_coins(v_me));
END $$;

INSERT INTO pet_actions (pet_id, member_id, kind, slot, day, points, created_at)
SELECT f.pet_id, f.member_id, 'gift', f.item, (f.created_at AT TIME ZONE 'Asia/Seoul')::date, f.amount * 2, f.created_at
FROM pet_item_funds f
WHERE NOT EXISTS (SELECT 1 FROM pet_actions a WHERE a.kind = 'gift' AND a.pet_id = f.pet_id AND a.member_id = f.member_id AND a.created_at = f.created_at);
