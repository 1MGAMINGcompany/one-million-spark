// Transaction error logging utility

interface TxError {
  name?: string;
  message?: string;
  shortMessage?: string;
  code?: string | number;
  cause?: { message?: string };
  status?: number;
  details?: string;
  metaMessages?: string[];
}

interface CreateRoomDebugContext {
  chainId?: string;
  walletAddress?: string;
  contractAddress?: string;
  functionName?: string;
  params?: {
    entryFeeUnits: string;
    maxPlayers: number;
    isPrivate: boolean;
    platformFeeBps: number;
    gameId: number;
    turnTimeSec: number;
  };
  usdtTokenAddress?: string;
  stakeRaw?: string;
  stakeFormatted?: string;
}

/**
 * Logs Create Room failure with comprehensive debug info
 */
export function logCreateRoomDebug(context: CreateRoomDebugContext, error: unknown): void {
  const err = error as TxError;
  
  console.group('CREATE_ROOM_FAILURE_DEBUG');
  console.log('Chain ID:', context.chainId);
  console.log('Wallet Address:', context.walletAddress);
  console.log('Contract Address:', context.contractAddress);
  console.log('Function:', context.functionName);
  console.log('Parameters:', context.params);
  console.log('USDT Token Address:', context.usdtTokenAddress);
  console.log('Stake Amount (raw units):', context.stakeRaw);
  console.log('Stake Amount (formatted):', context.stakeFormatted);
  console.log('---');
  console.log('Error Name:', err?.name);
  console.log('Error Message:', err?.message);
  console.log('Error Short Message:', err?.shortMessage);
  console.log('Error Code:', err?.code);
  console.log('Error Details:', err?.details);
  console.log('Error Meta Messages:', err?.metaMessages);
  console.log('Error Cause:', err?.cause);
  console.error('TX_ERROR_FULL', error);
  console.groupEnd();
}

/**
 * Logs transaction error to console and returns formatted message for toast
 */
export function logTxError(context: string, error: unknown): { title: string; description: string } {
  // Log full error object to console
  console.error(`TX_ERROR_FULL [${context}]`, error);

  const err = error as TxError;
  
  // Extract error details
  const name = err?.name || 'Error';
  const shortMessage = err?.shortMessage;
  const message = err?.message || 'Unknown error';
  const code = err?.code;
  const causeMessage = err?.cause?.message;
  const status = err?.status;
  const details = err?.details;
  const metaMessages = err?.metaMessages;
  
  // Log extra viem/thirdweb fields if present
  if (details || metaMessages) {
    console.log(`TX_ERROR_EXTRA [${context}]`, { details, metaMessages });
  }
  
  // Check if user rejected
  const isUserRejection = message?.toLowerCase().includes('rejected') ||
                          message?.toLowerCase().includes('denied') ||
                          message?.toLowerCase().includes('cancelled') ||
                          message?.toLowerCase().includes('user refused');

  if (isUserRejection) {
    return {
      title: 'Transaction cancelled',
      description: 'No funds were moved. You can try again when ready.',
    };
  }

  // Build description with available details
  const displayMessage = shortMessage || message;
  const codeStr = code !== undefined ? String(code) : 'n/a';
  const statusStr = status ? ` | HTTP ${status}` : '';
  const causeStr = causeMessage ? ` | Cause: ${causeMessage}` : '';
  
  const description = `${displayMessage} (code: ${codeStr}${statusStr}${causeStr})`;

  return {
    title: `Transaction failed: ${name}`,
    description,
  };
}

/**
 * Check if error is a user rejection
 */
export function isUserRejectionError(error: unknown): boolean {
  const message = (error as TxError)?.message?.toLowerCase() || '';
  return message.includes('rejected') ||
         message.includes('denied') ||
         message.includes('cancelled') ||
         message.includes('user refused');
}
