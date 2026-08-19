CREATE TABLE history_memos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
event_id uuid NOT NULL REFERENCES history_events(id) ON DELETE CASCADE,
author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
content text NOT NULL,
created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE history_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON history_memos FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON history_memos TO service_role, authenticated;
CREATE INDEX history_memos_event_idx ON history_memos (event_id);
ALTER PUBLICATION supabase_realtime ADD TABLE history_memos;
