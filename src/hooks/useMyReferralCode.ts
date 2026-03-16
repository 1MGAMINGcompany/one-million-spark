import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the current user's admin-issued referral_code from player_profiles.
 * Returns null if the user has no code or wallet is not provided.
 */
export function useMyReferralCode(wallet: string | null | undefined): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setCode(null);
      return;
    }
    supabase
      .from("player_profiles")
      .select("referral_code")
      .eq("wallet", wallet)
      .maybeSingle()
      .then(({ data }) => {
        setCode(data?.referral_code ?? null);
      });
  }, [wallet]);

  return code;
}
