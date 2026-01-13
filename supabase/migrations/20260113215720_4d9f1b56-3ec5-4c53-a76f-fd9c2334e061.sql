-- finalize_receipts: one row per room
ALTER TABLE public.finalize_receipts
ADD CONSTRAINT finalize_receipts_room_pda_unique UNIQUE (room_pda);

-- matches: one row per room (or per completed match)
ALTER TABLE public.matches
ADD CONSTRAINT matches_room_pda_unique UNIQUE (room_pda);