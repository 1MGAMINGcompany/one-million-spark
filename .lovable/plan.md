

# Populate Full Silvertooth Fight Night Card

## Current State
The database has 4 fights seeded (Main Event, Co-Main, and 2 Undercards). The user provided the complete 14-fight card including a 4-man tournament.

## Plan

### 1. Update existing fights with proper titles/details
- Update the 4 existing fights to match the new data (add weight class, proper fight numbering)
- Main Event: Cabrera vs Leboeuf — already correct, update title to include "139 lbs — A-Class"
- Update "Co-Main Event" (Caron vs Franco-Flores) → "Fight 9 — 147 lbs — B-Class"
- Update "Undercard" (Deidouss vs Sidhu) → "Fight 10 — 139 lbs — B-Class"
- Update "Undercard" (Elmoubtahil vs Perreira) → "Fight 11 — 185 lbs — B-Class"
- Update event_name to "Silvertooth Fight Night" on all

### 2. Insert 7 new individual fights
- Fight 8: Lloyal Speedy vs Shady Elaisami (165 lbs, C-Class)
- Fight 7: Hugo Lachaine vs Owen Meloche (200 lbs, C-Class)
- Fight 4: Robin Elisabeth vs Garry Atherley (156 lbs, B-Class)
- Fight 3: Leo Le Minh vs Luc‑Frédéric Langis (139 lbs, C-Class)
- Fight 2: Aniss Salifi vs Ludovic Louis‑Seize (125 lbs, C-Class)
- Fight 1: Edrick Paturel vs Karl Swennen (165 lbs, B-Class)

### 3. Insert tournament fights (Road to Tulum)
- Semi-Final 1: Jordan Trudeau vs Christophe Groleau (156 lbs, B-Class)
- Semi-Final 2: Rinaldo Ali vs Quentin Pignolet (156 lbs, B-Class)
- Final: TBD vs TBD (status = "locked" until semis resolve — or leave as a placeholder that admin creates after semis)

Since the tournament final depends on semi-final outcomes, I'll create the two semi-finals as open prediction markets. The final can be created by admin after semis resolve.

### 4. Update frontend to show weight/class info
- The `prediction_fights` table `title` column will carry the fight number + weight + class
- No schema changes needed — just data updates + minor UI tweak to show the richer title info

### Implementation
All changes are **data inserts/updates** via the insert tool (no schema migration needed) plus a minor UI enhancement to display weight class badges on fight cards.

**Data operations:**
- 4 UPDATEs to existing fights (title, event_name)
- 9 INSERTs for new fights (6 individual + 2 tournament semis + keeping room for admin to create final)

**Frontend tweak:**
- Parse title to extract weight/class for display badge on fight cards

