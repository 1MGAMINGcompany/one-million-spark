

## Plan: Extract Canadian Fighter Photos from Promo Image

**Goal**: Crop individual fighter portraits from the uploaded Team Canada promo image and update each fight's database record with proper per-fighter photos.

### Fighter Mapping (left to right in image)

| Position | Name | Fight | DB Field |
|----------|------|-------|----------|
| Far left | Benito Pisanelli | Barrera vs Pisanelli | `fighter_b_photo` |
| Center-left | Mehana Yahiatene | Yahiatene vs Cruz | `fighter_a_photo` |
| Center | Jacon Caron | Caron vs Aviles | `fighter_a_photo` |
| Center-right | Dan Zhou | Zhou vs Olvera | `fighter_a_photo` |
| Far right | Quentin Pignolet | Garcia vs Pignolet | `fighter_b_photo` |

### Steps

1. **Copy uploaded image** to sandbox filesystem
2. **Crop 5 individual portraits** using Python Pillow — shoulders-up cuts for each fighter, removing background text/logos as much as possible
3. **Upload each cropped photo** to the `fighter-photos` storage bucket under `silvertooth/` (e.g. `silvertooth/pisanelli.png`)
4. **Update 5 `prediction_fights` rows** — set the correct `fighter_a_photo` or `fighter_b_photo` column to the new individual photo URL (replacing the current shared fight-pair photos)

### What Won't Change
- No component code changes — `SimplePredictionCard` already renders individual fighter photos
- Fight data, odds, pools, status all untouched
- Mexican fighter photos will be done separately after you upload that image

