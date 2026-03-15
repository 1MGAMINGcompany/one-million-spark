

## Problem

After successfully claiming prediction winnings, the Share Win card modal should appear but doesn't reliably show up. Two issues identified:

### Root Causes

1. **Event title can be empty**: Line 325 does `f?.title || ""` — if the fight's `title` field is empty or the fight isn't found in the local `fights` array (due to a realtime refresh replacing the array mid-claim), `eventTitle` becomes `""`. The modal renders but with a blank title, making it hard to notice.

2. **No user pick info passed**: The `claim_win` variant of `SocialShareModal` only receives `eventTitle` and `solWon`, but doesn't show which fighter the user picked — making the card less meaningful.

3. **Potential state race**: `loadUserEntries()` is called on line 327 immediately after setting `claimShareData`. The realtime listener also triggers `loadFights()` on entry changes, which could cause a cascade of re-renders. While `claimShareData` state should survive re-renders, moving the share trigger to after all state updates is safer.

## Fix — `src/pages/FightPredictions.tsx`

In `handleClaim`:

1. **Capture fight data before the async call** — store `fight` reference at the top of `handleClaim` before any awaits, so realtime refreshes can't invalidate it.

2. **Use robust title fallback**: `f?.title || f?.event_name || "Prediction Win"` so the card always has meaningful text.

3. **Include fighter pick info**: Look up the user's entry for this fight to find their `fighter_pick`, resolve the fighter name, and pass it as `gameTitle` (which `claim_win` variant renders as the heading).

4. **Move share trigger after all data refreshes**: Call `loadUserEntries()` first, then set `claimShareData` after a brief delay to avoid render conflicts.

```typescript
const handleClaim = async (fightId: string) => {
  if (!address) return;
  const f = fights.find(fi => fi.id === fightId);        // capture before async
  const userPick = userEntries.find(e => e.fight_id === fightId);
  setClaiming(true);
  try {
    const { data, error } = await supabase.functions.invoke("prediction-claim", {
      body: { fight_id: fightId, wallet: address },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const solWon = data.reward_sol || 0;
    toast.success("Reward claimed!", { description: `${solWon.toFixed(4)} SOL sent` });
    await loadUserEntries();
    if (SOCIAL_SHARE_ENABLED) {
      const pickedName = userPick
        ? (userPick.fighter_pick === "fighter_a" ? f?.fighter_a_name : f?.fighter_b_name)
        : undefined;
      setClaimShareData({
        eventTitle: f?.title || f?.event_name || "Prediction Win",
        solWon,
        fighterName: pickedName || undefined,
      });
    }
  } catch (err: any) { ... }
};
```

5. **Update `claimShareData` type** to include optional `fighterName`.

6. **Pass `fighterName` as `gameTitle`** to `SocialShareModal` so the claim_win variant shows which fighter won.

No changes to wallet logic, settlement, admin, or automation.

