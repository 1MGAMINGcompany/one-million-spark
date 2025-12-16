// Transaction error logging utility

interface TxError {
  name?: string;
  message?: string;
  shortMessage?: string;
  code?: string | number;
  cause?: { message?: string };
  status?: number;
  details?: string;
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
