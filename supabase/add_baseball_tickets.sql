-- Baseball gift ticket (random uniform). Run once in Supabase SQL Editor.
-- Admin (ji.kim@egnis.kr) grants a ticket to a member. The holder can spend it to send a box to someone else (never self).
-- Ticket box: kind = 'ticket', cost 0, part fixed to 'uniform', team random when opened (open_baseball_box).
-- Writes only through security definer functions below (no write policy for authenticated).

CREATE TABLE IF NOT EXISTS baseball_gift_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz,
  box_id     uuid REFERENCES baseball_gift_boxes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS baseball_gift_tickets_owner_idx ON baseball_gift_tickets (owner_id);

ALTER TABLE baseball_gift_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON baseball_gift_tickets FOR SELECT TO authenticated USING (true);
GRANT SELECT ON baseball_gift_tickets TO authenticated;
GRANT ALL ON baseball_gift_tickets TO service_role;

-- allow kind 'ticket' on gift boxes
ALTER TABLE baseball_gift_boxes DROP CONSTRAINT IF EXISTS baseball_gift_boxes_kind_check;
ALTER TABLE baseball_gift_boxes ADD CONSTRAINT baseball_gift_boxes_kind_check CHECK (kind IN ('credit', 'admin', 'ticket'));

CREATE OR REPLACE FUNCTION admin_grant_baseball_ticket(p_admin uuid, p_owner uuid)
RETURNS baseball_gift_tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r baseball_gift_tickets;
BEGIN
  IF COALESCE(auth.jwt() ->> 'email', '') <> 'ji.kim@egnis.kr' THEN RAISE EXCEPTION 'NOT_ADMIN'; END IF;
  INSERT INTO baseball_gift_tickets (owner_id, granted_by) VALUES (p_owner, p_admin)
  RETURNING * INTO r;
  RETURN r;
END
$$;

CREATE OR REPLACE FUNCTION send_baseball_ticket_box(p_sender uuid, p_recipient uuid, p_message text)
RETURNS baseball_gift_boxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t baseball_gift_tickets;
  r baseball_gift_boxes;
BEGIN
  IF p_sender = p_recipient THEN RAISE EXCEPTION 'SELF_GIFT'; END IF;
  SELECT * INTO t FROM baseball_gift_tickets
   WHERE owner_id = p_sender AND used_at IS NULL
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_TICKET'; END IF;
  INSERT INTO baseball_gift_boxes (kind, sender_id, recipient_id, cost, message, preset_part)
  VALUES ('ticket', p_sender, p_recipient, 0, NULLIF(btrim(COALESCE(p_message, '')), ''), 'uniform')
  RETURNING * INTO r;
  UPDATE baseball_gift_tickets SET used_at = now(), box_id = r.id WHERE id = t.id;
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION admin_grant_baseball_ticket(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION send_baseball_ticket_box(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_grant_baseball_ticket(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION send_baseball_ticket_box(uuid, uuid, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_gift_tickets;
