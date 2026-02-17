import { useCallback, useMemo } from "react";
import { useWallet as useSolanaWallet, useConnection } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignTransaction, useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import { PublicKey, Transaction, VersionedTransaction, Connection, SendOptions } from "@solana/web3.js";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

export function useWallet() {
  const {
    publicKey: adapterPublicKey,
    connected: adapterConnected,
    connecting,
    disconnect,
    wallet,
    connect,
    sendTransaction: adapterSendTransaction,
    signTransaction: adapterSignTransaction,
  } = useSolanaWallet();
  const { connection } = useConnection();

  // Privy auth state (guarded by app ID availability)
  const privyState = PRIVY_APP_ID ? usePrivyInner() : {
    authenticated: false,
    privyAddress: null,
    privyPublicKey: null,
    privyLogin: undefined,
    privyLogout: undefined,
    privySendTransaction: undefined,
    privySignTransaction: undefined,
  };

  // Determine which wallet path is active
  const isPrivyWallet = !adapterConnected && privyState.authenticated && !!privyState.privyAddress;

  // Combined publicKey: external wallet takes priority
  const publicKey = adapterPublicKey ?? privyState.privyPublicKey ?? null;

  // Combined sendTransaction
  const sendTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
    connectionArg: Connection,
    options?: SendOptions,
  ): Promise<string> => {
    if (adapterConnected && adapterSendTransaction) {
      return adapterSendTransaction(transaction, connectionArg, options);
    }
    if (isPrivyWallet && privyState.privySendTransaction) {
      return privyState.privySendTransaction(transaction);
    }
    throw new Error("No wallet available to send transaction");
  }, [adapterConnected, adapterSendTransaction, isPrivyWallet, privyState.privySendTransaction]);

  // Combined signTransaction
  const signTransaction = useCallback(async <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> => {
    if (adapterConnected && adapterSignTransaction) {
      return adapterSignTransaction(transaction);
    }
    if (isPrivyWallet && privyState.privySignTransaction) {
      return privyState.privySignTransaction(transaction) as Promise<T>;
    }
    throw new Error("No wallet available to sign transaction");
  }, [adapterConnected, adapterSignTransaction, isPrivyWallet, privyState.privySignTransaction]);

  /**
   * Programmatic reconnect for recovery scenarios (e.g., in-app browser disconnect)
   */
  const reconnect = useCallback(async (): Promise<boolean> => {
    if (wallet?.adapter) {
      try {
        console.log("[Wallet] Attempting reconnect via adapter...");
        await wallet.adapter.connect();
        console.log("[Wallet] Reconnect successful");
        return true;
      } catch (e) {
        console.error("[Wallet] Reconnect failed:", e);
        return false;
      }
    }
    if (connect) {
      try {
        console.log("[Wallet] Attempting reconnect via connect()...");
        await connect();
        console.log("[Wallet] Reconnect via connect() successful");
        return true;
      } catch (e) {
        console.error("[Wallet] Reconnect via connect() failed:", e);
        return false;
      }
    }
    console.warn("[Wallet] No wallet adapter or connect function available");
    return false;
  }, [wallet, connect]);

  // Combined state
  const isConnected = adapterConnected || (privyState.authenticated && !!privyState.privyAddress);
  const address = publicKey?.toBase58() ?? null;

  return {
    address,
    publicKey,
    isConnected,
    connected: isConnected,
    isConnecting: connecting,
    disconnect,
    wallet,
    connection,
    connect,
    reconnect,
    sendTransaction,
    signTransaction,
    isPrivyWallet,
    privyLogin: privyState.privyLogin,
    privyLogout: privyState.privyLogout,
  };
}

/** Inner hook that calls usePrivy + Privy Solana hooks – only invoked when PRIVY_APP_ID exists */
function usePrivyInner() {
  const { authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { signTransaction: privySignTx } = useSignTransaction();

  // Find the Privy embedded wallet from linked accounts
  const linkedSolanaWallet = user?.linkedAccounts?.find(
    (a: any) => a.type === "wallet" && a.chainType === "solana"
  ) as any;

  const privyAddress: string | null = linkedSolanaWallet?.address ?? (wallets.length > 0 ? wallets[0].address : null);

  const privyPublicKey = useMemo(() => {
    if (!privyAddress) return null;
    try {
      return new PublicKey(privyAddress);
    } catch {
      return null;
    }
  }, [privyAddress]);

  // Get the first connected Privy wallet for signing
  const connectedPrivyWallet = wallets.length > 0 ? wallets[0] : undefined;

  // Wrap Privy's signAndSendTransaction to match adapter interface
  const privySendTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
  ): Promise<string> => {
    if (!connectedPrivyWallet) throw new Error("Privy wallet not available");

    // Serialize transaction to bytes
    const txBytes = transaction.serialize();

    console.log("[Wallet/Privy] Sending transaction via Privy signAndSendTransaction...");
    const result = await signAndSendTransaction({
      transaction: txBytes,
      wallet: connectedPrivyWallet,
    });

    // result.signature may be a string or object with hash
    const sig = typeof result === 'string' ? result : (result as any).signature ?? (result as any).hash ?? '';
    console.log("[Wallet/Privy] Transaction sent, signature:", sig);
    return sig;
  }, [connectedPrivyWallet, signAndSendTransaction]);

  // Wrap Privy's signTransaction
  const privySignTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
  ): Promise<Transaction | VersionedTransaction> => {
    if (!connectedPrivyWallet) throw new Error("Privy wallet not available");

    const txBytes = transaction.serialize();

    console.log("[Wallet/Privy] Signing transaction via Privy signTransaction...");
    const result = await privySignTx({
      transaction: txBytes,
      wallet: connectedPrivyWallet,
    });

    // Deserialize the signed transaction back
    const signedBytes = result.signedTransaction;
    try {
      return VersionedTransaction.deserialize(signedBytes);
    } catch {
      return Transaction.from(signedBytes);
    }
  }, [connectedPrivyWallet, privySignTx]);

  return {
    authenticated,
    privyAddress,
    privyPublicKey,
    privyLogin: login,
    privyLogout: logout,
    privySendTransaction: connectedPrivyWallet ? privySendTransaction : undefined,
    privySignTransaction: connectedPrivyWallet ? privySignTransaction : undefined,
  };
}
