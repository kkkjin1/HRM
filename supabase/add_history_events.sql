CREATE TABLE history_events (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
event_date date NOT NULL,
category text NOT NULL CHECK (category IN ('입사', '퇴사', '회식', '기타')),
title text NOT NULL,
photo_url text,
author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE history_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON history_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON history_events TO service_role, authenticated;
CREATE INDEX history_events_date_idx ON history_events (event_date DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE history_events;
