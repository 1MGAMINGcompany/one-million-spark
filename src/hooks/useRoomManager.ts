// Hook to create a room (creator stakes too; createRoom is payable)
export function useCreateRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // entryFeeInPol: "0.50"
  // gameId: 1=Chess, 2=Dominos, 3=Backgammon
  // turnTimeSeconds: 0 = no timer
  const createRoom = (
    entryFeeInPol: string,
    maxPlayers: number,
    isPrivate: boolean,
    gameId: number,
    turnTimeSeconds: number,
  ) => {
    if (!address) return;

    const entryFeeWei = parseEther(entryFeeInPol);

    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "createRoom",
      args: [entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds],
      value: entryFeeWei, // ✅ creator stakes same amount
      chain: polygon,
      account: address,
    });
  };

  return {
    createRoom,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}
