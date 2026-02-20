ALTER TABLE presence_heartbeats
ADD COLUMN IF NOT EXISTS first_seen_date date DEFAULT CURRENT_DATE;