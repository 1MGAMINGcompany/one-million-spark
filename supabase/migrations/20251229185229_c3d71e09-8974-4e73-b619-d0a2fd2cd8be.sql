-- Enable pgcrypto extension for gen_random_bytes() function
-- Using public schema since extensions schema may not exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;