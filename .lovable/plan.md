

# Fix: "Player not found" on My Profile for Privy Users

## Problem
The Navbar's "My Profile" button navigates to `/player/${walletAddress}` where `walletAddress` is the EVM smart wallet address (e.g. `0x3ed...`). But `PlayerProfile` queries `player_profiles` which only contains Solana wallet addresses. Privy-only users have no row there, so they get "Player not found".

## Solution
Make the profile page work for EVM wallet users by checking both `player_profiles` (Solana games) and `prediction_entries` (predictions). If no Solana profile exists but prediction entries do, show a predictions-focused profile instead of an error.

## Changes

### `src/pages/PlayerProfile.tsx`
1. Import `usePrivyWallet` to detect own EVM profile (in addition to Solana `useWallet`)
2. Update `isOwnProfile` check to also match when `wallet` param equals the Privy EVM address
3. In `fetchProfile`: if `player_profiles` returns no row, instead of showing "Player not found", check `prediction_entries` for that wallet. If entries exist, set profile to a default empty profile object (0 games, 0 wins, etc.) so the page renders with just the predictions section
4. If neither profile nor predictions exist, then show "Player not found"

### `src/components/Navbar.tsx`
No changes needed — it already correctly links to the EVM wallet address. The fix is entirely in how `PlayerProfile` handles missing Solana profiles.

## Technical Detail
```typescript
// In fetchProfile, after player_profiles returns null:
if (!profileData) {
  // Check if this wallet has prediction entries
  const { count } = await supabase
    .from('prediction_entries')
    .select('id', { count: 'exact', head: true })
    .eq('wallet', wallet);
  
  if (count && count > 0) {
    // Create a shell profile so the page renders with predictions
    setProfile({
      wallet,
      games_played: 0, wins: 0, losses: 0, win_rate: 0,
      total_sol_won: 0, biggest_pot_won: 0,
      current_streak: 0, longest_streak: 0,
      favorite_game: null, last_game_at: null,
    });
    // Continue to fetch predictions below
  } else {
    setError('Player not found');
    setLoading(false);
    return;
  }
}
```

The predictions fetch already uses the `wallet` param, so it will work with EVM addresses that exist in `prediction_entries`.

