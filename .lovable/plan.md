

## Fix: Remove duplicate "Today" + collapse sport tabs by default

### Changes — `src/components/predictions/HomePredictionHighlights.tsx`

**1. Exclude today's fights from the tab day-groups**
In the `dayGroups` memo, filter out fights whose `eventDate` matches today. They already appear in the top preview so they shouldn't repeat inside tabs.

**2. Make sport tab content collapsed by default**
Replace the always-open day-group listing with a `Collapsible` (from `@/components/ui/collapsible`) per sport tab content area. Each sport tab's content starts **closed** — user clicks to expand. This keeps the page compact with only the 2 today cards visible by default.

Structure:
- **Today** section: max 2 cards (unchanged)
- **Sport tabs**: render as a row of tab buttons. Below, the filtered day-groups render inside a `Collapsible` that starts `open={false}`. Clicking a tab opens that sport's content; content is grouped by day with day labels.

**3. Implementation detail**
- Import `Collapsible, CollapsibleTrigger, CollapsibleContent` from ui/collapsible
- Track `tabOpen` state (boolean, default `false`). Clicking any sport tab sets `tabOpen = true`. Add a chevron toggle to collapse it back.
- When `activeSport` changes via tab click, auto-open the collapsible.
- Today's fights filtered out of `dayGroups` via `todayStr` check.

**Files changed**: Only `src/components/predictions/HomePredictionHighlights.tsx`

