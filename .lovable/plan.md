

## Enhance prediction-health with Trading Wallet Balance Checks

### What Changes

**File: `supabase/functions/prediction-health/index.ts`**

Add three new checks after deriving the PM trading wallet address (line 100):

1. **USDC.e balance** — `balanceOf` on bridged USDC contract `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (6 decimals)
2. **Native USDC balance** — `balanceOf` on `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals)
3. **POL balance** — `eth_getBalance` (reuse existing `getMaticBalance`)
4. **CTF allowance** — `allowance(tradingWallet, CTF_EXCHANGE)` on USDC.e contract, where CTF Exchange = `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`

Add a helper `getErc20Balance(address, token)` and `getErc20Allowance(owner, spender, token)` using the same multi-RPC fallback pattern.

Add a summary `readyToBuy` boolean: true only when:
- Relayer has gas (POL > 0.001)
- Trading wallet has USDC.e > $1
- Trading wallet has POL > 0.001
- CTF allowance > 0
- CLOB reachable
- All PM credentials set

### New output fields

```
pm_trading_usdce_balance: "50.00"
pm_trading_native_usdc_balance: "0.00"  
pm_trading_pol_balance: "3.500000"
pm_trading_ctf_allowance: "1000000.00"
ready_to_buy: true/false
```

### No other files changed

