import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-prices — Lightweight price + volume + enrichment refresh.
 *
 * Called by frontend polling (45s) to keep prices, volume, images, and names fresh.
 * Fetches from:
 *   - CLOB API: live BUY prices per outcome token
 *   - Gamma API: volume, outcomes (real names), description, league images, liquidity, 24h vol
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
  // Apply suffix stripping iteratively — "Real Sociedad de Fútbol B"
  // needs " B" stripped first, then "de Fútbol" becomes the new suffix.
  let cleaned = name.trim();
  const suffixes = [
    /\s+B$/i,           // reserve teams first (e.g. "Real Sociedad B")
    /\s+II$/i,          // second teams
    /\s+de\s+F[uú]tbol$/i,
    /\s+CF$/i,
    /\s+FC$/i,
    /\s+SC$/i,
    /\s+AC$/i,
    /\s+FK$/i,
    /\s+AF$/i,
  ];
  // Two passes to handle chained suffixes like "de Fútbol B"
  for (let pass = 0; pass < 2; pass++) {
    for (const rx of suffixes) {
      cleaned = cleaned.replace(rx, "");
    }
  }
  return cleaned.trim();
}

/** Check if a fighter name is a generic label (not a real name) */
function isGenericLabel(name: string): boolean {
  const upper = (name || "").toUpperCase().trim();
  return ["YES", "NO", "OVER", "UNDER"].includes(upper) || /^(OVER|UNDER)\s+\d/.test(upper);
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Fetch team badge from TheSportsDB — tries original name then cleaned */
async function fetchTeamBadge(teamName: string): Promise<string | null> {
  const names = [teamName, cleanTeamName(teamName)];
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
  if (!apiKey) return null;
  try {
    const url = `${BDL_MMA_BASE}/fighters?search=${encodeURIComponent(fighterName)}`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    const data = await res.json();
    const fighters = data?.data || [];
    const nameUpper = fighterName.toUpperCase();
    const match = fighters.find((f: any) =>
      `${f.first_name} ${f.last_name}`.toUpperCase() === nameUpper
    ) || fighters[0];
    return match?.image_url || null;
  } catch {
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

/** Try Polymarket's own S3 bucket for fighter/team images */
async function fetchPolymarketS3Photo(name: string, sport: string): Promise<string | null> {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const folder = sport === "soccer" ? "soccer" : "mma";
  const url = `${PM_S3_BASE}/team_logos/${folder}/${slug}.png`;
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return url;
    return null;
  } catch {
    return null;
  }
}

/** Try multiple sources for fighter photo — Polymarket S3 first, then BDL, then TSDB */
async function fetchFighterPhoto(fighterName: string): Promise<string | null> {
  const pm = await fetchPolymarketS3Photo(fighterName, "mma");
  if (pm) return pm;
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
      .select("id, polymarket_outcome_a_token, polymarket_outcome_b_token, polymarket_condition_id, polymarket_market_id, fighter_a_photo, fighter_b_photo, home_logo, away_logo, fighter_a_name, fighter_b_name, event_name, title, source, polymarket_question, event_id")
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

    // ── Pre-build sibling image map for prop market inheritance ──
    // Group fights by event_name to find "parent" fights that have images
    const eventImageMap = new Map<string, { fighter_a_photo: string | null; fighter_b_photo: string | null; home_logo: string | null; away_logo: string | null }>();
    for (const f of fights) {
      if (!f.event_name) continue;
      const existing = eventImageMap.get(f.event_name);
      // Prefer the fight that actually has photos (the "main" matchup)
      if (!existing || (!existing.fighter_a_photo && f.fighter_a_photo)) {
        if (f.fighter_a_photo || f.fighter_b_photo || f.home_logo || f.away_logo) {
          eventImageMap.set(f.event_name, {
            fighter_a_photo: f.fighter_a_photo,
            fighter_b_photo: f.fighter_b_photo,
            home_logo: f.home_logo,
            away_logo: f.away_logo,
          });
        }
      }
    }

    // Also query DB for sibling images (covers fights not in current active set)
    const uniqueEventNames = [...new Set(fights.map(f => f.event_name).filter(Boolean))];
    if (uniqueEventNames.length > 0) {
      const { data: siblingImages } = await supabase
        .from("prediction_fights")
        .select("event_name, fighter_a_photo, fighter_b_photo, home_logo, away_logo")
        .in("event_name", uniqueEventNames)
        .not("fighter_a_photo", "is", null)
        .limit(100);
      if (siblingImages) {
        for (const s of siblingImages) {
          if (!eventImageMap.has(s.event_name) || !eventImageMap.get(s.event_name)?.fighter_a_photo) {
            if (s.fighter_a_photo || s.fighter_b_photo) {
              eventImageMap.set(s.event_name, {
                fighter_a_photo: s.fighter_a_photo,
                fighter_b_photo: s.fighter_b_photo,
                home_logo: s.home_logo,
                away_logo: s.away_logo,
              });
            }
          }
        }
      }
    }

    const BATCH_SIZE = 5;
    for (let i = 0; i < fights.length; i += BATCH_SIZE) {
      const batch = fights.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (fight) => {
          // ── 1. Fetch Gamma market data FIRST (canonical display prices) ──
          let priceA = 0;
          let priceB = 0;
          let totalVolume = 0;
          let poolAUsd = 0;
          let poolBUsd = 0;
          let gammaImage: string | null = null;
          let gammaOutcomes: [string, string] | null = null;
          let gammaDescription: string | null = null;
          let gammaLiquidity = 0;
          let gammaVolume24h = 0;
          let gammaStartDate: string | null = null;
          let gammaCompetitive: number | null = null;
          let gammaFee: string | null = null;
          let priceSource: "gamma" | "clob" | "none" = "none";

          if (fight.polymarket_market_id) {
            try {
              const gammaRes = await fetch(`${GAMMA_BASE}/markets/${fight.polymarket_market_id}`);
              if (gammaRes.ok) {
                const market = await gammaRes.json();
                if (market) {
                  totalVolume = parseFloat(market.volumeNum || market.volume || "0");

                  // Use Gamma outcomePrices as primary display price
                  if (market.outcomePrices) {
                    try {
                      const gammaPrices = JSON.parse(market.outcomePrices);
                      if (Array.isArray(gammaPrices) && gammaPrices.length >= 2) {
                        const gA = parseFloat(gammaPrices[0] || "0");
                        const gB = parseFloat(gammaPrices[1] || "0");
                        if (gA > 0 || gB > 0) {
                          priceA = gA;
                          priceB = gB;
                          priceSource = "gamma";
                          // Derive complement if only one side
                          if (priceA > 0 && priceA <= 1 && priceB === 0) priceB = Math.round((1 - priceA) * 10000) / 10000;
                          else if (priceB > 0 && priceB <= 1 && priceA === 0) priceA = Math.round((1 - priceB) * 10000) / 10000;
                        }
                      }
                    } catch { /* ignore parse errors */ }
                  }

                  // Derive pools from volume + prices
                  if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                    poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                    poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                  }

                  gammaImage = market.image || market.icon || null;
                  gammaOutcomes = parseOutcomeNames(market.outcomes);
                  gammaDescription = market.description || null;

                  gammaLiquidity = parseFloat(market.liquidity || "0");
                  gammaVolume24h = parseFloat(market.volume24hr || "0");
                  gammaStartDate = market.startDate || null;
                  gammaCompetitive = market.competitive != null ? parseFloat(market.competitive) : null;
                  gammaFee = market.fee || null;
                }
              }
            } catch (e) {
              console.warn(`[polymarket-prices] Gamma fetch failed for ${fight.id}:`, e);
            }
          }

          // ── 2. CLOB fallback — only used if Gamma gave no usable prices ──
          if (priceA === 0 && priceB === 0) {
            try {
              const [resA, resB] = await Promise.all([
                fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_a_token}&side=BUY`),
                fight.polymarket_outcome_b_token
                  ? fetch(`${CLOB_BASE}/price?token_id=${fight.polymarket_outcome_b_token}&side=BUY`)
                  : Promise.resolve(null),
              ]);
              if (resA.ok) {
                const dataA = await resA.json();
                priceA = parseFloat(dataA?.price || "0");
              }
              if (resB && resB.ok) {
                const dataB = await resB.json();
                priceB = parseFloat(dataB?.price || "0");
              }
              if (priceA > 0 || priceB > 0) {
                priceSource = "clob";
                // Derive complement for binary markets
                if (priceA > 0 && priceA <= 1 && priceB === 0) {
                  priceB = Math.round((1 - priceA) * 10000) / 10000;
                } else if (priceB > 0 && priceB <= 1 && priceA === 0) {
                  priceA = Math.round((1 - priceB) * 10000) / 10000;
                }
                // CLOB sanity check: if both prices are extreme (>0.99 or <0.01)
                // and volume exists, flag as potentially misleading
                if (priceA > 0.99 || priceB > 0.99) {
                  enriched.push(`${fight.id}: clob_extreme_price a=${priceA} b=${priceB}`);
                }
                // Re-derive pools
                if (totalVolume > 0 && priceA > 0 && priceB > 0) {
                  poolAUsd = Math.round(totalVolume * priceA * 100) / 100;
                  poolBUsd = Math.round(totalVolume * priceB * 100) / 100;
                }
              }
            } catch (e) {
              console.warn(`[polymarket-prices] CLOB price fetch failed for ${fight.id}:`, e);
            }
          }

          // ── 3. Build update payload ──
          const updatePayload: Record<string, any> = {
            price_a: priceA,
            price_b: priceB,
            polymarket_last_synced_at: new Date().toISOString(),
          };

          if (priceSource !== "none") {
            enriched.push(`${fight.id}: price_source=${priceSource} a=${priceA} b=${priceB}`);
          }

          // Always persist volume/liquidity even when prices are incomplete
          if (totalVolume > 0) {
            updatePayload.polymarket_volume_usd = totalVolume;
          }
          // Write derived pools whenever we have both prices AND volume
          if (poolAUsd > 0 || poolBUsd > 0) {
            updatePayload.pool_a_usd = poolAUsd;
            updatePayload.pool_b_usd = poolBUsd;
          }

          // Store new Gamma fields
          if (gammaLiquidity > 0) updatePayload.polymarket_liquidity = gammaLiquidity;
          if (gammaVolume24h > 0) updatePayload.polymarket_volume_24h = gammaVolume24h;
          if (gammaStartDate) updatePayload.polymarket_start_date = gammaStartDate;
          if (gammaCompetitive != null) updatePayload.polymarket_competitive = gammaCompetitive;
          if (gammaFee) updatePayload.polymarket_fee = gammaFee;

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

          // ── 6. Fetch event banner from Gamma (if event_id available) ──
          if (fight.event_id) {
            try {
              const { data: ev } = await supabase
                .from("prediction_events")
                .select("event_banner_url, polymarket_event_id")
                .eq("id", fight.event_id)
                .single();
              if (ev && !ev.event_banner_url && ev.polymarket_event_id) {
                const evRes = await fetch(`${GAMMA_BASE}/events/${ev.polymarket_event_id}`);
                if (evRes.ok) {
                  const evData = await evRes.json();
                  if (evData?.image) {
                    await supabase
                      .from("prediction_events")
                      .update({ event_banner_url: evData.image })
                      .eq("id", fight.event_id);
                    enriched.push(`event:${fight.event_id}: banner`);
                  }
                }
              }
            } catch { /* non-fatal */ }
          }

          // ── 7. Image enrichment ──
          const soccer = isSoccerEvent(fight.event_name || "", fight.source);
          const nameA = updatePayload.fighter_a_name || fight.fighter_a_name;
          const nameB = updatePayload.fighter_b_name || fight.fighter_b_name;
          const isGenericA = isGenericLabel(nameA);
          const isGenericB = isGenericLabel(nameB);

          // Prop market image inheritance: if this fight has generic labels,
          // inherit images from sibling fight with same event_name
          if ((isGenericA || isGenericB) && fight.event_name) {
            const parentImages = eventImageMap.get(fight.event_name);
            if (parentImages) {
              if (!fight.fighter_a_photo && parentImages.fighter_a_photo) {
                updatePayload.fighter_a_photo = parentImages.fighter_a_photo;
                enriched.push(`${fight.id}: inherited_a_photo`);
              }
              if (!fight.fighter_b_photo && parentImages.fighter_b_photo) {
                updatePayload.fighter_b_photo = parentImages.fighter_b_photo;
                enriched.push(`${fight.id}: inherited_b_photo`);
              }
              if (!fight.home_logo && parentImages.home_logo) {
                updatePayload.home_logo = parentImages.home_logo;
              }
              if (!fight.away_logo && parentImages.away_logo) {
                updatePayload.away_logo = parentImages.away_logo;
              }
            }

            // Fallback: if still missing logos on a soccer event, fetch from event_name
            if (soccer && (!fight.home_logo && !updatePayload.home_logo || !fight.away_logo && !updatePayload.away_logo)) {
              const vsMatch = (fight.event_name || "").match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
              if (vsMatch) {
                const [, homeTeam, awayTeam] = vsMatch;
                if (!fight.home_logo && !updatePayload.home_logo) {
                  const pmBadge = await fetchPolymarketS3Photo(homeTeam.trim(), "soccer");
                  const badge = pmBadge || await fetchTeamBadge(homeTeam.trim());
                  if (badge) {
                    updatePayload.home_logo = badge;
                    enriched.push(`${fight.id}: home_logo_fallback`);
                  }
                }
                if (!fight.away_logo && !updatePayload.away_logo) {
                  const pmBadge = await fetchPolymarketS3Photo(awayTeam.trim(), "soccer");
                  const badge = pmBadge || await fetchTeamBadge(awayTeam.trim());
                  if (badge) {
                    updatePayload.away_logo = badge;
                    enriched.push(`${fight.id}: away_logo_fallback`);
                  }
                }
                // Also set fighter photos from logos for prop markets
                if (!fight.fighter_a_photo && (updatePayload.home_logo || fight.home_logo)) {
                  updatePayload.fighter_a_photo = updatePayload.home_logo || fight.home_logo;
                }
                if (!fight.fighter_b_photo && (updatePayload.away_logo || fight.away_logo)) {
                  updatePayload.fighter_b_photo = updatePayload.away_logo || fight.away_logo;
                }
              }
            }
          } else if (soccer) {
            // Parse team names from event_name: "Team A vs. Team B"
            const vsMatch = (fight.event_name || "").match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
            if (vsMatch) {
              const [, homeTeam, awayTeam] = vsMatch;
              if (!fight.home_logo) {
                const pmBadge = await fetchPolymarketS3Photo(homeTeam.trim(), "soccer");
                const badge = pmBadge || await fetchTeamBadge(homeTeam.trim());
                if (badge) {
                  updatePayload.home_logo = badge;
                  enriched.push(`${fight.id}: home_logo`);
                }
              }
              if (!fight.away_logo) {
                const pmBadge = await fetchPolymarketS3Photo(awayTeam.trim(), "soccer");
                const badge = pmBadge || await fetchTeamBadge(awayTeam.trim());
                if (badge) {
                  updatePayload.away_logo = badge;
                  enriched.push(`${fight.id}: away_logo`);
                }
              }
            }
            if (!fight.fighter_a_photo && updatePayload.home_logo) {
              updatePayload.fighter_a_photo = updatePayload.home_logo;
            }
            if (!fight.fighter_b_photo && updatePayload.away_logo) {
              updatePayload.fighter_b_photo = updatePayload.away_logo;
            }
          } else {
            // Combat sports: try to get fighter photos
            if (!fight.fighter_a_photo && !isGenericA) {
              const photo = await fetchFighterPhoto(nameA);
              if (photo) {
                updatePayload.fighter_a_photo = photo;
                enriched.push(`${fight.id}: fighter_a_photo`);
              }
            }
            if (!fight.fighter_b_photo && !isGenericB) {
              const photo = await fetchFighterPhoto(nameB);
              if (photo) {
                updatePayload.fighter_b_photo = photo;
                enriched.push(`${fight.id}: fighter_b_photo`);
              }
            }
          }

          // ── Bad-market safeguard: flag fights with volume but no usable odds ──
          if (totalVolume > 0 && priceA === 0 && priceB === 0) {
            console.warn(`[polymarket-prices] BAD_MARKET: fight=${fight.id} has volume=$${totalVolume} but no usable prices`);
            if (!updatePayload.enrichment_notes) {
              updatePayload.enrichment_notes = `price_missing: volume=$${totalVolume.toFixed(0)} but no CLOB/Gamma prices available`;
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
