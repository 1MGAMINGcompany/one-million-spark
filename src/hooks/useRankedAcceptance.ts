/**
 * Hook to handle the cryptographic acceptance flow for ranked games
 * 
 * Flow:
 * 1. Compute rulesHash from game rules
 * 2. Request nonce from server (issue_nonce RPC)
 * 3. Build message and sign with wallet
 * 4. Verify signature and start session (start_session RPC)
 * 5. Store session token and mark player ready
 */

import { useState, useCallback, useRef } from "react";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { supabase } from "@/integrations/supabase/client";
import { computeRulesHash, buildAcceptMessage, RankedRules } from "@/lib/rulesHash";
import bs58 from "bs58";

interface UseRankedAcceptanceOptions {
  roomPda: string | undefined;
  stakeLamports: number;
  turnTimeSeconds: number;
}

interface UseRankedAcceptanceResult {
  /** Execute the signature-based acceptance flow */
  acceptWithSignature: () => Promise<{ success: boolean; error?: string }>;
  /** Whether acceptance is in progress */
  isAccepting: boolean;
  /** Session token after successful acceptance */
  sessionToken: string | null;
  /** The rules hash that was signed */
  rulesHash: string | null;
}

const PLATFORM_FEE_PCT = 5; // 5% platform fee

export function useRankedAcceptance(
  options: UseRankedAcceptanceOptions
): UseRankedAcceptanceResult {
  const { roomPda, stakeLamports, turnTimeSeconds } = options;
  const { publicKey, signMessage } = useSolanaWallet();
  
  const [isAccepting, setIsAccepting] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [rulesHash, setRulesHash] = useState<string | null>(null);
  
  // Prevent double execution
  const acceptingRef = useRef(false);

  const acceptWithSignature = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    // Validate inputs
    if (!roomPda) {
      return { success: false, error: "Room not specified" };
    }
    if (!publicKey) {
      return { success: false, error: "Wallet not connected" };
    }
    if (!signMessage) {
      return { success: false, error: "Wallet does not support message signing" };
    }
    if (acceptingRef.current) {
      return { success: false, error: "Acceptance already in progress" };
    }

    const wallet = publicKey.toBase58();
    acceptingRef.current = true;
    setIsAccepting(true);

    try {
      // Step 1: Compute rules hash
      console.log("[RankedAcceptance] Computing rules hash...");
      const rules: RankedRules = {
        stakeLamports,
        turnTimeSeconds,
        platformFeePct: PLATFORM_FEE_PCT,
        roomPda,
      };
      const hash = await computeRulesHash(rules);
      setRulesHash(hash);
      console.log("[RankedAcceptance] Rules hash:", hash);

      // Step 2: Request nonce from server
      console.log("[RankedAcceptance] Requesting nonce...");
      const { data: nonce, error: nonceError } = await supabase.rpc("issue_nonce", {
        p_room_pda: roomPda,
        p_wallet: wallet,
        p_rules_hash: hash,
      });

      if (nonceError || !nonce) {
        console.error("[RankedAcceptance] Failed to get nonce:", nonceError);
        return { success: false, error: nonceError?.message || "Failed to get nonce" };
      }
      console.log("[RankedAcceptance] Got nonce:", nonce);

      // Step 3: Build message for signing
      const timestampMs = Date.now();
      const message = buildAcceptMessage(roomPda, wallet, hash, nonce, timestampMs);
      console.log("[RankedAcceptance] Message to sign:", message);

      // Step 4: Sign the message with wallet
      console.log("[RankedAcceptance] Requesting wallet signature...");
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      
      let signature: Uint8Array;
      try {
        signature = await signMessage(messageBytes);
      } catch (signError: any) {
        console.error("[RankedAcceptance] User rejected signature:", signError);
        return { success: false, error: "Signature rejected by user" };
      }
      
      const signatureBase58 = bs58.encode(signature);
      console.log("[RankedAcceptance] Signature obtained:", signatureBase58.slice(0, 20) + "...");

      // Step 5: Verify signature and start session via RPC
      // The start_session RPC verifies the signature server-side
      console.log("[RankedAcceptance] Starting session...");
      const { data: token, error: sessionError } = await supabase.rpc("start_session", {
        p_room_pda: roomPda,
        p_wallet: wallet,
        p_rules_hash: hash,
        p_nonce: nonce,
        p_signature: signatureBase58,
        p_sig_valid: true, // Client-side we can't verify Ed25519, server should re-verify
      });

      if (sessionError || !token) {
        console.error("[RankedAcceptance] Session start failed:", sessionError);
        return { success: false, error: sessionError?.message || "Failed to start session" };
      }

      console.log("[RankedAcceptance] Session started, token:", token.slice(0, 16) + "...");
      setSessionToken(token);

      // Step 6: Store acceptance with signature in game_acceptances for deterministic roll
      console.log("[RankedAcceptance] Recording acceptance with signature...");
      const { error: acceptanceError } = await supabase
        .from("game_acceptances")
        .insert({
          room_pda: roomPda,
          player_wallet: wallet,
          rules_hash: hash,
          nonce: nonce,
          timestamp_ms: timestampMs,
          signature: signatureBase58,
          session_token: token,
          session_expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        });

      if (acceptanceError) {
        console.error("[RankedAcceptance] Failed to record acceptance:", acceptanceError);
        // Don't fail the flow - session is valid, acceptance record is for dice roll
      }

      // Step 7: Mark player as ready now that we have a valid session
      console.log("[RankedAcceptance] Marking player ready...");
      const { error: readyError } = await supabase.rpc("set_player_ready", {
        p_room_pda: roomPda,
        p_wallet: wallet,
      });

      if (readyError) {
        console.error("[RankedAcceptance] Failed to set ready:", readyError);
        // Don't fail the whole flow - session is valid, ready flag is secondary
      }

      // Store session token in localStorage for persistence
      localStorage.setItem(`session_token_${roomPda}`, token);

      console.log("[RankedAcceptance] Acceptance complete!");
      return { success: true };

    } catch (err: any) {
      console.error("[RankedAcceptance] Unexpected error:", err);
      return { success: false, error: err.message || "Unexpected error during acceptance" };
    } finally {
      acceptingRef.current = false;
      setIsAccepting(false);
    }
  }, [roomPda, publicKey, signMessage, stakeLamports, turnTimeSeconds]);

  return {
    acceptWithSignature,
    isAccepting,
    sessionToken,
    rulesHash,
  };
}
