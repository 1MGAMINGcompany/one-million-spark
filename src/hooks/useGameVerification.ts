import { useCallback, useState } from "react";
import { useSignMessage, useAccount } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { polygon } from "wagmi/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI } from "@/contracts/roomManager";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { keccak256, encodePacked, recoverMessageAddress } from "viem";

export interface GameResult {
  roomId: bigint;
  winner: `0x${string}`;
  gameType: "chess" | "dominos" | "backgammon";
  finalState: string; // FEN for chess, board state hash for others
  timestamp: number;
}

export interface SignedGameResult {
  result: GameResult;
  signature: `0x${string}`;
  signer: `0x${string}`;
}

// Create a deterministic message hash for the game result
export function createResultMessage(result: GameResult): string {
  return `1M Gaming Result Verification

Room ID: ${result.roomId.toString()}
Winner: ${result.winner}
Game: ${result.gameType}
State: ${result.finalState}
Timestamp: ${result.timestamp}

By signing this message, I confirm this game result is accurate.`;
}

// Create a hash of the result for on-chain verification
export function createResultHash(result: GameResult): `0x${string}` {
  return keccak256(
    encodePacked(
      ["uint256", "address", "string", "string", "uint256"],
      [result.roomId, result.winner, result.gameType, result.finalState, BigInt(result.timestamp)]
    )
  );
}

interface UseGameVerificationOptions {
  roomId: bigint;
  gameType: "chess" | "dominos" | "backgammon";
  onResultVerified?: () => void;
}

