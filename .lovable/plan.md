

# Fix: Match Share Card "MATCH NOT FOUND" + Missing Data Population

## Problem
When you win a game and share the link, opening it on another device shows "MATCH NOT FOUND". This happens because:

1. The share link points to `/match/:roomPda` which queries the `match_share_cards` table
2. The `settle-game` backend function (which runs when a game ends) **never inserts a row** into `match_share_cards`
3. The table exists but is never populated automatically -- only a handful of manually-inserted test rows exist

## Solution

### 1. Populate `match_share_cards` in the `settle-game` backend function

After the on-chain settlement succeeds and the match/profile data is recorded (around line 970), add a new step that inserts a row into `match_share_cards` with all the data the share card needs:

- `room_pda` -- from the request
- `game_type` -- from the game session
- `mode` -- from the request (casual/ranked/private)
- `winner_wallet` -- resolved winner
- `loser_wallet` -- the other player(s)
- `win_reason` -- from the settlement reason (gameover, resign, timeout, forfeit)
- `stake_lamports` -- from on-chain room data
- `winner_payout_lamports` -- calculated as `pot * 0.95`
- `fee_lamports` -- calculated as `pot * 0.05`
- `tx_signature` -- the settlement transaction signature
- `finished_at` -- current timestamp

This insert uses `ON CONFLICT (room_pda) DO NOTHING` for idempotency.

### 2. Improve the `MatchShareCard.tsx` fallback

If the `match_share_cards` row doesn't exist (for older games), fall back to querying the `matches` table which IS populated. This way even games settled before this fix will show a card (with slightly less data).

### 3. Map win reasons properly

Map the settle-game `reason` parameter to human-readable win reasons:
- `"gameover"` becomes `"checkmate"` / `"all_pieces_borne_off"` / etc. based on game type
- `"resign"` becomes `"forfeit"`
- `"timeout"` becomes `"timeout"`

## Files Changed

- `supabase/functions/settle-game/index.ts` -- Add `match_share_cards` insert after successful settlement (around line 970)
- `src/pages/MatchShareCard.tsx` -- Add fallback query to `matches` table when `match_share_cards` has no row

## Technical Details

### settle-game insert (after line 970):

```typescript
// Step 4: Insert match_share_card for brag link
try {
  const potLamports = Number(roomData.stakeLamports) * roomData.maxPlayers;
  const feeLamports = Math.floor(potLamports * 0.05);
  const payoutLamports = potLamports - feeLamports;
  const loserWallet = playersOnChain.find(p => p !== winnerWallet) || null;

  await supabase.from("match_share_cards").upsert({
    room_pda: roomPda,
    game_type: normalizeGameType(gameType),
    mode: mode || "casual",
    winner_wallet: winnerWallet,
    loser_wallet: loserWallet,
    win_reason: reason === "resign" ? "forfeit" : reason || "gameover",
    stake_lamports: Number(roomData.stakeLamports),
    winner_payout_lamports: payoutLamports,
    fee_lamports: feeLamports,
    tx_signature: signature,
    finished_at: new Date().toISOString(),
  }, { onConflict: "room_pda", ignoreDuplicates: true });
} catch (shareErr) {
  console.warn("[settle-game] match_share_cards insert failed (non-fatal):", shareErr);
}
```

### MatchShareCard.tsx fallback:

If the primary query returns no data, try:
```typescript
const { data: fallback } = await supabase
  .from("matches")
  .select("*")
  .eq("room_pda", roomPda)
  .single();
```

Then map the `matches` columns to the same shape the card expects.

