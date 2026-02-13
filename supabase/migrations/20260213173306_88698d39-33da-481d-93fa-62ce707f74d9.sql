-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "public read receipts" ON finalize_receipts;

-- New policy: block all direct client reads (service role bypasses RLS)
CREATE POLICY "participants_read_receipts"
ON finalize_receipts FOR SELECT
USING (false);