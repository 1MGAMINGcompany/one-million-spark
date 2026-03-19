/** Shape of the additive fields returned by prediction-submit */
export interface TradeResult {
  trade_order_id?: string;
  trade_status?: "filled" | "partial_fill" | "submitted" | "failed" | "requested" | string;
  requested_amount_usdc?: number;
  fee_usdc?: number;
  fee_bps?: number;
  net_amount_usdc?: number;
  /** Legacy / native path fields */
  entry_id?: string;
  error?: string;
}
