-- Enable pgcrypto extension for gen_random_bytes() function
-- This is required by issue_nonce and start_session functions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;