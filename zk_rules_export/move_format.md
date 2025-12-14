# Move Format Specification

This document describes the canonical move encoding for each game in the 1M Gaming platform.
All formats are designed for deterministic serialization suitable for ZK proof systems.

---

## Common Principles

- **No floating point**: All values are integers
- **No randomness**: Dice rolls are provided externally with seeds
- **Canonical ordering**: Arrays are ordered deterministically
- **Compact encoding**: Minimize bytes where possible

---

## 1. Chess (gameId: 1)

### JSON Format

```json
{
  "from": [x, y],
  "to": [x, y],
  "promotion": "q" | "r" | "b" | "n" | null
}
```

### Binary Format (4-5 bytes)

| Byte | Bits | Field |
|------|------|-------|
| 0 | 0-2 | from.x (0-7) |
| 0 | 3-5 | from.y (0-7) |
| 0 | 6-7 | reserved |
| 1 | 0-2 | to.x (0-7) |
| 1 | 3-5 | to.y (0-7) |
| 1 | 6-7 | promotion flag (00=none, 01=has promo) |
| 2 | 0-1 | promotion piece (00=q, 01=r, 10=b, 11=n) |

### Hex Encoding

```
0xFFTTPP
```
- FF: from square (0-63, row-major)
- TT: to square (0-63, row-major)
- PP: promotion (00=none, 01=queen, 02=rook, 03=bishop, 04=knight)

### Examples

```
e2e4 (pawn move): { "from": [4, 1], "to": [4, 3] } → 0x0C1C00
e7e8Q (promotion): { "from": [4, 6], "to": [4, 7], "promotion": "q" } → 0x343C01
O-O (kingside castle): { "from": [4, 0], "to": [6, 0] } → 0x040600
```

---

## 2. Checkers (gameId: 4)

### JSON Format

```json
{
  "from": [x, y],
  "to": [x, y],
  "captures": [[cx, cy], ...]
}
```

### Binary Format (variable, 4 + 2*N bytes)

| Bytes | Field |
|-------|-------|
| 0 | from.x (0-7) << 4 | from.y (0-7) |
| 1 | to.x (0-7) << 4 | to.y (0-7) |
| 2 | capture count (0-12) |
| 3+ | each capture: cx << 4 | cy |

### Hex Encoding

```
0xFFTTNN[CC...]
```
- FF: from square (packed x,y)
- TT: to square (packed x,y)
- NN: number of captures
- CC: each captured square (packed x,y)

### Examples

```
Simple move: { "from": [2, 2], "to": [3, 3], "captures": [] }
  → 0x223300

Single jump: { "from": [2, 2], "to": [4, 4], "captures": [[3, 3]] }
  → 0x22440133

Double jump: { "from": [2, 2], "to": [6, 6], "captures": [[3, 3], [5, 5]] }
  → 0x2266023355
```

---

## 3. Backgammon (gameId: 3)

### JSON Format

```json
{
  "from": number | "bar",
  "to": number | "off",
  "die": number
}
```

### Binary Format (3 bytes)

| Byte | Field |
|------|-------|
| 0 | from (0-23 for points, 255 for bar) |
| 1 | to (0-23 for points, 254 for bear-off) |
| 2 | die value (1-6) |

### Hex Encoding

```
0xFFTTDD
```
- FF: from (00-17 hex = points 0-23, FF = bar)
- TT: to (00-17 hex = points 0-23, FE = bear-off)
- DD: die used (01-06)

### Examples

```
Bar entry: { "from": "bar", "to": 23, "die": 1 }
  → 0xFF1701

Normal move: { "from": 12, "to": 6, "die": 6 }
  → 0x0C0606

Bear off: { "from": 5, "to": "off", "die": 6 }
  → 0x05FE06
```

---

## 4. Ludo (gameId: 5)

### JSON Format

```json
{
  "tokenIndex": number,
  "steps": number
}
```

### Binary Format (2 bytes)

| Byte | Field |
|------|-------|
| 0 | tokenIndex (0-3) |
| 1 | steps (0-6, where 0 = exit from base) |

### Hex Encoding

```
0xTTSS
```
- TT: token index (00-03)
- SS: steps (00 = exit base on 6, 01-06 = move steps)

### Examples

```
Exit base: { "tokenIndex": 0, "steps": 0 }
  → 0x0000

Move 4 steps: { "tokenIndex": 2, "steps": 4 }
  → 0x0204

Enter home: { "tokenIndex": 1, "steps": 3 }
  → 0x0103
```

---

## 5. Dominos (gameId: 2)

### JSON Format

```json
{
  "tileIndex": number,
  "end": "left" | "right",
  "flip": boolean
}
```

### Move Types

| tileIndex | Meaning |
|-----------|---------|
| -2 | PASS (cannot play, boneyard empty) |
| -1 | DRAW (cannot play, draw from boneyard) |
| 0-27 | PLAY (play tile at index from hand) |

### Binary Format (2 bytes)

| Byte | Bits | Field |
|------|------|-------|
| 0 | 0-5 | tileIndex (-2 to 27, offset by +2 = 0-29) |
| 0 | 6 | end (0=left, 1=right) |
| 0 | 7 | flip (0=no, 1=yes) |

### Hex Encoding

```
0xTTEF
```
- TT: tile index + 2 (00=PASS, 01=DRAW, 02-1D=tiles 0-27)
- E: end (0=left, 1=right)
- F: flip (0=no, 1=yes)

### Examples

```
PASS (can't play, boneyard empty): { "tileIndex": -2, "end": "left", "flip": false }
  → 0x0000

DRAW (can't play, draw from boneyard): { "tileIndex": -1, "end": "left", "flip": false }
  → 0x0100

Play tile 0 to left: { "tileIndex": 0, "end": "left", "flip": false }
  → 0x0200

Play tile 5 to right flipped: { "tileIndex": 5, "end": "right", "flip": true }
  → 0x0711
```

---

## State Hashing

For ZK proofs, game state should be hashed using:

1. Serialize state to canonical JSON (keys sorted alphabetically)
2. Apply SHA-256 or Poseidon hash
3. Result is 32-byte commitment

### State Serialization Order

**Chess:**
```
board → castling → enPassant → fullMoveNumber → halfMoveClock → kings → turn
```

**Checkers:**
```
board → moveCount → mustContinueFrom → turn
```

**Backgammon:**
```
bar → bearOff → dice → moveCount → points → remainingDice → seed → turn
```

**Ludo:**
```
consecutiveSixes → dice → eliminated → moveCount → playerCount → seed → tokens → turn
```

**Dominos:**
```
board → boneyard → hands → leftEnd → moveCount → passed → playerCount → rightEnd → seed → turn
```

---

## Move Validation

All moves must be validated before application:

1. Check `turn` matches `playerIndex`
2. Generate legal moves for current state
3. Verify submitted move exists in legal moves
4. Apply move and compute new state hash

This ensures deterministic state transitions for ZK verification.

---

## Seed Consumption

For games with randomness (Backgammon, Ludo, Dominos), the `seed` field in state is consumed deterministically:

1. **Backgammon**: `rollDice(state)` returns `[dice, newState]` with updated seed
2. **Ludo**: `rollDice(state)` returns `[dice, newState]` with updated seed
3. **Dominos**: Seed consumed during init for shuffle; boneyard order fixed

The LCG formula is: `next = (1664525 * seed + 1013904223) mod 2^31`

This ensures identical replay given the same initial seed.
