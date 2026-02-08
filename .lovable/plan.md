
# Opponent Absence Detection & UX - All Games

## Problem Analysis

From your test (Room `9M6iS3jV...`):

```text
TIMELINE:
20:10:49 - Creator timeout (strike 1) → Your turn
20:10:57 - YOU timed out (strike 1) → Creator's turn
20:11:05 - Creator timeout (strike 2) → Your turn  
20:11:15 - YOU timed out (strike 2) → Creator's turn
20:11:24 - Creator timeout (strike 3) → AUTO-FORFEIT → YOU WON ✅
```

**The auto-forfeit worked!** But the UX was confusing because:
1. No clear indication that opponent was disconnected/absent
2. No countdown showing "X seconds until opponent forfeits"
3. When turn passed to you, you couldn't play because your timer was also running (10s is very short)
4. Strikes alternated between both players

## Solution Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    OPPONENT ABSENCE UI                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ⚠️ OPPONENT ABSENT                                         │   │
│  │  ────────────────────────────────────────────────────────   │   │
│  │  Opponent has missed 2/3 turns                              │   │
│  │  Auto-win in: 0:08                                          │   │
│  │                                                              │   │
│  │  [ Keep waiting ]  or  [ Forfeit to end now ]               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Shows when:                                                        │
│  - It's opponent's turn AND                                        │
│  - opponent has missed_turns >= 1                                   │
│                                                                     │
│  Countdown: turn_time_seconds - (now - turn_started_at)            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. New Component: `OpponentAbsenceIndicator`

**File: `src/components/OpponentAbsenceIndicator.tsx`**

Props:
- `opponentStrikes: number` (0-3)
- `turnTimeSeconds: number`
- `turnStartedAt: string | null` (ISO timestamp)
- `isOpponentsTurn: boolean`
- `playerCount: number` (2 for standard, 3-4 for Ludo)
- `gameType: string` (for messaging)

Features:
- Shows amber/warning banner when opponent has strikes ≥ 1
- Live countdown to next timeout
- Strike progress indicator (1/3, 2/3)
- Different messaging for Ludo (elimination vs forfeit)

### 2. Update All Game Pages to Track Strike State

Each game needs:
- State: `opponentStrikes` (from DB `missed_turns` JSONB)
- State: `turnStartedAt` (from DB session)
- Polling already fetches session - extract these fields

### 3. Implement Polling in Missing Games

Currently:
- ✅ ChessGame - has polling (just added)
- ✅ BackgammonGame - has polling
- ❌ CheckersGame - missing
- ❌ DominosGame - missing  
- ❌ LudoGame - missing

Each needs the same polling pattern:
```typescript
// Poll every 3s (desktop) / 1.5s (wallet browser)
useEffect(() => {
  const pollInterval = isWalletInAppBrowser() ? 1500 : 3000;
  
  const poll = async () => {
    const { data } = await supabase.functions.invoke("game-session-get", {
      body: { roomPda },
    });
    
    // 1. Check if game finished
    if (data?.session?.status === 'finished') { /* handle win/loss */ }
    
    // 2. If opponent's turn, try to apply timeout
    if (isOpponentsTurn) {
      const { data: result } = await supabase.rpc("maybe_apply_turn_timeout", {
        p_room_pda: roomPda,
      });
      
      if (result?.applied && result.type === "auto_forfeit") {
        // Show win screen
      } else if (result?.type === "turn_timeout") {
        // Update turn, show toast
        setOpponentStrikes(result.strikes);
      }
    }
    
    // 3. Extract opponent strikes for UI
    const missedTurns = data?.session?.missed_turns || {};
    const opponentWallet = getOpponentWallet(...);
    setOpponentStrikes(missedTurns[opponentWallet] || 0);
    setTurnStartedAt(data?.session?.turn_started_at);
  };
  
  const interval = setInterval(poll, pollInterval);
  return () => clearInterval(interval);
}, [roomPda, isRankedGame, ...]);
```

### 4. Ludo Special Handling

