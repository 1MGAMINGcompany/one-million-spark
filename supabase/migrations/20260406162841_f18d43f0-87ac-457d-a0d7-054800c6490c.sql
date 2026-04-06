ALTER TABLE operators ADD COLUMN purchase_tx_hash text;
CREATE UNIQUE INDEX idx_operators_purchase_tx_hash ON operators (purchase_tx_hash) WHERE purchase_tx_hash IS NOT NULL;