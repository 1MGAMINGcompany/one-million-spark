import { useState, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

export interface RematchSettings {
  gameType: string;
  stakeAmount: number;
  timePerTurn: number; // seconds, 0 = unlimited
  players: string[]; // wallet addresses
}

export interface RematchState {
  step: 1 | 2 | 3 | 4;
  settings: RematchSettings;
  rulesAccepted: boolean;
  newTermsAccepted: boolean;
  signature: string | null;
  isCreating: boolean;
  newRoomId: string | null;
  inviteLink: string | null;
  opponentStatus: 'pending' | 'accepted' | 'declined' | 'timeout';
}

const initialState: RematchState = {
  step: 1,
  settings: {
    gameType: '',
    stakeAmount: 1,
    timePerTurn: 60,
    players: [],
  },
  rulesAccepted: false,
  newTermsAccepted: false,
  signature: null,
  isCreating: false,
  newRoomId: null,
  inviteLink: null,
  opponentStatus: 'pending',
};

export function useRematch(gameType: string, previousPlayers: string[]) {
  const { address, publicKey } = useWallet();
  const { signMessage } = useSolanaWallet();
  const [state, setState] = useState<RematchState>({
    ...initialState,
    settings: {
      ...initialState.settings,
      gameType,
      players: previousPlayers,
    },
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openRematchModal = useCallback(() => {
    setState({
      ...initialState,
      settings: {
        ...initialState.settings,
        gameType,
        players: previousPlayers,
      },
    });
    setIsModalOpen(true);
  }, [gameType, previousPlayers]);

  const closeRematchModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const updateSettings = useCallback((updates: Partial<RematchSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  const setStep = useCallback((step: 1 | 2 | 3 | 4) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const setRulesAccepted = useCallback((accepted: boolean) => {
    setState(prev => ({ ...prev, rulesAccepted: accepted }));
  }, []);

  const setNewTermsAccepted = useCallback((accepted: boolean) => {
    setState(prev => ({ ...prev, newTermsAccepted: accepted }));
  }, []);

  const signRematchAgreement = useCallback(async () => {
    if (!publicKey || !address) {
      throw new Error('Wallet not connected');
    }

    if (!signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    const timestamp = Date.now();
    const message = `I agree to start a NEW ${state.settings.gameType} rematch with stake ${state.settings.stakeAmount} SOL and turn time ${state.settings.timePerTurn === 0 ? 'Unlimited' : `${state.settings.timePerTurn}s`}. I accept the rules and auto payout. Timestamp: ${timestamp}`;

    try {
      // Request signature from wallet using standard adapter
      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signatureBase58 = bs58.encode(signatureBytes);
      
      setState(prev => ({ ...prev, signature: signatureBase58 }));
      return signatureBase58;
    } catch (error) {
      console.error('Failed to sign rematch agreement:', error);
      throw error;
    }
  }, [publicKey, address, signMessage, state.settings]);

  const createRematchRoom = useCallback(async () => {
    setState(prev => ({ ...prev, isCreating: true }));

    try {
      // Generate a new room ID
      const newRoomId = `rematch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      // Generate invite link
      const baseUrl = window.location.origin;
      const inviteLink = `${baseUrl}/game/${state.settings.gameType.toLowerCase()}/${newRoomId}?rematch=true`;

      // Store rematch data in localStorage for persistence
      const rematchData = {
        roomId: newRoomId,
        settings: state.settings,
        signature: state.signature,
        creator: address,
        createdAt: Date.now(),
        status: 'waiting',
        acceptedPlayers: [address],
      };
      
      localStorage.setItem(`rematch_${newRoomId}`, JSON.stringify(rematchData));

      setState(prev => ({
        ...prev,
        isCreating: false,
        newRoomId,
        inviteLink,
      }));

      return { roomId: newRoomId, inviteLink };
    } catch (error) {
      setState(prev => ({ ...prev, isCreating: false }));
      throw error;
    }
  }, [state.settings, state.signature, address]);

  const acceptRematch = useCallback(async (roomId: string) => {
    const rematchDataStr = localStorage.getItem(`rematch_${roomId}`);
    if (!rematchDataStr) {
      throw new Error('Rematch not found');
    }

    const rematchData = JSON.parse(rematchDataStr);
    
    // Check if player is invited
    if (!rematchData.settings.players.includes(address)) {
      throw new Error('You are not invited to this rematch');
    }

    // Add player to accepted list
    if (!rematchData.acceptedPlayers.includes(address)) {
      rematchData.acceptedPlayers.push(address);
    }

    // Check if all players accepted
    const allAccepted = rematchData.settings.players.every(
      (p: string) => rematchData.acceptedPlayers.includes(p)
    );

    if (allAccepted) {
      rematchData.status = 'ready';
    }

    localStorage.setItem(`rematch_${roomId}`, JSON.stringify(rematchData));

    return { allAccepted, rematchData };
  }, [address]);

  const declineRematch = useCallback((roomId: string) => {
    const rematchDataStr = localStorage.getItem(`rematch_${roomId}`);
    if (rematchDataStr) {
      const rematchData = JSON.parse(rematchDataStr);
      rematchData.status = 'declined';
      localStorage.setItem(`rematch_${roomId}`, JSON.stringify(rematchData));
    }
  }, []);

  const getRematchData = useCallback((roomId: string) => {
    const rematchDataStr = localStorage.getItem(`rematch_${roomId}`);
    return rematchDataStr ? JSON.parse(rematchDataStr) : null;
  }, []);

  // Check for rematch invite from URL
  const checkRematchInvite = useCallback((roomId: string): { isRematch: boolean; data: any } => {
    const urlParams = new URLSearchParams(window.location.search);
    const isRematch = urlParams.get('rematch') === 'true';
    
    if (isRematch) {
      const data = getRematchData(roomId);
      return { isRematch: true, data };
    }
    
    return { isRematch: false, data: null };
  }, [getRematchData]);

  return {
    state,
    isModalOpen,
    openRematchModal,
    closeRematchModal,
    updateSettings,
    setStep,
    setRulesAccepted,
    setNewTermsAccepted,
    signRematchAgreement,
    createRematchRoom,
    acceptRematch,
    declineRematch,
    getRematchData,
    checkRematchInvite,
  };
}

// Time options for turn timer
export const TIME_OPTIONS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
  { value: 0, label: 'Unlimited' },
];

// Stake quick select options (in SOL)
export const STAKE_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];
