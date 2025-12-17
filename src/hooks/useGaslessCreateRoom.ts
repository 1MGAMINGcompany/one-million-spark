// Stub hooks for gasless room operations - Solana migration
import { useState, useCallback } from "react";

export const GASLESS_ENABLED = false;

export function useGaslessCreateRoom() {
  return {
    createRoomGasless: async (...args: any[]) => { throw new Error("Solana pending"); },
    isBusy: false, isPending: false, isConfirming: false, isSuccess: false, error: null, reset: () => {}
  };
}

export function useGaslessJoinRoom() {
  return {
    joinRoomGasless: async (...args: any[]) => { throw new Error("Solana pending"); },
    isBusy: false, isPending: false, isConfirming: false, isSuccess: false, error: null, reset: () => {}
  };
}

export function useGaslessCancelRoom() {
  return {
    cancelRoomGasless: async (...args: any[]) => { throw new Error("Solana pending"); },
    isBusy: false, isPending: false, isConfirming: false, isSuccess: false, error: null, reset: () => {}
  };
}

export function useGaslessFinishGame() {
  return {
    finishGameGasless: async (...args: any[]) => { throw new Error("Solana pending"); },
    isBusy: false, isPending: false, isConfirming: false, isSuccess: false, error: null, reset: () => {}
  };
}
