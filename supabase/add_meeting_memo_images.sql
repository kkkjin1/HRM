-- 일정 탭 회의수정 서랍에 "메모"를 추가한다. 기존 결정사항/액션아이템과 같은 team_log_meeting_items
-- 테이블을 재사용하되(kind='memo'), 붙여넣은 캡처화면을 저장할 이미지 필드를 함께 둔다.
-- 실제 파일은 Supabase Storage의 'meeting-memo-images' 버킷(avatars/history-photos와 동일하게 새로 만들어야 함, public read)에
-- 저장하고 이 컬럼들에는 public URL과 표시 크기만 넣는다.

ALTER TABLE team_log_meeting_items DROP CONSTRAINT IF EXISTS team_log_meeting_items_kind_check;
ALTER TABLE team_log_meeting_items ADD CONSTRAINT team_log_meeting_items_kind_check CHECK (kind IN ('decision', 'action', 'memo'));

-- 메모는 결정사항/액션아이템과 달리 텍스트 없이 이미지만 있어도 되므로 content를 필수에서 제외한다.
ALTER TABLE team_log_meeting_items ALTER COLUMN content DROP NOT NULL;
ALTER TABLE team_log_meeting_items ALTER COLUMN content SET DEFAULT '';

ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS image_width int;
ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS image_height int;
