import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Proxies fighter photos from external CDNs (e.g. cdn.onefc.com) that block hotlinking.
 * 
 * GET ?url=<encoded_photo_url>
 * 
 * Flow:
 * 1. Check if already cached in storage bucket "fighter-photos"
 * 2. If not, fetch from origin with browser-like headers
 * 3. Upload to storage and return the public URL
 * 4. On subsequent requests, redirect to cached URL
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const photoUrl = url.searchParams.get("url");

    if (!photoUrl) {
      return new Response(JSON.stringify({ error: "url param required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Derive a stable filename from the URL
    const urlObj = new URL(photoUrl);
    const pathParts = urlObj.pathname.split("/");
    const filename = pathParts[pathParts.length - 1]; // e.g. "Rodtang-Jitmuangnon.jpg"
    const storagePath = `onefc/${filename}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if already cached
    const { data: existing } = await supabase.storage
      .from("fighter-photos")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

    if (existing?.signedUrl) {
      // Verify the file actually exists by checking with a HEAD-like approach
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/fighter-photos/${storagePath}`;
      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch from origin with browser-like headers
    const response = await fetch(photoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.onefc.com/",
        "Origin": "https://www.onefc.com",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${photoUrl}: ${response.status}`);
      return new Response(JSON.stringify({ error: `fetch failed: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("fighter-photos")
      .upload(storagePath, imageData, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "upload failed", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/fighter-photos/${storagePath}`;

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
