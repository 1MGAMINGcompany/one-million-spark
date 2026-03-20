ALTER TABLE public.prediction_trade_orders ADD COLUMN fee_tx_hash text;

CREATE UNIQUE INDEX idx_prediction_trade_orders_fee_tx_hash 
ON public.prediction_trade_orders (fee_tx_hash) 
WHERE fee_tx_hash IS NOT NULL;