For 3-4 player games:
- Show "Player X eliminated" instead of "You win"
- Track which players are still active
- Only show "You Win" when only 1 player remains
- Different messaging: "2/3 missed turns - {Player} will be eliminated"

### 5. Localization Keys

Add to all locale files:
```json
"gameSession": {
  "opponentAbsent": "Opponent Absent",
  "opponentMissedTurns": "Opponent has missed {{count}}/3 turns",
  "autoWinIn": "Auto-win in: {{time}}",
  "keepWaiting": "Keep Waiting",
  "playerMissedTurns": "{{player}} has missed {{count}}/3 turns",
  "playerWillBeEliminated": "{{player}} will be eliminated in: {{time}}",
  "strikesReset": "Strikes reset - opponent is back"
}
```

## Files to Change

| File | Change |
|------|--------|
| **`src/components/OpponentAbsenceIndicator.tsx`** | **NEW** - Opponent absence banner component |
| `src/pages/ChessGame.tsx` | Add state for `opponentStrikes`, `turnStartedAt`, render indicator |
| `src/pages/BackgammonGame.tsx` | Add state, render indicator |
| `src/pages/CheckersGame.tsx` | Add full polling loop + state + indicator |
| `src/pages/DominosGame.tsx` | Add full polling loop + state + indicator |
| `src/pages/LudoGame.tsx` | Add polling with elimination logic + indicator |
| `src/i18n/locales/*.json` | Add 6-8 new localization keys (all 11 locales) |

## Technical Details

### OpponentAbsenceIndicator Component

```typescript
interface OpponentAbsenceIndicatorProps {
  opponentStrikes: number;
  turnTimeSeconds: number;
  turnStartedAt: string | null;
  isOpponentsTurn: boolean;
  playerCount?: number; // 2, 3, or 4
  opponentName?: string; // For Ludo multi-player display
}

function OpponentAbsenceIndicator({ ... }) {
  const [countdown, setCountdown] = useState(0);
  
  // Calculate countdown to next timeout
  useEffect(() => {
    if (!turnStartedAt || !isOpponentsTurn) return;
    
    const tick = () => {
      const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
      const remaining = Math.max(0, turnTimeSeconds - elapsed);
      setCountdown(Math.ceil(remaining));
    };
    
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [turnStartedAt, turnTimeSeconds, isOpponentsTurn]);
  
  // Only show when opponent has strikes
  if (!isOpponentsTurn || opponentStrikes === 0) return null;
  
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-400">
        <WifiOff className="h-5 w-5" />
        <span className="font-medium">{t("gameSession.opponentAbsent")}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {t("gameSession.opponentMissedTurns", { count: opponentStrikes })}
      </p>
      <p className="text-lg font-mono text-amber-400 mt-2">
        {t("gameSession.autoWinIn")}: {formatTime(countdown)}
      </p>
      <Progress value={(opponentStrikes / 3) * 100} className="mt-2" />
    </div>
  );
}
```

### Polling State Extraction

In each game's poll function, extract opponent strikes:
```typescript
const session = data?.session;
const missedTurns = session?.missed_turns as Record<string, number> || {};
const opponentWallet = getOpponentWallet(address, session?.player1_wallet, session?.player2_wallet);
const strikes = missedTurns[opponentWallet] || 0;
setOpponentStrikes(strikes);
setTurnStartedAt(session?.turn_started_at);
```

## Ludo Specific Changes

For 3-4 player games:
1. Track `missedTurns` per player (not just opponent)
2. Show indicator for current turn holder's strikes
3. Message changes to "will be eliminated" instead of "you'll win"
4. On elimination, remove player from rotation
5. Only show "You Win" when 1 player remains

## Testing Checklist

1. **Chess**: Create game, join, creator leaves → joiner sees absence indicator → auto-win after 3 strikes
2. **Backgammon**: Same flow
3. **Checkers**: Same flow (new implementation)
4. **Dominos**: Same flow (new implementation)
5. **Ludo 2-player**: Same flow
6. **Ludo 3-4 player**: Verify elimination vs win messaging
7. **Strike reset**: Opponent returns mid-game → indicator disappears
8. **Short timer (5-10s)**: Verify countdown updates correctly
