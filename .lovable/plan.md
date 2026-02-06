# Fix: Clear Dice on Turn Arrival (Polling Fallback Bug) ✅ COMPLETED

Both polling handler and visibility handler now clear dice/remainingMoves on **any** turn change, ensuring stale opponent dice values don't block the roll button when the turn arrives via polling.
