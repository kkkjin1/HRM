-- 오늘의 한마디 댓글에도 이모지 반응을 달 수 있게.
ALTER TABLE message_comments ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}';
