

## Add BKFC Fight Night Mohegan Sun Event with All 11 Fights

I scraped all the data from the BKFC website. Here is the complete event with 11 fights I will insert directly into the database.

### Event Details
- **Name:** BKFC Fight Night Mohegan Sun: Porter vs Wilson
- **Date:** March 28, 2026 6:00 PM EDT (2026-03-28T22:00:00Z)
- **Venue:** The Mohegan Sun - Uncasville, CT
- **Category:** BARE KNUCKLE
- **Organization:** BKFC
- **Status:** draft (ready for admin approval)

### All 11 Fights to Insert

| # | Fight | Weight Class | Fighter A Record | Fighter B Record |
|---|-------|-------------|-----------------|-----------------|
| 1 | Parker Porter vs Haze Wilson | Heavyweight | 3-0-0 | 4-1-0 |
| 2 | Pat Casey vs Zeb Vincent | Middleweight | 3-2-0 | 3-3-0 |
| 3 | Rico DiSciullo vs Elijah Harris | Lightweight | 3-0-0 | 2-1-0 |
| 4 | Harry Gigliotti vs Timmy Mason | Featherweight | 0-0-0 | 3-3-0 |
| 5 | Gary Balletto III vs Adam De Freitas | Middleweight | 2-0-0 | 1-2-0 |
| 6 | Alexandra Ballou vs Taylor Dagner | Women Flyweight | 0-0-0 | 0-0-0 |
| 7 | Guilherme Viana vs Joseph White | Heavyweight | 2-0-0 | 2-2-0 |
| 8 | Joseph Peters vs Maurice Horne | Light Heavyweight | 2-0-0 | 1-1-0 |
| 9 | Isaiah Williams vs Joshua Whiteside | Welterweight | 0-0-0 | 0-0-0 |
| 10 | David Burke vs Terryl Johnson | Light Heavyweight | 0-1-0 | 0-1-0 |
| 11 | Sophia Hayes vs Nadia Moreno | Women Bantamweight | 0-0-0 | 0-0-0 |

### Fighter Photos (from BKFC CDN)
All 22 fighter photos will be stored using the official BKFC CDN URLs (400x533 avatar images).

### Implementation
1. **Insert event** into `prediction_events` via database insert tool
2. **Insert all 11 fights** into `prediction_fights` with:
   - Fighter names, photos (CDN URLs), records, weight class
   - Fight class labels (Main Event, Co-Main, Featured Fight, etc.)
   - Commission at 2% (200 bps)
   - Status: open
3. All data comes from the scraped BKFC page -- no code changes needed, just database inserts

### Technical Details
- Uses the database insert tool (service-role access) since RLS blocks client writes
- Event date stored as `2026-03-28T22:00:00Z` (6:00 PM EDT = 10:00 PM UTC)
- Each fight references the event via `event_id`

