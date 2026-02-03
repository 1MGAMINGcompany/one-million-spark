/**
 * Hook to manage the ranked game ready gate
 * 
 * For ranked games, both players must acknowledge the rules before gameplay begins.
 * The on-chain stake transaction serves as implicit acceptance of the game rules.
 * This hook simply tracks p1_ready and p2_ready flags in game_sessions.
 */

import { useState, useEffect, useCallback } from "react";
import { dbg, isDebugEnabled } from "@/lib/debugLog";
import { supabase } from "@/integrations/supabase/client";
import { getSessionToken, getAuthHeaders, storeSessionToken } from "@/lib/sessionToken";

interface UseRankedReadyGateOptions {
  roomPda: string | undefined;
  myWallet: string | undefined;
  isRanked: boolean;
  enabled?: boolean;
  /** Optional: for N-player games (e.g. Ludo), provide canonical participant wallets */
  participants?: string[];
}

interface UseRankedReadyGateResult {
  /** Whether this player is ready */
  iAmReady: boolean;
  /** Whether opponent is ready */
  opponentReady: boolean;
  /** Whether both players are ready (gameplay can begin) */
  bothReady: boolean;
  /** Whether we're currently setting ready */
  isSettingReady: boolean;
  /** Whether we need to show the accept modal */
  showAcceptModal: boolean;
  /** Accept rules (marks player ready - no wallet signature needed) */
  acceptRules: () => Promise<{ success: boolean; error?: string }>;
  /** Stake in lamports (from session) - DEPRECATED: Use external on-chain stake */
  stakeLamports: number;
  /** Turn time in seconds for ranked games */
  turnTimeSeconds: number;
  /** Whether gate data has loaded (use to block modal rendering with defaults) */
  isDataLoaded: boolean;
  /** Force refetch for cross-device sync */
  refetch: () => Promise<void>;
  /** DB status_int (1=waiting, 2=active, 3=finished) - AUTHORITATIVE for leave/forfeit logic */
  dbStatusInt: number;
  /** DB participants count - AUTHORITATIVE for cancel/forfeit eligibility */
  dbParticipantsCount: number;
  /** DB-AUTHORITATIVE: Number of acceptances recorded in game_acceptances table */
  acceptedCount: number;
  /** DB-AUTHORITATIVE: Required acceptances for game to start (from max_players) */
  requiredCount: number;
  /** DB-AUTHORITATIVE: Number of participants in the room */
  participantsCount: number;
  /** DB-AUTHORITATIVE: Maximum players allowed in this room */
  maxPlayers: number;
  /** DB-AUTHORITATIVE: Single boolean for readiness (acceptedCount >= requiredCount for ranked, participantsCount >= maxPlayers for casual) */
  dbReady: boolean;
}

