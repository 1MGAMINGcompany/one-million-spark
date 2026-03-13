
-- Update existing fights with proper titles
UPDATE prediction_fights SET title = 'Main Event — 139 lbs — A-Class', event_name = 'Silvertooth Fight Night' WHERE id = '0c2d1093-9066-48b8-9bc7-156538292def';
UPDATE prediction_fights SET title = 'Fight 9 — 147 lbs — B-Class', event_name = 'Silvertooth Fight Night' WHERE id = '89763683-31f6-48f7-bdf2-db7db1fbccd6';
UPDATE prediction_fights SET title = 'Fight 10 — 139 lbs — B-Class', event_name = 'Silvertooth Fight Night' WHERE id = '72150f7a-9975-4991-bcbc-d2ed4f25fc76';
UPDATE prediction_fights SET title = 'Fight 11 — 185 lbs — B-Class', event_name = 'Silvertooth Fight Night' WHERE id = 'ee1d434f-1873-4fd6-a6e3-c771148a7578';

-- Insert new fights
INSERT INTO prediction_fights (title, fighter_a_name, fighter_b_name, event_name, status) VALUES
  ('Fight 8 — 165 lbs — C-Class', 'Lloyal Speedy', 'Shady Elaisami', 'Silvertooth Fight Night', 'open'),
  ('Fight 7 — 200 lbs — C-Class', 'Hugo Lachaine', 'Owen Meloche', 'Silvertooth Fight Night', 'open'),
  ('Fight 4 — 156 lbs — B-Class', 'Robin Elisabeth', 'Garry Atherley', 'Silvertooth Fight Night', 'open'),
  ('Fight 3 — 139 lbs — C-Class', 'Leo Le Minh', 'Luc-Frédéric Langis', 'Silvertooth Fight Night', 'open'),
  ('Fight 2 — 125 lbs — C-Class', 'Aniss Salifi', 'Ludovic Louis-Seize', 'Silvertooth Fight Night', 'open'),
  ('Fight 1 — 165 lbs — B-Class', 'Edrick Paturel', 'Karl Swennen', 'Silvertooth Fight Night', 'open'),
  ('Semi-Final 1 — 156 lbs — B-Class', 'Jordan Trudeau', 'Christophe Groleau', 'Silvertooth Fight Night — Road to Tulum', 'open'),
  ('Semi-Final 2 — 156 lbs — B-Class', 'Rinaldo Ali', 'Quentin Pignolet', 'Silvertooth Fight Night — Road to Tulum', 'open');
