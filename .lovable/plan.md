

# Fix Soccer Insights Panel + Muay Thai Fighter Images

## Two Issues

### 1. Soccer/Futbol events missing PredictionInsightsPanel
The `SoccerMatchCard` component never renders `PredictionInsightsPanel`. It's only rendered inside `FightCard` (for both soccer individual cards and non-soccer compact cards). Since soccer matches are grouped into `SoccerMatchCard`, they bypass the insights panel entirely.

**Fix**: Add `PredictionInsightsPanel` to `SoccerMatchCard.tsx`, using the `homeFight` as the data source (it shares the same event-level data). Place it between the 3-way outcome row and the footer. No Falcon API key change needed — the same edge function and `LOVABLE_API_KEY` powers all sports.

### 2. Muay Thai fighter images showing fallback 🥊 instead of photos
The `CompactFighterRow` component correctly renders photos when `fighter_a_photo` / `fighter_b_photo` exist. The session replay confirms all Muay Thai cards show the 🥊 fallback emoji, meaning the photo URLs are either `null`, empty, or failing to load. This is a **data issue** — the photos were likely present before the card redesign because the old layout may have used different fields or the ingest worker enrichment may need a re-run.

**Fix**: No code change needed for this — the rendering logic is correct. The photos need to be re-enriched via the admin panel's "re-enrich" action. However, I'll add a small improvement: if the image `onError` fires, log the failed URL in dev mode so it's easier to debug missing assets.

## File Changes

### `src/components/predictions/SoccerMatchCard.tsx`
- Import `PredictionInsightsPanel`
- Add `<PredictionInsightsPanel fight={homeFight} />` after the 3-way outcome buttons and before the footer

### `src/components/predictions/FightCard.tsx`
- In `CompactFighterRow`, add a dev-mode console.warn on image error to help debug missing fighter photos

## No API key changes needed
The AI insights use `LOVABLE_API_KEY` which is already configured. It works for all sports including soccer.