export function useRankedReadyGate(options: UseRankedReadyGateOptions): UseRankedReadyGateResult {
  const { roomPda, myWallet, isRanked, enabled = true, participants } = options;
  
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [p1Wallet, setP1Wallet] = useState<string | null>(null);
  const [p2Wallet, setP2Wallet] = useState<string | null>(null);
  const [stakeLamports, setStakeLamports] = useState(0);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSettingReady, setIsSettingReady] = useState(false);
  // STEP 4: Track accepted wallets from game_acceptances table
  const [acceptedWallets, setAcceptedWallets] = useState<Set<string>>(new Set());
  // DB status_int (1=waiting, 2=active, 3=finished) - AUTHORITATIVE for leave/forfeit logic
  const [dbStatusInt, setDbStatusInt] = useState<number>(1);
  // DB participants count - AUTHORITATIVE for cancel/forfeit eligibility
  const [dbParticipantsCount, setDbParticipantsCount] = useState<number>(0);
  // DB-AUTHORITATIVE: acceptedCount and requiredCount from game-session-get
  const [dbAcceptedCount, setDbAcceptedCount] = useState<number>(0);
  const [dbRequiredCount, setDbRequiredCount] = useState<number>(2);
  const [dbMaxPlayers, setDbMaxPlayers] = useState<number>(2);

  // Normalize wallet addresses (trim only - Solana base58 is case-sensitive!)
  const normalizeWallet = (w?: string | null) =>
    typeof w === "string" ? w.trim() : "";

  // Determine if I'm player 1 or player 2 (use trim for comparison, NOT toLowerCase)
  const myWalletNorm = normalizeWallet(myWallet);
  const p1WalletNorm = normalizeWallet(p1Wallet);
  const p2WalletNorm = normalizeWallet(p2Wallet);


  // Optional N-player participants (canonical wallets) - normalized for comparison
  const participantsNorm = (participants ?? []).map(w => normalizeWallet(w)).filter(Boolean);
  const hasParticipants = participantsNorm.length > 0;
  const isParticipant = hasParticipants ? participantsNorm.includes(myWalletNorm) : false;
  
  const isPlayer1 = myWalletNorm && p1WalletNorm && myWalletNorm === p1WalletNorm;
  const isPlayer2 = myWalletNorm && p2WalletNorm && myWalletNorm === p2WalletNorm;

  // STEP 4: Compute readiness from acceptances FIRST, fallback to p1_ready/p2_ready flags
  const opponentWallet = isPlayer1 ? p2Wallet : isPlayer2 ? p1Wallet : null;
  const opponentWalletNorm = normalizeWallet(opponentWallet);
  
  // Primary source: game_acceptances table via polling
  const iAmReadyFromAcceptances = myWalletNorm ? acceptedWallets.has(myWalletNorm) : false;
  // Fallback: p1_ready/p2_ready flags
  const iAmReadyFromFlags = isPlayer1 ? p1Ready : isPlayer2 ? p2Ready : false;
  const iAmReady = iAmReadyFromAcceptances || iAmReadyFromFlags;

  const opponentReadyFromAcceptances = opponentWalletNorm ? acceptedWallets.has(opponentWalletNorm) : false;
  const opponentReadyFromFlags = isPlayer1 ? p2Ready : isPlayer2 ? p1Ready : false;
  const opponentReady = opponentReadyFromAcceptances || opponentReadyFromFlags;

  // DETERMINISTIC requiredCount: use participants if provided, else 2 for standard games
  const requiredCount = hasParticipants ? participantsNorm.length : 2;
  
  // STRICT bothReady: ONLY true when acceptedWallets.size >= requiredCount
  // NO FALLBACKS from p1_ready/p2_ready flags - those can be stale or set prematurely
  const bothReady = acceptedWallets.size >= requiredCount;
  
  // Show accept modal if ranked, loaded, and this player hasn't accepted yet
  // Also require that we've identified this player's role (isPlayer1 or isPlayer2)
  const isIdentified = hasParticipants ? isParticipant : (isPlayer1 || isPlayer2);
  const showAcceptModal = enabled && isRanked && hasLoaded && !iAmReady && isIdentified;

  // Debug logging for ranked gate - traces exactly why bothReady/showAcceptModal are what they are
  if (isDebugEnabled() && isRanked && hasLoaded) {
    dbg("ranked.gate", {
      roomPda: roomPda?.slice(0, 8),
      myWallet: myWalletNorm?.slice(0, 8),
      p1Wallet: p1WalletNorm?.slice(0, 8),
      p2Wallet: p2WalletNorm?.slice(0, 8),
      isPlayer1,
      isPlayer2,
      isIdentified,
      p1Ready,
      p2Ready,
      iAmReady,
      opponentReady,
      acceptedCount: acceptedWallets.size,
      requiredCount,
      bothReady,
      showAcceptModal,
      acceptedWallets: Array.from(acceptedWallets).map(w => w.slice(0, 8)),
    });
  }
  
  // Debug logging for ranked gate state - consistent format for cross-device debugging
  useEffect(() => {
    if (isRanked && hasLoaded) {
      console.log("[RankedReadyGate] State:", {
        roomPda: roomPda?.slice(0, 8),
        myWallet: myWalletNorm?.slice(0, 8),
        isRanked,
        enabled,
        hasLoaded,
        isPlayer1,
        isPlayer2,
        isIdentified,
        p1Ready,
        p2Ready,
        iAmReady,
        iAmReadyFromAcceptances,
        opponentReady,
        opponentReadyFromAcceptances,
        bothReady,
        acceptedCount: acceptedWallets.size,
        requiredCount,
        acceptedWallets: Array.from(acceptedWallets).map(w => w.slice(0, 8)),
        showAcceptModal,
      });
    }
  }, [roomPda, myWalletNorm, isRanked, enabled, hasLoaded, isPlayer1, isPlayer2, isIdentified, p1Ready, p2Ready, iAmReady, iAmReadyFromAcceptances, opponentReady, opponentReadyFromAcceptances, bothReady, acceptedWallets, requiredCount, showAcceptModal]);

  // Accept rules via Edge Function (no direct table access)
  const acceptRules = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!roomPda || !myWalletNorm) {
      return { success: false, error: "Missing room or wallet" };
    }

    // Get session token for authorization (required - no fallback)
    const sessionToken = getSessionToken(roomPda);
    if (!sessionToken) {
      console.error("[RankedReadyGate] No session token available");
      return { success: false, error: "Session token required - please rejoin the room" };
    }

    setIsSettingReady(true);
    
    try {
      console.log("[RankedReadyGate] Calling ranked-accept Edge Function...", { roomPda, myWallet: myWalletNorm });
      
      // Call Edge Function with Authorization header (no wallet in body)
      const { data, error } = await supabase.functions.invoke("ranked-accept", {
        body: {
          roomPda,
          mode: "simple", // Simple acceptance (stake tx is implicit signature)
        },
        headers: getAuthHeaders(sessionToken),
      });

      if (error) {
        console.error("[RankedReadyGate] Edge function error:", error);
        return { success: false, error: error.message || "Failed to accept" };
      }

      if (!data?.success) {
        console.error("[RankedReadyGate] Acceptance failed:", data?.error);
        return { success: false, error: data?.error || "Acceptance failed" };
      }

      console.log("[RankedReadyGate] ✅ Player marked as ready via Edge Function!");
      
      // Store the new session token if returned
      if (data.sessionToken) {
        storeSessionToken(roomPda, data.sessionToken);
      }
      
      // STEP 4: Optimistic update - immediately add my wallet to acceptedWallets
      if (myWalletNorm) {
        setAcceptedWallets(prev => new Set([...prev, myWalletNorm]));
      }
      
      return { success: true };
    } catch (err: any) {
      console.error("[RankedReadyGate] Error:", err);
      return { success: false, error: err.message || "Unexpected error" };
    } finally {
      setIsSettingReady(false);
    }
  }, [roomPda, myWalletNorm]);

  // Refetch function for cross-device sync (extracted for reuse)
  const refetch = useCallback(async () => {
    if (!roomPda) return;
    
    console.log("[RankedReadyGate] Force refetch triggered");
    try {
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      const session = resp?.session;
      const debug = resp?.debug;
      const acceptances = resp?.acceptances;
      if (!error && session) {
        setP1Ready(session.p1_ready ?? false);
        setP2Ready(session.p2_ready ?? false);
        setP1Wallet(session.player1_wallet);
        setP2Wallet(session.player2_wallet);
        if (session.turn_time_seconds) {
          setTurnTimeSeconds(session.turn_time_seconds);
        }
        // AUTHORITATIVE DB state for leave/forfeit logic
        setDbStatusInt(session.status_int ?? 1);
        setDbParticipantsCount(debug?.participantsCount ?? session.participants?.length ?? 0);
        // DB-AUTHORITATIVE counts from game-session-get
        setDbAcceptedCount(acceptances?.acceptedCount ?? 0);
        setDbRequiredCount(acceptances?.requiredCount ?? session.max_players ?? 2);
        setDbMaxPlayers(session.max_players ?? 2);
        
        const wallets =
          acceptances?.players
            ?.map((p: any) =>
              normalizeWallet(typeof p === "string" ? p : p?.wallet ?? p?.player_wallet)
            )
            .filter(Boolean) ?? [];
        setAcceptedWallets(new Set(wallets));
        setHasLoaded(true);
      }
    } catch (err) {
      console.error("[RankedReadyGate] Refetch error:", err);
    }
  }, [roomPda]);

  // Load initial state and subscribe to changes
  useEffect(() => {
    if (!roomPda || !enabled) return;

    refetch();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`ready-gate-${roomPda}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          const newData = payload.new as { p1_ready?: boolean; p2_ready?: boolean };
          if (typeof newData.p1_ready === "boolean") setP1Ready(newData.p1_ready);
          if (typeof newData.p2_ready === "boolean") setP2Ready(newData.p2_ready);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomPda, enabled, refetch]);


  // STEP 4: Poll immediately for ranked games (not only when iAmReady)
  // This ensures we detect opponent acceptance even before we accept
  const pollForAcceptances = useCallback(async () => {
    if (!roomPda) return;

    try {
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error) {
        console.warn("[RankedReadyGate] Poll error:", error);
        return;
      }

      // Update acceptedWallets from response
      const acceptances = resp?.acceptances;
      const wallets =
        acceptances?.players
          ?.map((p: any) =>
            normalizeWallet(typeof p === "string" ? p : p?.wallet ?? p?.player_wallet)
          )
          .filter(Boolean) ?? [];
      setAcceptedWallets(new Set(wallets));

      // Also update p1_ready/p2_ready from session as fallback
      const session = resp?.session;
      const debug = resp?.debug;
      if (session) {
        const newP1Ready = session.p1_ready ?? false;
        const newP2Ready = session.p2_ready ?? false;
        
        console.log("[RankedReadyGate] Poll result:", { 
          p1_ready: newP1Ready, 
          p2_ready: newP2Ready,
          acceptedCount: acceptances?.acceptedCount ?? 0,
          requiredCount: acceptances?.requiredCount ?? 2,
          bothAccepted: acceptances?.bothAccepted ?? false,
          status_int: session.status_int,
          participantsCount: debug?.participantsCount,
          max_players: session.max_players,
        });
        
        if (newP1Ready !== p1Ready) setP1Ready(newP1Ready);
        if (newP2Ready !== p2Ready) setP2Ready(newP2Ready);
        // AUTHORITATIVE DB state for leave/forfeit logic
        setDbStatusInt(session.status_int ?? 1);
        setDbParticipantsCount(debug?.participantsCount ?? session.participants?.length ?? 0);
        // DB-AUTHORITATIVE counts from game-session-get
        setDbAcceptedCount(acceptances?.acceptedCount ?? 0);
        setDbRequiredCount(acceptances?.requiredCount ?? session.max_players ?? 2);
        setDbMaxPlayers(session.max_players ?? 2);
      }
    } catch (err) {
      console.warn("[RankedReadyGate] Poll exception:", err);
    }
  }, [roomPda, p1Ready, p2Ready]);

  useEffect(() => {
    // STEP 4: Poll when ranked + enabled + not bothReady (do NOT wait for iAmReady)
    if (!isRanked || !enabled || bothReady || !roomPda) {
      return;
    }

    console.log("[RankedReadyGate] Starting polling for acceptances...");

    // Fire once immediately
    pollForAcceptances();

    const pollInterval = setInterval(pollForAcceptances, 1500); // Poll every 1.5 seconds

    return () => {
      console.log("[RankedReadyGate] Stopping poll");
      clearInterval(pollInterval);
    };
  }, [isRanked, enabled, bothReady, roomPda, pollForAcceptances]);

  // DB-AUTHORITATIVE dbReady: single source of truth for readiness gating
  // For ranked/private: acceptedCount >= requiredCount
  // For casual: always true (bypasses gate)
  const dbReady = isRanked ? dbAcceptedCount >= dbRequiredCount : true;

  // For casual games, return as if both are ready
  if (!isRanked) {
    return {
      iAmReady: true,
      opponentReady: true,
      bothReady: true,
      isSettingReady: false,
      showAcceptModal: false,
      acceptRules: async () => ({ success: true }),
      stakeLamports: 0,
      turnTimeSeconds: 0,
      isDataLoaded: true,
      refetch: async () => {},
      dbStatusInt: 2, // casual games are considered "active"
      dbParticipantsCount: 2, // casual games assume 2 players
      acceptedCount: 2,
      requiredCount: 2,
      participantsCount: 2,
      maxPlayers: 2,
      dbReady: true,
    };
  }

  return {
    iAmReady,
    opponentReady,
    bothReady,
    isSettingReady,
    showAcceptModal,
    acceptRules,
    stakeLamports,
    turnTimeSeconds,
    isDataLoaded: hasLoaded,
    refetch,
    dbStatusInt,
    dbParticipantsCount,
    acceptedCount: dbAcceptedCount,
    requiredCount: dbRequiredCount,
    participantsCount: dbParticipantsCount,
    maxPlayers: dbMaxPlayers,
    dbReady,
  };
}
