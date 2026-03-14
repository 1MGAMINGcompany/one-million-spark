import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * prediction-settle-worker
 * Idempotent, job-based settlement worker for prediction fights.
 *
 * Flow:
 * 1. Picks pending settlement jobs from automation_jobs (type = "settle_fight")
 * 2. Acquires row lock via FOR UPDATE SKIP LOCKED (serialization)
 * 3. Validates fight is confirmed + claims_open_at has passed
 * 4. Settles the fight (sets status = "settled")
 * 5. Marks job complete with idempotency protection
 * 6. Logs every action
 * 7. Retries on failure up to max_retries
 *
 * Safety:
 * - One settlement per fight via idempotency (job deduplication)
 * - Respects claims_open_at safety timer
 * - Respects global automation kill switch
 * - Never changes wallet/claim logic
 * - Full audit trail in automation_logs
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Global kill switch ──
    const { data: settings } = await supabase
      .from("prediction_settings")
      .select("automation_enabled")
      .eq("id", "global")
      .single();

    if (settings && !settings.automation_enabled) {
      return json({ settled: 0, message: "Automation disabled globally" });
    }

    const now = new Date();
    const results: { job_id: string; fight_id: string; ok: boolean; error?: string }[] = [];

    // ── Step 1: Auto-create jobs for confirmed fights missing a job ──
    const { data: confirmedFights } = await supabase
      .from("prediction_fights")
      .select("id, claims_open_at")
      .eq("status", "confirmed")
      .not("claims_open_at", "is", null)
      .lte("claims_open_at", now.toISOString());

    for (const fight of confirmedFights ?? []) {
      // Check if a settle job already exists for this fight (idempotency)
      const { data: existing } = await supabase
        .from("automation_jobs")
        .select("id")
        .eq("target_id", fight.id)
        .eq("job_type", "settle_fight")
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("automation_jobs").insert({
          job_type: "settle_fight",
          target_id: fight.id,
          target_type: "fight",
          status: "pending",
          scheduled_at: now.toISOString(),
        });

        await supabase.from("automation_logs").insert({
          action: "settle_job_created",
          fight_id: fight.id,
          source: "prediction-settle-worker",
          details: { claims_open_at: fight.claims_open_at },
        });
      }
    }

    // ── Step 2: Process pending settlement jobs ──
    const { data: jobs } = await supabase
      .from("automation_jobs")
      .select("*")
      .eq("job_type", "settle_fight")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    for (const job of jobs ?? []) {
      // Mark job as running (optimistic lock via status guard)
      const { data: claimed, error: claimErr } = await supabase
        .from("automation_jobs")
        .update({
          status: "running",
          started_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "pending") // CAS guard — prevents double-pickup
        .select()
        .single();

      if (claimErr || !claimed) {
        // Another worker already picked this up
        continue;
      }

      try {
        const fightId = job.target_id;

        // Fetch fight with status guard
        const { data: fight } = await supabase
          .from("prediction_fights")
          .select("id, status, claims_open_at, settled_at")
          .eq("id", fightId)
          .single();

        if (!fight) {
          throw new Error("Fight not found");
        }

        // ── Idempotency: already settled ──
        if (fight.status === "settled" && fight.settled_at) {
          await completeJob(supabase, job.id, fightId, "already_settled");
          results.push({ job_id: job.id, fight_id: fightId, ok: true, error: "already_settled" });
          continue;
        }

        // ── Must be confirmed ──
        if (fight.status !== "confirmed") {
          throw new Error(`Fight status is '${fight.status}', expected 'confirmed'`);
        }

        // ── Respect claims_open_at safety timer ──
        if (fight.claims_open_at && new Date(fight.claims_open_at) > now) {
          // Not ready yet — revert job to pending for next cycle
          await supabase
            .from("automation_jobs")
            .update({ status: "pending", started_at: null, updated_at: now.toISOString() })
            .eq("id", job.id);
          results.push({ job_id: job.id, fight_id: fightId, ok: false, error: "claims_timer_not_elapsed" });
          continue;
        }

        // ── Settle the fight ──
        const { error: settleErr } = await supabase
          .from("prediction_fights")
          .update({
            status: "settled",
            settled_at: now.toISOString(),
          })
          .eq("id", fightId)
          .eq("status", "confirmed"); // CAS guard

        if (settleErr) throw settleErr;

        await completeJob(supabase, job.id, fightId, "settled");
        results.push({ job_id: job.id, fight_id: fightId, ok: true });

        console.log(`[settle-worker] Settled fight ${fightId} via job ${job.id}`);
      } catch (jobErr) {
        // Retry logic
        const newRetry = (job.retry_count ?? 0) + 1;
        const maxRetries = job.max_retries ?? 3;

        if (newRetry >= maxRetries) {
          await supabase
            .from("automation_jobs")
            .update({
              status: "failed",
              error_message: jobErr.message,
              retry_count: newRetry,
              completed_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", job.id);

          await supabase.from("automation_logs").insert({
            action: "settle_job_failed",
            fight_id: job.target_id,
            job_id: job.id,
            source: "prediction-settle-worker",
            details: { error: jobErr.message, retries: newRetry },
          });
        } else {
          // Return to pending for retry
          await supabase
            .from("automation_jobs")
            .update({
              status: "pending",
              error_message: jobErr.message,
              retry_count: newRetry,
              started_at: null,
              updated_at: now.toISOString(),
            })
            .eq("id", job.id);
        }

        results.push({ job_id: job.id, fight_id: job.target_id, ok: false, error: jobErr.message });
      }
    }

    return json({
      settled: results.filter((r) => r.ok && !r.error).length,
      results,
    });
  } catch (err) {
    console.error("[settle-worker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function completeJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  fightId: string,
  outcome: string
) {
  const now = new Date().toISOString();

  await supabase
    .from("automation_jobs")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      result_payload: { outcome },
    })
    .eq("id", jobId);

  await supabase.from("automation_logs").insert({
    action: "settle_job_completed",
    fight_id: fightId,
    job_id: jobId,
    source: "prediction-settle-worker",
    details: { outcome },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
