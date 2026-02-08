-- Restrict settlement_logs visibility (hide system internals)
-- Current: Anyone can read vault balances, errors, verifier info
-- New: No public access (only edge functions with service role can read/write)

DROP POLICY IF EXISTS "public read settlement_logs" ON settlement_logs;