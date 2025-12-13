import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { 
  useCreateRoomV4, 
  useCancelRoomV4, 
  useApproveUsdtV4, 
  useUsdtAllowanceV4,
  useLatestRoomIdV4,
  usdtToUnits,
  getGameNameV4 
} from "@/hooks/useRoomManagerV4";
import { Loader2, AlertCircle, Wallet, CheckCircle2 } from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { ShareInviteDialog } from "@/components/ShareInviteDialog";
import { useNotificationPermission } from "@/hooks/useRoomEvents";

// Game ID mapping: Chess=1, Dominos=2, Backgammon=3
const GAME_IDS: Record<string, number> = {
  chess: 1,
  dominos: 2,
  backgammon: 3,
};

// Platform fee in basis points (500 = 5%)
const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in USDT
const MIN_ENTRY_FEE_USDT = 0.5;

const CreateRoom = () => {
  const { open: openWalletModal } = useWeb3Modal();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const [gameType, setGameType] = useState("chess");
  const [entryFee, setEntryFee] = useState("");
  const [players, setPlayers] = useState("2");
  const [roomType, setRoomType] = useState("public");
  const [turnTimeSec, setTurnTimeSec] = useState("10"); // Default: 10 seconds
  const [feeError, setFeeError] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdGameName, setCreatedGameName] = useState<string>("");
  const [approvalStep, setApprovalStep] = useState<'idle' | 'approved'>('idle');
  
  const { requestPermission } = useNotificationPermission();

  // USDT Approval hook (V4)
  const { 
    approve: approveUsdt, 
    isPending: isApprovePending, 
    isConfirming: isApproveConfirming, 
    isSuccess: isApproveSuccess,
    error: approveError,
    reset: resetApprove 
  } = useApproveUsdtV4();

  // Check current allowance (V4)
  const { data: currentAllowance, refetch: refetchAllowance } = useUsdtAllowanceV4(address as `0x${string}` | undefined);

  // Create room hook (V4 USDT-based)
  const { 
    createRoom, 
    isPending: isCreatePending, 
    isConfirming: isCreateConfirming, 
    isSuccess: isCreateSuccess, 
    error: createError, 
    reset: resetCreate 
  } = useCreateRoomV4();

  // Get latest room ID for fetching created room
  const { data: latestRoomId, refetch: refetchLatestRoomId } = useLatestRoomIdV4();
  
  // Cancel room hook
  const { 
    cancelRoom, 
    isPending: isCancelPending, 
    isConfirming: isCancelConfirming, 
    isSuccess: isCancelSuccess,
    reset: resetCancel 
  } = useCancelRoomV4();

  // Parse entry fee as number
  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUnits = usdtToUnits(entryFeeNum);

  // Check if we have sufficient allowance
  const hasSufficientAllowance = currentAllowance !== undefined && currentAllowance >= entryFeeUnits && entryFeeNum > 0;

  // Validate entry fee on change
  useEffect(() => {
    if (!entryFee) {
      setFeeError(null);
      return;
    }
    if (isNaN(entryFeeNum) || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      setFeeError(`Entry fee must be at least $${MIN_ENTRY_FEE_USDT} USDT`);
    } else {
      setFeeError(null);
    }
  }, [entryFee, entryFeeNum]);

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      play('ui_click');
      toast({
        title: "USDT Approved!",
        description: "You can now create the room.",
      });
      setApprovalStep('approved');
      resetApprove();
      refetchAllowance();
    }
  }, [isApproveSuccess, play, toast, resetApprove, refetchAllowance]);

  // Handle approval error
  useEffect(() => {
    if (approveError) {
      toast({
        title: "Approval Failed",
        description: approveError.message || "Failed to approve USDT",
        variant: "destructive",
      });
      resetApprove();
    }
  }, [approveError, toast, resetApprove]);

  // Handle create room success
  useEffect(() => {
    if (isCreateSuccess) {
      play('room_create');
      const isPrivate = roomType === "private";
      const gameName = getGameNameV4(GAME_IDS[gameType] || 1);
      
      // Request notification permission for room events
      requestPermission();
      
      // Refetch latest room ID to get the created room
      refetchLatestRoomId().then((result) => {
        if (result.data && result.data > 0n) {
          const roomId = result.data.toString();
          
          if (isPrivate) {
            setCreatedRoomId(roomId);
            setCreatedGameName(gameName);
            setShowShareDialog(true);
            toast({
              title: "Private Room Created!",
              description: "Share the invite link with friends to play.",
            });
          } else {
            toast({
              title: "Room Created!",
              description: "Your game room has been created. Redirecting to room list...",
            });
            setTimeout(() => {
              navigate("/room-list?refresh=1");
            }, 1500);
          }
        }
      });
      
      // Reset form
      setEntryFee("");
      setPlayers("2");
      setTurnTimeSec("10");
      setApprovalStep('idle');
      resetCreate();
    }
  }, [isCreateSuccess, play, toast, resetCreate, refetchLatestRoomId, navigate, roomType, gameType, requestPermission]);

  // Handle create room error
  useEffect(() => {
    if (createError) {
      toast({
        title: "Transaction Failed",
        description: createError.message || "Failed to create room",
        variant: "destructive",
      });
      resetCreate();
    }
  }, [createError, toast, resetCreate]);

  // Handle cancel room success
  useEffect(() => {
    if (isCancelSuccess) {
      toast({
        title: "Room Cancelled",
        description: "Your room has been cancelled.",
      });
      resetCancel();
    }
  }, [isCancelSuccess, toast, resetCancel]);

  const handleApproveUsdt = () => {
    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      toast({
        title: "Invalid Entry Fee",
        description: `Minimum entry fee is $${MIN_ENTRY_FEE_USDT} USDT`,
        variant: "destructive",
      });
      return;
    }
    play('ui_click');
    approveUsdt(entryFeeNum);
  };

  const handleCreateRoom = () => {
    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      toast({
        title: "Invalid Entry Fee",
        description: `Minimum entry fee is $${MIN_ENTRY_FEE_USDT} USDT`,
        variant: "destructive",
      });
      return;
    }

    play('ui_click');
    
    const maxPlayers = parseInt(players);
    const isPrivate = roomType === "private";
    const gameId = GAME_IDS[gameType] || 1;
    const turnTime = parseInt(turnTimeSec);
    
    createRoom(entryFeeNum, maxPlayers, isPrivate, PLATFORM_FEE_BPS, gameId, turnTime);
  };

  const isApproveLoading = isApprovePending || isApproveConfirming;
  const isCreateLoading = isCreatePending || isCreateConfirming;
  const isCancelLoading = isCancelPending || isCancelConfirming;

  const getApproveButtonText = () => {
    if (isApprovePending) return "Confirm in Wallet...";
    if (isApproveConfirming) return "Approving...";
    return "Approve USDT";
  };

  const getCreateButtonText = () => {
    if (isCreatePending) return "Confirm in Wallet...";
    if (isCreateConfirming) return "Creating Room...";
    return "Create Room";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-6 text-center">
          Create Game Room
        </h1>

        <form className="space-y-5">
          {/* Game Type */}
          <div className="space-y-2">
            <Label htmlFor="gameType">Game Type</Label>
            <Select value={gameType} onValueChange={setGameType} disabled={isApproveLoading || isCreateLoading}>
              <SelectTrigger id="gameType" className="w-full">
                <SelectValue placeholder="Select game" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chess">Chess</SelectItem>
                <SelectItem value="dominos">Dominos</SelectItem>
                <SelectItem value="backgammon">Backgammon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Fee (USDT) */}
          <div className="space-y-2">
            <Label htmlFor="entryFee">Entry Fee (USDT)</Label>
            <div className="flex-1 space-y-1">
              <Input
                id="entryFee"
                type="number"
                placeholder="0.50"
                min={MIN_ENTRY_FEE_USDT}
                step="0.1"
                value={entryFee}
                onChange={(e) => {
                  setEntryFee(e.target.value);
                  // Reset approval step if fee changes
                  if (approvalStep === 'approved') {
                    setApprovalStep('idle');
                  }
                }}
                disabled={isApproveLoading || isCreateLoading}
                className={feeError ? "border-destructive" : ""}
              />
              {feeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {feeError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Minimum $0.50 USDT
              </p>
            </div>
          </div>

          {/* Number of Players */}
          <div className="space-y-2">
            <Label htmlFor="players">Number of Players</Label>
            <Select value={players} onValueChange={setPlayers} disabled={isApproveLoading || isCreateLoading}>
              <SelectTrigger id="players" className="w-full">
                <SelectValue placeholder="Select players" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Players</SelectItem>
                <SelectItem value="3">3 Players</SelectItem>
                <SelectItem value="4">4 Players</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time per Turn */}
          <div className="space-y-2">
            <Label htmlFor="turnTime">Time per Turn</Label>
            <Select value={turnTimeSec} onValueChange={setTurnTimeSec} disabled={isApproveLoading || isCreateLoading}>
              <SelectTrigger id="turnTime" className="w-full">
                <SelectValue placeholder="Select turn time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 sec</SelectItem>
                <SelectItem value="10">10 sec</SelectItem>
                <SelectItem value="15">15 sec</SelectItem>
                <SelectItem value="0">Unlimited</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <Label>Room Type</Label>
            <RadioGroup 
              value={roomType} 
              onValueChange={setRoomType} 
              className="flex gap-6"
              disabled={isApproveLoading || isCreateLoading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="public" />
                <Label htmlFor="public" className="font-normal cursor-pointer">
                  Public
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="font-normal cursor-pointer">
                  Private
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Wallet Connection */}
          {!isConnected && (
            <Button 
              type="button" 
              className="w-full" 
              size="lg" 
              onClick={() => openWalletModal()}
            >
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          )}

          {/* Two-Step Process: Approve USDT → Create Room */}
          {isConnected && (
            <div className="space-y-3">
              {/* Step 1: Approve USDT */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                variant={hasSufficientAllowance ? "outline" : "default"}
                onClick={handleApproveUsdt}
                disabled={isApproveLoading || isCreateLoading || !entryFee || !!feeError || hasSufficientAllowance}
              >
                {isApproveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {getApproveButtonText()}
                  </>
                ) : hasSufficientAllowance ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                    USDT Approved
                  </>
                ) : (
                  "Step 1: Approve USDT"
                )}
              </Button>

              {/* Step 2: Create Room */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                onClick={handleCreateRoom}
                disabled={isCreateLoading || isApproveLoading || !entryFee || !!feeError || !hasSufficientAllowance}
              >
                {isCreateLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {getCreateButtonText()}
                  </>
                ) : (
                  "Step 2: Create Room"
                )}
              </Button>

              {/* Instructions */}
              <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3 space-y-1">
                <p><strong>Step 1:</strong> Click "Approve USDT" once per entry fee amount.</p>
                <p><strong>Step 2:</strong> After approval confirms, click "Create Room".</p>
              </div>
            </div>
          )}
        </form>
      </div>
      
      {/* Share Dialog for Private Rooms */}
      <ShareInviteDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        roomId={createdRoomId || ""}
        gameName={createdGameName}
      />
    </div>
  );
};

export default CreateRoom;
