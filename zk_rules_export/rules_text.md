# 1M Gaming — Official Game Rules

Welcome to 1M Gaming, the premier skill-based gaming platform. Below are the official rules for each game. All games are played for USDT entry fees with a 5% platform fee.

---

## Commit-Reveal Seed (For Games with Randomness)

Games that involve randomness (Backgammon dice, Ludo dice, Dominos shuffle) use a **commit-reveal** system to ensure fair, unbiased outcomes:

### How It Works

1. **Commit Phase**: Before the game begins, both players submit a commitment (hash of a secret value) to the smart contract
2. **Reveal Phase**: After both commitments are on-chain, both players reveal their secret values
3. **Verification**: The contract verifies each reveal matches its corresponding commitment
4. **Seed Generation**: The final seed is computed as `seed = hash(secret_A || secret_B)`
5. **Deterministic Derivation**: All dice rolls and shuffles are derived from this seed using a Linear Congruential Generator (LCG)

### Why This Matters

- **Neither player can predict the seed**: It depends on both secrets
- **Neither player can manipulate the outcome**: Secrets are committed before either is revealed
- **Fully verifiable**: Anyone can replay the game using the seed to verify fairness
- **ZK-compatible**: The deterministic nature enables zero-knowledge proof verification

---

## Chess

### Overview
Chess is a two-player strategy board game played on an 8×8 grid. Each player controls 16 pieces with the objective of checkmating the opponent's King.

### Setup
- White pieces occupy rows 1-2; Black pieces occupy rows 7-8
- Each player has: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
- White moves first

### Piece Movement
- **King**: One square in any direction
- **Queen**: Any number of squares horizontally, vertically, or diagonally
- **Rook**: Any number of squares horizontally or vertically
- **Bishop**: Any number of squares diagonally
- **Knight**: L-shape (2 squares + 1 square perpendicular); can jump over pieces
- **Pawn**: Forward one square (two squares on first move); captures diagonally

### Special Moves
- **Castling**: King moves 2 squares toward a Rook; Rook moves to other side of King. Requirements: neither piece has moved, no pieces between them, King not in check and doesn't pass through check
- **En Passant**: A pawn that advances 2 squares can be captured by an adjacent enemy pawn as if it moved only 1 square (must capture immediately on next move)
- **Promotion**: A pawn reaching the opponent's back rank must be promoted to Queen, Rook, Bishop, or Knight

### Win Conditions
- **Checkmate**: Opponent's King is in check with no legal escape
- **Resignation**: Opponent surrenders
- **Timeout**: Opponent runs out of time

### Draw Conditions
- **Stalemate**: Player has no legal moves but is not in check
- **Fifty-Move Rule**: 50 consecutive moves without pawn move or capture
- **Agreement**: Both players agree to draw

> **Note**: Threefold repetition and insufficient material draws are available via mutual agreement. These conditions are not auto-detected in the ZK engine due to the complexity of position history tracking.

---

## Checkers

### Overview
Checkers is a two-player game played on the dark squares of an 8×8 board. The goal is to capture all opponent pieces or block them from moving.

### Setup
- Each player starts with 12 pieces on the dark squares of their first 3 rows
- Dark/first player moves first

### Movement
- **Regular Pieces (Men)**: Move diagonally forward one square
- **Kings**: Move diagonally in any direction one square

### Capturing
- **Mandatory Capture**: If a capture is available, you MUST take it
- **Jumping**: Jump over an adjacent opponent piece to an empty square beyond
- **Chain Captures**: If after a capture another capture is possible, you MUST continue jumping
- **Choice**: If multiple captures are available, you may choose which to take

### Promotion
- A piece reaching the opponent's back row becomes a King
- Kings are marked distinctively and can move backward

### Win Conditions
- Capture all opponent pieces
- Block opponent from any legal move
- Opponent resigns or times out

### Draw Conditions
- Agreement between players
- No captures or promotions for 40 consecutive moves

---

## Backgammon

### Overview
Backgammon is a two-player game where each player has 15 checkers that move around 24 triangular points. The objective is to bear off all your checkers before your opponent.

### Setup
- 24 points numbered 1-24
- Each player starts with checkers at: 2 on point 24, 5 on point 13, 3 on point 8, 5 on point 6 (mirrored for opponent)
- Players roll dice to determine who goes first (highest roll)

### Randomness (Dice)
- Dice rolls are derived from the commit-reveal seed
- Each roll consumes the seed deterministically via LCG
- Results are fully reproducible given the initial seed

### Movement
- Roll two dice; move checkers according to the numbers
- Each die is a separate move (can be same or different checkers)
- **Doubles**: Roll doubles = play the number 4 times
- Can only land on: empty points, your own checkers, or a single opponent checker (blot)

### The Bar
- If you land on a blot, that checker goes to the bar
- Checkers on the bar MUST re-enter before making other moves
- Enter on opponent's home board (points 1-6) based on dice roll