export function useGameVerification({
  roomId,
  gameType,
  onResultVerified,
}: UseGameVerificationOptions) {
  const { toast } = useToast();
  const { play } = useSound();
  const { address } = useAccount();

  const [mySignedResult, setMySignedResult] = useState<SignedGameResult | null>(null);
  const [opponentSignedResult, setOpponentSignedResult] = useState<SignedGameResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [disputeStatus, setDisputeStatus] = useState<"none" | "pending" | "resolved">("none");

  // Sign message hook
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  // Contract write for submitting verified result
  const { writeContract, data: hash, isPending: isSubmitting, error: submitError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  // Sign a game result
  const signGameResult = useCallback(
    async (winner: `0x${string}`, finalState: string): Promise<SignedGameResult | null> => {
      if (!address) {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet to sign the game result.",
          variant: "destructive",
        });
        return null;
      }

      const result: GameResult = {
        roomId,
        winner,
        gameType,
        finalState,
        timestamp: Math.floor(Date.now() / 1000),
      };

      try {
        const message = createResultMessage(result);
        console.log("[GameVerification] Signing result:", message);

        const signature = await signMessageAsync({ message, account: address });

        const signedResult: SignedGameResult = {
          result,
          signature: signature as `0x${string}`,
          signer: address,
        };

        setMySignedResult(signedResult);
        
        toast({
          title: "Result Signed",
          description: "Your game result has been signed. Share with opponent for verification.",
        });

        return signedResult;
      } catch (error) {
        console.error("[GameVerification] Signing failed:", error);
        toast({
          title: "Signing Failed",
          description: "Failed to sign the game result. Please try again.",
          variant: "destructive",
        });
        return null;
      }
    },
    [address, roomId, gameType, signMessageAsync, toast]
  );

  // Verify an opponent's signed result
  const verifySignature = useCallback(
    async (signedResult: SignedGameResult): Promise<boolean> => {
      try {
        const message = createResultMessage(signedResult.result);
        
        const recoveredAddress = await recoverMessageAddress({
          message,
          signature: signedResult.signature,
        });

        const isValid = recoveredAddress.toLowerCase() === signedResult.signer.toLowerCase();
        
        console.log("[GameVerification] Signature verification:", {
          recovered: recoveredAddress,
          claimed: signedResult.signer,
          isValid,
        });

        return isValid;
      } catch (error) {
        console.error("[GameVerification] Verification failed:", error);
        return false;
      }
    },
    []
  );

  // Receive and verify opponent's signed result
  const receiveOpponentResult = useCallback(
    async (signedResult: SignedGameResult): Promise<boolean> => {
      setIsVerifying(true);

      try {
        const isValid = await verifySignature(signedResult);

        if (isValid) {
          setOpponentSignedResult(signedResult);
          toast({
            title: "Opponent Result Received",
            description: "Opponent's signed result has been verified.",
          });
          return true;
        } else {
          toast({
            title: "Invalid Signature",
            description: "The opponent's signature could not be verified.",
            variant: "destructive",
          });
          return false;
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [verifySignature, toast]
  );

  // Check if both players agree on the result
  const checkConsensus = useCallback((): boolean => {
    if (!mySignedResult || !opponentSignedResult) return false;

    const myWinner = mySignedResult.result.winner.toLowerCase();
    const opponentWinner = opponentSignedResult.result.winner.toLowerCase();

    return myWinner === opponentWinner;
  }, [mySignedResult, opponentSignedResult]);

  // Submit verified result to blockchain
  const submitVerifiedResult = useCallback(
    async (winner: `0x${string}`) => {
      if (!address) {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet to submit the result.",
          variant: "destructive",
        });
        return;
      }

      console.log("[GameVerification] Submitting verified result:", { roomId, winner });

      try {
        writeContract({
          address: ROOM_MANAGER_ADDRESS,
          abi: ROOM_MANAGER_ABI,
          functionName: "finishRoom",
          args: [roomId, winner],
          account: address,
          chain: polygon,
        });
      } catch (error) {
        console.error("[GameVerification] Submit failed:", error);
        toast({
          title: "Submission Failed",
          description: "Failed to submit the game result on-chain.",
          variant: "destructive",
        });
      }
    },
    [address, roomId, writeContract, toast]
  );

  // Handle dispute - when players disagree on result
  const initiateDispute = useCallback(
    async (myClaimedResult: SignedGameResult) => {
      setDisputeStatus("pending");
      
      toast({
        title: "Dispute Initiated",
        description: "A dispute has been opened. Both signed results will be reviewed.",
      });

      // Store dispute evidence
      const disputeData = {
        roomId: roomId.toString(),
        gameType,
        myResult: myClaimedResult,
        opponentResult: opponentSignedResult,
        timestamp: Date.now(),
      };

      // Save to localStorage for persistence
      const key = `dispute_${roomId}`;
      localStorage.setItem(key, JSON.stringify(disputeData));

      console.log("[GameVerification] Dispute data saved:", disputeData);
    },
    [roomId, gameType, opponentSignedResult, toast]
  );

  // Export signed result for sharing
  const exportSignedResult = useCallback((): string | null => {
    if (!mySignedResult) return null;
    return JSON.stringify(mySignedResult);
  }, [mySignedResult]);

  // Import opponent's signed result from string
  const importSignedResult = useCallback(
    async (jsonString: string): Promise<boolean> => {
      try {
        const signedResult = JSON.parse(jsonString) as SignedGameResult;
        
        // Convert roomId back to bigint
        signedResult.result.roomId = BigInt(signedResult.result.roomId);
        
        return await receiveOpponentResult(signedResult);
      } catch (error) {
        console.error("[GameVerification] Import failed:", error);
        toast({
          title: "Import Failed",
          description: "Failed to parse the signed result. Please check the format.",
          variant: "destructive",
        });
        return false;
      }
    },
    [receiveOpponentResult, toast]
  );

  return {
    // State
    mySignedResult,
    opponentSignedResult,
    isVerifying,
    isSigning,
    isSubmitting: isSubmitting || isConfirming,
    isConfirmed,
    disputeStatus,
    hasConsensus: checkConsensus(),

    // Actions
    signGameResult,
    receiveOpponentResult,
    verifySignature,
    submitVerifiedResult,
    initiateDispute,
    exportSignedResult,
    importSignedResult,
  };
}
