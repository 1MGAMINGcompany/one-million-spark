ALTER TABLE prediction_admins ADD COLUMN IF NOT EXISTS email text;

UPDATE prediction_admins SET email = 'morganlaurent@live.ca' WHERE wallet = (SELECT wallet FROM prediction_admins LIMIT 1);

INSERT INTO prediction_admins (email, wallet) VALUES ('morganlaurent@live.ca', 'email_admin') ON CONFLICT DO NOTHING;

ALTER TABLE operators ADD COLUMN IF NOT EXISTS disabled_sports text[] DEFAULT '{}';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS welcome_message text;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#4F46E5';