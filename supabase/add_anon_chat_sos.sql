-- 익명채팅 SOS — R&R의 "살려주세요"를 대신한다. SOS로 보낸 익명 메시지는 모든 팀원에게 1회 팝업으로 뜬다.
-- Safe to re-run. Apply this BEFORE deploying the app code that reads is_sos.

ALTER TABLE anon_chat ADD COLUMN IF NOT EXISTS is_sos boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS anon_chat_sos_idx ON anon_chat (chat_date) WHERE is_sos;

NOTIFY pgrst, 'reload schema';
