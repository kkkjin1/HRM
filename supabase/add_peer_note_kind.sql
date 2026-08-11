-- 동료가 남기는 한마디에 "종류"를 추가한다: 그냥 한마디 / 칭찬 / (장난스러운) 경고장.
-- 프로필 카드에서 종류별로 다르게 꾸며서 보여주기 위함. 기본값 'note'라 기존 데이터는 그대로 "한마디"로 보인다.
ALTER TABLE peer_notes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'praise', 'warning'));
