

# Diagnosis: Why Events Are Still Missing After Publishing

## What's Actually Wrong

### 1. The new cron job (jobid 11) has NEVER fired
The 4x daily cron job was created but has **zero runs** in `cron.job_run_details`. It was created after the 00:00 UTC window, so the first fire will be at **06:00 UTC today** (~3 hours from now). The old daily cron (jobid 9) was unscheduled, so **no imports have happened since April 4 at 06:00 UTC**. That means:
- Zero new NHL games imported since the April 11+ batch
- Zero new cricket/esports/tennis events imported
- The code changes are deployed (edge function auto-deploys), but the function hasn't been **triggered**

### 2. Frontend is published but there's no new data to show
You published the frontend correctly. The Esports tab, cricket subdivisions, and server-side prop filtering are all live. But since the sync hasn't run, the database still has the same old inventory.

### 3. NHL tag 899 should have current-week games
NHL uses tag-based fetching (tagId `899`). When the sync runs, it should pull all available NHL events from Polymarket. The gap exists purely because the sync hasn't fired since April 4.

## Plan: Force an Immediate Sync + Verify Cron

### Step 1: Manually trigger the daily import NOW
Call the `polymarket-sync` edge function with `{"action": "daily_import"}` to force an immediate import across all 40+ leagues. This will populate NHL current-week, cricket, esports, and tennis events immediately.

### Step 2: Verify results in the database
After the sync completes, query the database to confirm:
- NHL games for April 5-10 are present
- Cricket events beyond just IPL exist
- CS2/Esports events imported
- Tennis events imported

### Step 3: Verify the 06:00 UTC cron fires
After 06:00 UTC, check `cron.job_run_details` for jobid 11 to confirm the automated 4x daily schedule is working going forward.

### Step 4: If cron still doesn't fire, recreate it
If jobid 11 still shows zero runs after 06:00 UTC, we'll delete and recreate the cron job to ensure it's properly registered.

## No Code Changes Needed
The code is correct and deployed. The issue is purely that the sync hasn't been triggered since the changes went live. One manual trigger will populate everything.

## Technical Details
- Edge function `polymarket-sync` with `daily_import` action processes all leagues in `COMBAT_AND_SOCCER_KEYS` + `PLATFORM_ONLY_KEYS`
- NHL uses tag 899 (reliable), Cricket uses search seeds, CS2 uses search seeds
- All platform sports now get `trading_allowed: true` so operator apps display them

