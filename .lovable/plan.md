

# Add Fighter Info to Match Center (View Details & Odds)

## What We Have
- The `stats_json` column on `prediction_fights` exists but is **null** for all 11 BKFC fights
- The MatchCenter page already renders `stats_json` data in a "Fighter Stats" card at the bottom
- BKFC event page provides: height, fist size, weight, record per fighter
- Individual BKFC fighter pages provide additional data: reach, age, nationality, nickname, division, bio

## Plan

### Step 1 — Scrape fighter data from BKFC
Fetch each of the 22 individual fighter profile pages on bkfc.com to collect:
- Height, reach, age, nationality, nickname, division, bio summary

Combined with the event page data already scraped (fist size, weight).

### Step 2 — Populate `stats_json` for all 11 fights
Use the database insert tool to UPDATE each fight's `stats_json` with structured data like:
```json
{
  "fighter_a": {
    "height": "6'0\"",
    "reach": "73in / 185cm",
    "fist_size": "33cm",
    "weight": "245 lbs",
    "age": 40,
    "nationality": "USA",
    "nickname": "",
    "division": "Heavyweight"
  },
  "fighter_b": { ... }
}
```

### Step 3 — Add a dedicated "Fighters" tab to MatchCenter
Currently the tabs are: About | Odds | News. Add a **Fighters** tab (between About and Odds) that shows a side-by-side comparison card:
- Photos (already displayed in hero, but repeated smaller here)
- Record (already in `fighter_a_record` / `fighter_b_record`)
- Height, Reach, Fist Size, Weight, Age, Nationality — as a comparison table with fighter A on left, stat label center, fighter B on right
- Bio snippet (if available, stored in `stats_json.fighter_a.bio`)

This is more visually engaging than the current generic key-value `StatBlock` renderer.

### Step 4 — Enhance the ProfileCard in the hero section
Show 2-3 key stats (height, reach, age) directly under each fighter's name/record in the hero matchup card, so users see headline stats without needing to open the tab.

### Technical Details
- **Database**: 11 UPDATE statements via insert tool to populate `stats_json`
- **UI**: Modify `src/pages/MatchCenter.tsx` to add a "Fighters" tab with a comparison layout
- **No schema changes needed** — `stats_json` (jsonb) column already exists
- Fighter bios will be truncated to ~2 sentences for the card view

