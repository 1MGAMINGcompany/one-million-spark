import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-prices — Lightweight price + volume + enrichment refresh.
 *
 * Called by frontend polling (45s) to keep prices, volume, images, and names fresh.
 * Fetches from:
 *   - CLOB API: live BUY prices per outcome token
 *   - Gamma API: volume, outcomes (real names), description, league images
 *   - TheSportsDB: team badges (soccer) and fighter photos (combat)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const PM_S3_BASE = "https://polymarket-upload.s3.us-east-2.amazonaws.com";
const BDL_MMA_BASE = "https://api.balldontlie.io/mma/v1";

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA",
  "CHAMPIONS LEAGUE", "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE",
  "LIGA MX", "EPL", "COPA", "EURO", "FIFA", "WORLD CUP",
];

function isSoccerEvent(eventName: string, source?: string): boolean {
  if (source === "api-football") return true;
  const upper = (eventName || "").toUpperCase();
  return SOCCER_KEYWORDS.some((k) => upper.includes(k));
}

/** Strip common suffixes for better TheSportsDB matching */
function cleanTeamName(name: string): string {
  return name
    .replace(/\s+de\s+Fútbol$/i, "")
    .replace(/\s+de\s+Futbol$/i, "")
    .replace(/\s+CF$/i, "")
    .replace(/\s+FC$/i, "")
    .replace(/\s+SC$/i, "")
    .replace(/\s+AC$/i, "")
    .replace(/\s+FK$/i, "")
    .replace(/\s+B$/i, "") // reserve teams like "Real Sociedad B"
    .trim();
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Fetch team badge from TheSportsDB — tries original name then cleaned */
async function fetchTeamBadge(teamName: string): Promise<string | null> {
  const names = [teamName, cleanTeamName(teamName)];
  // Deduplicate
  const unique = [...new Set(names.filter(Boolean))];
  for (const name of unique) {
    try {
      const res = await fetch(`${TSDB_BASE}/searchteams.php?t=${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const team = data?.teams?.[0];
      const badge = team?.strBadge || team?.strLogo || null;
      if (badge) return badge;
    } catch { /* continue */ }
  }
  return null;
}

/** Fetch fighter photo from BallDontLie MMA API */
async function fetchFighterPhotoBDL(fighterName: string): Promise<string | null> {
  const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
  if (!apiKey) {
    console.log("[BDL] No BALLDONTLIE_API_KEY configured");
    return null;
  }
  try {
    const url = `${BDL_MMA_BASE}/fighters?search=${encodeURIComponent(fighterName)}`;
    console.log(`[BDL] Fetching: ${url}`);
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.log(`[BDL] HTTP ${res.status} for "${fighterName}"`);
      return null;
    }
    const data = await res.json();
    const fighters = data?.data || [];
    console.log(`[BDL] Found ${fighters.length} results for "${fighterName}"`);
    // Find best match by full name
    const nameUpper = fighterName.toUpperCase();
    const match = fighters.find((f: any) =>
      `${f.first_name} ${f.last_name}`.toUpperCase() === nameUpper
    ) || fighters[0];
    const imgUrl = match?.image_url || null;
    console.log(`[BDL] Best match: ${match ? `${match.first_name} ${match.last_name}` : "none"} | img=${imgUrl}`);
    return imgUrl;
  } catch (e) {
    console.warn(`[BDL] Error for "${fighterName}":`, e);
    return null;
  }
}

/** Fetch fighter cutout photo from TheSportsDB (fallback) */
async function fetchFighterPhotoTSDB(fighterName: string): Promise<string | null> {
  try {
    const res = await fetch(`${TSDB_BASE}/searchplayers.php?p=${encodeURIComponent(fighterName)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const players = data?.player || [];
    const fighter = players.find((p: any) =>
      ["Fighting", "MMA", "Boxing", "Muay Thai"].includes(p.strSport)
    ) || null;
    return fighter?.strCutout || fighter?.strThumb || null;
  } catch {
    return null;
  }
}

/** Try multiple sources for fighter photo */
async function fetchFighterPhoto(fighterName: string): Promise<string | null> {
  // Try BallDontLie first (better MMA coverage), then TheSportsDB
  const bdl = await fetchFighterPhotoBDL(fighterName);
  if (bdl) return bdl;
  return fetchFighterPhotoTSDB(fighterName);
}

/** Parse real outcome names from Gamma outcomes JSON string */
function parseOutcomeNames(outcomesStr: string | null): [string, string] | null {
  if (!outcomesStr) return null;
  try {
    const arr = JSON.parse(outcomesStr);
    if (Array.isArray(arr) && arr.length >= 2) {
      return [arr[0], arr[1]];
    }
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all active Polymarket-backed fights
    const { data: fights, error } = await supabase
      .from("prediction_fights")
      .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_condition_id, polymarket_market_id, fighter_a_photo, fighter_b_photo, home_logo, away_logo, fighter_a_name, fighter_b_name, event_name, title, source, polymarket_question")
      .eq("polymarket_active", true)
      .not("polymarket_outcome_a_token", "is", null)
      .in("status", ["open", "locked", "live"]);

    if (error) throw error;
    if (!fights || fights.length === 0) {
      return json({ updated: 0 });
    }

    let updated = 0;
    const errors: string[] = [];
    const enriched: string[] = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < fights.length; i += BATCH_SIZE) {
      const batch = fights.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (fight) => {
          // ── 1. Fetch CLOB prices (non-fatal if fails) ──
          let priceA = 0;
          let priceB = 0;
          try {
            const [resA, resB] = await Promise.all([
              fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`),
              fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`),
            ]);
            if (resA.ok && resB.ok) {
              const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
              priceA = parseFloat(dataA?.price || "0");
              priceB = parseFloat(dataB?.price || "0");
            }
          } catch (e) {
            console.warn(`[polymarket-prices] CLOB price fetch failed for ${fight.id}:`, e);
          }

          // ── 2. Fetch Gamma market data (volume, outcomes, description, image) ──
          let totalVolume = 0;
          let poolAUsd = 0;
          let poolBUsd = 0;
          let gammaImage: string | null = null;
          let gammaOutcomes: [string, string] | null = null;
          let gammaDescription: string | null = null;

          if (fight.polymarket_market_id) {
            try {
              const gammaRes = await fetch(`${GAMMA_BASE}/markets/${fight.polymarket_market_id}`);
              if (gammaRes.ok) {
                const market = await gammaRes.json();
                if (market) {
                  totalVolume = parseFloat(market.volumeNum || market.volume || "0");
                  if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                    poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                    poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                  }
                  gammaImage = market.image || market.icon || null;
                  gammaOutcomes = parseOutcomeNames(market.outcomes);
                  gammaDescription = market.description || null;
                }
              }
            } catch (e) {
              console.warn(`[polymarket-prices] Gamma fetch failed for ${fight.id}:`, e);
            }
          }

          // ── 3. Build update payload ──
          const updatePayload: Record<string, any> = {
            price_a: priceA,
            price_b: priceB,
            polymarket_last_synced_at: new Date().toISOString(),
          };

          if (totalVolume > 0) {
            updatePayload.polymarket_volume_usd = totalVolume;
            updatePayload.pool_a_usd = poolAUsd;
            updatePayload.pool_b_usd = poolBUsd;
          }

          // ── 4. Backfill real outcome names (replace Yes/No) ──
          if (gammaOutcomes) {
            const [nameA, nameB] = gammaOutcomes;
            if (fight.fighter_a_name === "Yes" && nameA !== "Yes") {
              updatePayload.fighter_a_name = nameA;
              enriched.push(`${fight.id}: name_a=${nameA}`);
            }
            if (fight.fighter_b_name === "No" && nameB !== "No") {
              updatePayload.fighter_b_name = nameB;
              enriched.push(`${fight.id}: name_b=${nameB}`);
            }
          }

          // ── 5. Backfill polymarket_question from description ──
          if (gammaDescription && !fight.polymarket_question) {
            updatePayload.polymarket_question = gammaDescription;
          }

          // ── 6. Image enrichment via TheSportsDB ──
          const soccer = isSoccerEvent(fight.event_name || "", fight.source);

          if (soccer) {
            // Parse team names from event_name: "Team A vs. Team B"
            const vsMatch = (fight.event_name || "").match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
            if (vsMatch) {
              const [, homeTeam, awayTeam] = vsMatch;
              // Fetch team badges in parallel
              if (!fight.home_logo) {
                const badge = await fetchTeamBadge(homeTeam.trim());
                if (badge) {
                  updatePayload.home_logo = badge;
                  enriched.push(`${fight.id}: home_logo from TSDB`);
                }
              }
              if (!fight.away_logo) {
                const badge = await fetchTeamBadge(awayTeam.trim());
                if (badge) {
                  updatePayload.away_logo = badge;
                  enriched.push(`${fight.id}: away_logo from TSDB`);
                }
              }
            }
            // Also set fighter photos to home/away logos as fallback
            if (!fight.fighter_a_photo && updatePayload.home_logo) {
              updatePayload.fighter_a_photo = updatePayload.home_logo;
            }
            if (!fight.fighter_b_photo && updatePayload.away_logo) {
              updatePayload.fighter_b_photo = updatePayload.away_logo;
            }
          } else {
            // Combat sports: try to get fighter photos
            const resolvedNameA = updatePayload.fighter_a_name || fight.fighter_a_name;
            const resolvedNameB = updatePayload.fighter_b_name || fight.fighter_b_name;

            if (!fight.fighter_a_photo && resolvedNameA && resolvedNameA !== "Yes" && resolvedNameA !== "Over") {
              console.log(`[enrichment] Looking up fighter_a photo: "${resolvedNameA}"`);
              const photo = await fetchFighterPhoto(resolvedNameA);
              if (photo) {
                updatePayload.fighter_a_photo = photo;
                enriched.push(`${fight.id}: fighter_a_photo`);
              } else {
                console.log(`[enrichment] No photo found for "${resolvedNameA}"`);
              }
            }
            if (!fight.fighter_b_photo && resolvedNameB && resolvedNameB !== "No" && resolvedNameB !== "Under") {
              console.log(`[enrichment] Looking up fighter_b photo: "${resolvedNameB}"`);
              const photo = await fetchFighterPhoto(resolvedNameB);
              if (photo) {
                updatePayload.fighter_b_photo = photo;
                enriched.push(`${fight.id}: fighter_b_photo`);
              } else {
                console.log(`[enrichment] No photo found for "${resolvedNameB}"`);
              }
            }
          }

          await supabase
            .from("prediction_fights")
            .update(updatePayload)
            .eq("id", fight.id);

          return { id: fight.id, priceA, priceB, totalVolume };
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          updated++;
        } else {
          errors.push(r.reason?.message || "unknown");
        }
      }
    }

    return json({
      updated,
      total: fights.length,
      enriched: enriched.length > 0 ? enriched : undefined,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
