-- 프로필 카드용 사진. 값이 없으면(NULL) 프론트에서 이니셜+색상 원형 아바타로 대체한다.
-- 실제 파일은 Supabase Storage의 'avatars' 버킷(이미 생성됨, public read)에 저장하고
-- 이 컬럼에는 public URL만 넣는다.
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url text;
