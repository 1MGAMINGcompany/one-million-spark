

# Chess Winning Move on Share Cards

## What We're Building

When a player wins at chess (AI or PvP), we'll:
1. **Highlight the winning move** on the board with a golden glow animation
2. **Capture a screenshot** of the board showing the winning move
3. **Embed that board image** into both the AI Win Share Card and the PvP Share Result Card
4. Players can then share the image with the winning position visible on social media

## How It Works

```text
Checkmate detected
  → Track lastMove {from, to}
  → Highlight from/to squares with gold pulse on ChessBoardPremium
  → Wait ~2s for player to see the move
  → Use html-to-image to snapshot the board div
  → Pass boardImage (data URL) to share card
  → Share card renders the board snapshot in the card body
  → Player downloads/shares image with the winning position embedded
```

## Changes

### 1. ChessBoardPremium — Add last-move + checkmate highlight
**File:** `src/components/ChessBoardPremium.tsx`
- Add props: `lastMove?: { from: Square; to: Square }`, `isCheckmate?: boolean`
- Render a gold overlay on `from` and `to` squares when `lastMove` is set
- When `isCheckmate` is true, use an intensified pulsing gold animation with glow
- CSS keyframes for the pulse effect (matches the Egyptian gold theme)

### 2. ChessAI — Track lastMove, capture board screenshot, delay share card
**File:** `src/pages/ChessAI.tsx`
- Add `lastMove` state, update it on every player and AI move
- Pass `lastMove` and `isCheckmate` to `ChessBoardPremium`
- On checkmate: delay showing the share card by ~2.5s, during which use `toPng` (already installed via `html-to-image`) to snapshot the board element
- Pass `boardImage` data URL to `AIWinShareCard`

### 3. ChessGame (PvP) — Same lastMove tracking + board snapshot
**File:** `src/pages/ChessGame.tsx`
- Add `lastMove` state, update on each move (local + WebRTC received)
- Pass to `ChessBoardPremium`
- On checkmate: capture board screenshot and pass to `ShareResultCard`

### 4. AIWinShareCard — Render board snapshot for chess wins
**File:** `src/components/AIWinShareCard.tsx`
- Add optional prop `boardImage?: string` (data URL)
- When provided, render the board image between the game icon and the Ankh divider
- Styled with a gold border + rounded corners to match the card aesthetic
- Replace the generic game icon area with the actual board position

### 5. ShareResultCard — Render board snapshot for PvP chess wins
**File:** `src/components/ShareResultCard.tsx`
- Add optional prop `boardImage?: string`
- When provided, render the board image in the card body
- Only shows for chess games (other games don't have a board snapshot)

### 6. Display winning move notation
- Show the last move in algebraic notation (e.g., "Qh7#") on the share card as a small label below the board image
- Available from `moveHistory[moveHistory.length - 1]` — already tracked in both files

## Summary

| File | Change |
|---|---|
| `ChessBoardPremium.tsx` | Add `lastMove` + `isCheckmate` props with gold highlight overlays |
| `ChessAI.tsx` | Track lastMove, capture board PNG on win, delay share card 2.5s |
| `ChessGame.tsx` | Track lastMove, capture board PNG on win |
| `AIWinShareCard.tsx` | Add `boardImage` prop, render board snapshot in card |
| `ShareResultCard.tsx` | Add `boardImage` prop, render board snapshot for chess |

