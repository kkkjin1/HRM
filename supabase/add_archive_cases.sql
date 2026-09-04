-- '아카이빙' 섹션: HR 사례(근태·휴가/급여·보상/계약·고용/퇴직/노무/채용/평가/기타)를 검색 가능하게 보관.
-- keywords는 "#키워드" 형태로 입력받아 배열로 저장하고, GIN 인덱스로 태그 검색을 지원한다.
CREATE TABLE team_log_archive_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('근태·휴가', '급여·보상', '계약·고용', '퇴직', '노무', '채용', '평가', '기타')),
  situation text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  slack_url text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_archive_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_archive_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_archive_cases_category_idx ON team_log_archive_cases (category);
CREATE INDEX team_log_archive_cases_keywords_idx ON team_log_archive_cases USING GIN (keywords);
