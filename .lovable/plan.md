

# Add "Already have a wallet?" Button to Quick Match

## Overview

Add a small, sleek secondary button below the Privy login button on the Quick Match page. When tapped, it expands to reveal the existing `ConnectWalletGate` wallet picker (Phantom / Solflare / Backpack).

## Changes

### File: `src/pages/QuickMatch.tsx`

**1. Add import** for `ConnectWalletGate`, `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, and `Wallet` icon.

**2. Add a ref** to control the Collapsible open state: `const [walletOpen, setWalletOpen] = useState(false)`.

**3. Update the not-connected CTA block** (lines 390-394) to add the secondary button:

```
{!isConnected ? (
  <div className="text-center space-y-3">
    <p className="text-sm text-muted-foreground">{t("quickMatch.connectFirst")}</p>
    <PrivyLoginButton />
    
    {/* Secondary: external wallet */}
    <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
      <CollapsibleTrigger asChild>
        <button className="mt-2 w-full inline-flex items-center justify-center gap-2 
          rounded-lg border border-primary/40 px-4 py-2.5 text-xs font-medium 
          text-muted-foreground hover:text-primary hover:border-primary 
          transition-all duration-200">
          <Wallet size={14} />
          {t("wallet.alreadyHaveWallet")}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <ConnectWalletGate />
      </CollapsibleContent>
    </Collapsible>
  </div>
) : ( ... )}
```

The button uses an outline style with gold/primary border, small text, and a wallet icon -- visually subordinate to the primary Privy button.

### File: `src/i18n/locales/en.json` (and all 9 other locale files)

Add one new key under the `wallet` section:

| Key | English |
|-----|---------|
| `wallet.alreadyHaveWallet` | `"Already have a wallet? Connect Phantom / Solflare / Backpack"` |

Translations for all 10 locales.

## What This Does NOT Touch

- No game logic, matchmaking, timers, or Solana program changes
- No changes to `ConnectWalletGate` internals
- No auto-connect behavior (user must explicitly select a wallet)
- No changes to the connected state UI (Find Match button)

## Files Modified

| File | Change |
|------|--------|
| `src/pages/QuickMatch.tsx` | Add wallet collapsible with styled button in not-connected state |
| `src/i18n/locales/*.json` (10 files) | Add `wallet.alreadyHaveWallet` key |

