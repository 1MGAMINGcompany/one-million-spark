import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Operator {
  id: string;
  user_id: string;
  brand_name: string;
  subdomain: string;
  logo_url: string | null;
  theme: string;
  fee_percent: number;
  created_at: string;
}

export interface OperatorSettings {
  id: string;
  operator_id: string;
  allowed_sports: string[];
  show_polymarket_events: boolean;
  show_platform_events: boolean;
  homepage_layout: string;
  featured_event_ids: string[];
}

export function useOperatorBySubdomain(subdomain: string | null) {
  return useQuery({
    queryKey: ["operator", subdomain],
    queryFn: async () => {
      if (!subdomain) return null;
      // Table not yet in generated types — cast to any
      const { data, error } = await (supabase as any)
        .from("operators")
        .select("*")
        .eq("subdomain", subdomain)
        .maybeSingle();
      if (error) throw error;
      return data as Operator | null;
    },
    enabled: !!subdomain,
    staleTime: 60_000,
  });
}

export function useOperatorSettings(operatorId: string | null) {
  return useQuery({
    queryKey: ["operator_settings", operatorId],
    queryFn: async () => {
      if (!operatorId) return null;
      const { data, error } = await (supabase as any)
        .from("operator_settings")
        .select("*")
        .eq("operator_id", operatorId)
        .maybeSingle();
      if (error) throw error;
      return data as OperatorSettings | null;
    },
    enabled: !!operatorId,
    staleTime: 60_000,
  });
}
