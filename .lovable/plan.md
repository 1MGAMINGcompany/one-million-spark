

# Fix: Android MWA Connect + iOS Clear Instructions

## Two Issues to Fix

### 1. Android: MWA `connect()` call missing
The `handleMWAConnect()` in both files only calls `select()` but never calls `connect()`. This means the Android system wallet chooser never actually opens. We need to add an explicit `connect()` call after `select()`.

### 2. iOS: No clear instructions for iPhone users
When an iOS user taps a wallet button, they currently get a generic "not detected" modal. iOS doesn't have MWA, so users must open the site inside the wallet's built-in browser. The current UI doesn't make this clear enough. We'll add iOS-specific guidance directly in the wallet picker dialog.

---

## Files Changed

### 1. `src/components/ConnectWalletGate.tsx`

**Fix MWA connect** -- add `connect()` after `select()` in `handleMWAConnect`:
```typescript
const handleMWAConnect = () => {
  const mwaWallet = wallets.find(w =>
    w.adapter.name.toLowerCase().includes('mobile wallet adapter')
  );
  if (mwaWallet) {
    select(mwaWallet.adapter.name);
    connect().catch(() => {});  // <-- ADD THIS
    setDialogOpen(false);
  }
};
```

**Add iOS instructions section** in the wallet picker dialog -- after the wallet buttons, show a clear iOS-specific section:
- Styled info box explaining: "On iPhone, open this site inside your wallet app's browser"
- Step 1: Open Phantom/Solflare app
- Step 2: Tap the browser/globe icon
- Step 3: Navigate to this site
- Deep link buttons to open directly in Phantom or Solflare browser

**Differentiate the "open in wallet browser" section** -- currently it shows for all mobile users identically. Change it to:
- iOS: Show a prominent blue info box with clear step-by-step instructions + deep link buttons labeled "Open in Phantom Browser" / "Open in Solflare Browser"
- Android: Keep the existing subtle "Or open in wallet browser" fallback section

### 2. `src/components/WalletButton.tsx`

**Fix MWA connect** -- `handleMWAConnect` calls `handleSelectWallet(mwaWallet.adapter.name)` which goes through the full flow. But `handleSelectWallet` doesn't call `connect()` either (line 207 just does `select()` then `setDialogOpen(false)`). Add `connect().catch(() => {})` after the `select()` call on line 207.

**Add iOS instructions section** -- same as ConnectWalletGate: replace the generic "Or open in wallet browser" section with an iOS-specific informational panel when `isIOS` is true, with clear step-by-step guidance and deep link buttons.

### 3. `src/components/WalletNotDetectedModal.tsx`

**Improve iOS messaging** -- when shown on iOS, update the description to say something like "iPhone browsers can't connect directly to wallet apps. Open this site in your wallet's built-in browser instead." Make the primary button say "Open in [Wallet] Browser" instead of the generic "Open Wallet App".

---

## Technical Details

### WalletButton.tsx -- `handleSelectWallet` fix (line 207):
```typescript
select(selectedWallet.adapter.name);
connect().catch(() => {});  // ADD: explicit connect call
setDialogOpen(false);
```

### iOS section in both wallet picker dialogs:
```typescript
{isIOS && !isInWalletBrowser && (
  <div className="border-t border-border pt-3 mt-1">
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
      <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
        {t("wallet.iosInstructions")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("wallet.iosInstructionsDetail")}
      </p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => handleOpenInWallet('phantom')} ...>
        Open in Phantom
      </Button>
      <Button onClick={() => handleOpenInWallet('solflare')} ...>
        Open in Solflare
      </Button>
    </div>
  </div>
)}
```

### Android section (kept as-is, subtle fallback):
```typescript
{isAndroid && !isInWalletBrowser && (
  <div className="border-t border-border pt-3 mt-1">
    <p className="text-xs text-muted-foreground text-center mb-3">
      Or open in wallet browser:
    </p>
    ...
  </div>
)}
```

### Translation keys to add (all 11 languages):
- `wallet.iosInstructions` -- "iPhone requires opening in wallet browser"
- `wallet.iosInstructionsDetail` -- "iPhone browsers can't connect directly to wallet apps. Tap below to open this site inside your wallet's browser."
- `wallet.openInWalletBrowser` (already exists, reuse)

## What Users Will See
- **Android**: Tapping any wallet button or "Use Installed Wallet" now actually opens the system wallet chooser (MWA). The subtle "open in wallet browser" deep links remain as a fallback at the bottom.
- **iOS**: A clear blue info panel explains that iPhones need to open the site in the wallet's browser, with prominent "Open in Phantom Browser" and "Open in Solflare Browser" buttons.
- **Desktop**: No changes.