### Bearing Off
- Once ALL your checkers are in your home board (points 1-6), you may bear off
- Must roll exact number or higher (if no checker behind)
- First to bear off all 15 checkers wins

### Win Conditions
- Bear off all 15 checkers first
- Opponent resigns or times out

### Special Wins
- **Gammon**: Win while opponent hasn't borne off any checkers (2x points)
- **Backgammon**: Gammon with opponent still having checkers on bar/your home (3x points)

---

## Ludo

### Overview
Ludo is a strategy board game for 2-4 players. Each player has 4 tokens that race around the board to reach home.

### Setup
- Each player has 4 tokens in their base (colored corner)
- Players take turns clockwise
- Roll dice to determine first player (highest roll)

### Randomness (Dice)
- Dice rolls are derived from the commit-reveal seed
- Each roll consumes the seed deterministically via LCG
- Results are fully reproducible given the initial seed

### Movement
- Roll one die per turn
- **Exiting Base**: Roll a 6 to move a token from base to start position
- Tokens move clockwise around the board
- Must use full die value when moving

### Capturing
- Land on opponent's token to send it back to their base
- **Safe Squares**: Star positions and start squares are safe—no captures
- Cannot capture your own tokens (blocked move)

### Extra Turns
- Rolling a 6 grants an extra turn
- Rolling three 6s in a row: last moved token returns to base

### Home Column
- After completing the board circuit, enter your colored home column
- Must roll exact number to enter home
- Tokens in home column cannot be captured

### Win Conditions
- First player to get all 4 tokens home wins
- In multiplayer, game ends when first player wins

---

## Dominos

### Overview
Dominos is played with 28 tiles featuring pip values 0-6 on each end. Players take turns matching tile ends to extend the board chain.

### Setup
- 2-4 players; each draws 7 tiles
- Remaining tiles form the boneyard
- Player with highest double starts (e.g., 6-6)

### Randomness (Shuffle)
- Tile shuffle is derived from the commit-reveal seed
- Uses Fisher-Yates shuffle with deterministic LCG
- Order is fully reproducible given the initial seed

### Gameplay
- Play tiles by matching one end to an open board end
- **Doubles** are placed perpendicular (first double is the "spinner")
- If you cannot play, draw from boneyard until you can (or it's empty)
- If boneyard is empty and you cannot play, pass your turn

### Move Types
- **PLAY**: Place a tile from your hand (tileIndex ≥ 0)
- **DRAW**: Draw from boneyard when you can't play (tileIndex = -1)
- **PASS**: Skip turn when you can't play and boneyard is empty (tileIndex = -2)

### Turn Rules
- Must play if possible
- Drawing continues until playable tile found or boneyard empty
- No voluntary passing when play is possible

### Win Conditions
- **Empty Hand**: First player to play all tiles wins
- **Blocked Game**: When no player can play (boneyard empty), lowest pip total wins

### Scoring
- Winner scores sum of all opponents' remaining pips
- Games typically play to 100 points across multiple rounds

---

## General Platform Rules

### Entry Fees
- All competitive games require USDT entry fee
- Minimum entry: 0.5 USDT
- Entry fees held in smart contract until game completion

### Prize Distribution
- Winner receives total pot minus 5% platform fee
- In case of draw (where applicable), entry fees returned

### Turn Time
- Players select turn time at room creation: 5, 10, 15 seconds, or Unlimited
- Exceeding turn time results in automatic loss by timeout

### Fair Randomness (Dice & Shuffles)

For games that use randomness (Ludo, Backgammon, Dominos), 1M Gaming uses a commit–reveal process to generate a fair random seed.

1. **Commit Phase**: Each player commits a hidden secret first (hash of secret submitted to contract)
2. **Reveal Phase**: After all commits are submitted, each player reveals their secret
3. **Seed Computation**: The final seed is computed from all player secrets and the room ID: `finalSeed = keccak256(roomId || secretsInJoinOrder)`
4. **Deterministic Derivation**: Dice rolls and tile shuffles are derived deterministically from the final seed using a Linear Congruential Generator (LCG)
5. **Timeout Protection**: If any player does not reveal their secret within the allowed time (120 seconds), the game is cancelled and all entry fees are refunded (no platform fee)

This ensures:
- Neither player can predict or manipulate the random outcomes
- All randomness is fully reproducible and verifiable
- Perfect fairness through cryptographic commitment

### Fair Play
- Moves are validated by the game engine and verified via cryptographic proof on-chain at game completion
- Game states are reproducible and verifiable
- Randomness derived from commit-reveal seed (unbiased, unpredictable)
- Disconnection does not stop the clock

### Disputes
- Game results determined by smart contract
- Room creator initiates payout after game completion
- All transactions verifiable on Polygon blockchain

---

*These rules are effective as of the current platform version. 1M Gaming reserves the right to update rules with notice to players.*
